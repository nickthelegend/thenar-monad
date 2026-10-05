// The station's hands on Monad: the live GRASP deployment (TaskRegistry,
// GraspLog, LeafVerifier, FoundryMarket), the repository's own SQLite log, and
// the keys in .env.deployer. Every write here is a real signed transaction.
//
// One key holds the curator, anchorer and steward roles, as in the rest of
// the repo (PLAN G11), so every write goes through one queue: two concurrent
// sends from one account would race for the same nonce.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createPublicClient, createWalletClient, http, parseAbi, parseEventLogs, formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { CHAIN } from "../../../services/log/src/chain.ts";
import { LogStore } from "../../../services/log/src/store.ts";
import { anchorHead, LOG_ABI } from "../../../services/log/src/anchorer.ts";

export const ROOT = resolve(import.meta.dirname, "../../..");
export const EXPLORER = "https://testnet.monadscan.com";
// Keep enough behind for the next anchor even when a bounty drains the rest.
export const RESERVE = parseEther("0.05");
export const MAX_REWARD = parseEther("0.01");

function envFile(name) {
  try {
    return Object.fromEntries(
      readFileSync(resolve(ROOT, name), "utf8").split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
        .map((l) => [l.slice(0, l.indexOf("=")).trim(), l.slice(l.indexOf("=") + 1).trim()]),
    );
  } catch {
    return {};
  }
}
const contracts = envFile(".env.contracts");
const keys = envFile(".env.deployer");
export const ADDR = { log: contracts.GRASP_LOG, verifier: contracts.LEAF_VERIFIER, registry: contracts.TASK_REGISTRY, market: contracts.FOUNDRY_MARKET };

const REGISTRY_ABI = parseAbi([
  "function publish(bytes32 specHash, string uri, uint16 curatorBps, uint32 targetEpisodes) returns (uint256)",
  "function taskCount() view returns (uint256)",
  "function taskAt(uint256) view returns ((bytes32 specHash, address curator, string uri, uint16 curatorBps, uint32 targetEpisodes, uint64 publishedAt, bool open))",
  "function bySpecHash(bytes32) view returns (bool found, uint256 id)",
  "event TaskPublished(uint256 indexed id, bytes32 indexed specHash, address indexed curator, uint16 curatorBps, uint32 targetEpisodes, string uri)",
]);
export const VERIFIER_ABI = parseAbi([
  "function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)",
  "function episodeFacts(bytes preimage) pure returns (bytes32 taskId, uint64 worldSeed, bool success, uint16 qualityScore)",
]);
const MARKET_ABI = parseAbi([
  "function sealCorpus(uint256 taskId, uint256 anchorIndex, bytes32 corpusRoot, uint64 corpusSize, address[] contributors, uint256[] weights, uint128 price, address token) returns (uint256)",
  "function license(uint256 corpusId, uint256 termsId) payable returns (uint256)",
  "function withdraw()",
  "function termsCount() view returns (uint256)",
  "function termsAt(uint256) view returns ((bytes32 documentHash, string uri, uint64 publishedAt, bool retired))",
  "function corpusCount() view returns (uint256)",
  "function corpusAt(uint256) view returns (uint256 taskId, bytes32 corpusRoot, uint64 corpusSize, uint128 price, address token, bool open, uint256 contributors)",
  "function capTable(uint256) view returns (address[], uint256[], uint256)",
  "function credited(address) view returns (uint256)",
  "event CorpusSealed(uint256 indexed corpusId, uint256 indexed taskId, bytes32 indexed corpusRoot, uint64 corpusSize, uint256 contributors, uint128 price)",
  "event Licensed(uint256 indexed receiptId, uint256 indexed corpusId, address indexed buyer, uint256 amount, uint256 toCurator, uint256 toContributors, uint256 toProtocol)",
  "event ContributorPaid(uint256 indexed corpusId, address indexed who, uint256 amount)",
  "event Credited(address indexed who, uint256 amount)",
]);

export const pub = createPublicClient({ chain: CHAIN, transport: http(CHAIN.rpcUrls.default.http[0], { retryCount: 2, timeout: 20000 }) });
const curator = keys.DEPLOYER_PRIVATE_KEY ? privateKeyToAccount(keys.DEPLOYER_PRIVATE_KEY) : null;
const buyer = keys.BUYER_PRIVATE_KEY ? privateKeyToAccount(keys.BUYER_PRIVATE_KEY) : null;
const walletOf = (account) => createWalletClient({ account, chain: CHAIN, transport: http(CHAIN.rpcUrls.default.http[0], { timeout: 20000 }) });

export const configured = () => (!curator ? "No DEPLOYER_PRIVATE_KEY in .env.deployer at the repository root." : !ADDR.registry || !ADDR.log || !ADDR.market ? "No contract addresses in .env.contracts." : null);

// The log is the repository's own: the same .data/log.db the CLI anchors from.
process.env.THENAR_LOG_DB ??= resolve(ROOT, ".data/log.db");
export const store = new LogStore(process.env.THENAR_LOG_DB);

let queue = Promise.resolve();
/** Run chain writes one at a time. */
export function serial(fn) {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
}

/**
 * Send a contract write with a limit from estimation plus a tenth: Monad
 * charges the limit, not what is used, so a doubled limit doubles the cost.
 */
async function write(account, req) {
  // An explicit gas price, not EIP-1559's default max fee of about twice the
  // base fee: Monad reserves limit × max fee, so the default doubles what an
  // account must hold before it can send anything.
  const [gas, gasPrice] = await Promise.all([pub.estimateContractGas({ ...req, account }), pub.getGasPrice()]);
  const hash = await walletOf(account).writeContract({ ...req, gas: (gas * 11n) / 10n, gasPrice: (gasPrice * 105n) / 100n });
  const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60000 });
  if (receipt.status !== "success") throw new Error(`transaction ${hash} reverted`);
  return receipt;
}

export async function status() {
  const [block, balance, buyerBalance, head, taskCount] = await Promise.all([
    pub.getBlockNumber(),
    curator ? pub.getBalance({ address: curator.address }) : 0n,
    buyer ? pub.getBalance({ address: buyer.address }) : 0n,
    pub.readContract({ address: ADDR.log, abi: LOG_ABI, functionName: "anchorCount" }),
    pub.readContract({ address: ADDR.registry, abi: REGISTRY_ABI, functionName: "taskCount" }),
  ]);
  return {
    chainId: CHAIN.id,
    block: Number(block),
    curator: curator?.address ?? null,
    curatorBalance: formatEther(balance),
    buyer: buyer?.address ?? null,
    buyerBalance: formatEther(buyerBalance),
    anchors: Number(head),
    logSize: store.size(),
    tasks: Number(taskCount),
    contracts: ADDR,
    explorer: EXPLORER,
  };
}

// ---- tasks ------------------------------------------------------------------------

export async function taskOnChain(id) {
  const t = await pub.readContract({ address: ADDR.registry, abi: REGISTRY_ABI, functionName: "taskAt", args: [BigInt(id)] });
  return { id: Number(id), specHash: t.specHash, curator: t.curator, uri: t.uri, curatorBps: t.curatorBps, targetEpisodes: t.targetEpisodes, publishedAt: Number(t.publishedAt), open: t.open };
}

/** Publish a spec hash, or find it if it is already on chain. */
export function publishTask(specHash, targetEpisodes) {
  return serial(async () => {
    const [found, existing] = await pub.readContract({ address: ADDR.registry, abi: REGISTRY_ABI, functionName: "bySpecHash", args: [specHash] });
    if (found) return { id: Number(existing), txHash: null, blockNumber: null, already: true };
    const receipt = await write(curator, {
      address: ADDR.registry,
      abi: REGISTRY_ABI,
      functionName: "publish",
      // The spec is served by the station; the URI names it, it does not pretend to host it.
      args: [specHash, `urn:thenar:taskspec:${specHash}`, 1000, targetEpisodes],
    });
    const [ev] = parseEventLogs({ abi: REGISTRY_ABI, logs: receipt.logs, eventName: "TaskPublished" });
    return { id: Number(ev.args.id), txHash: receipt.transactionHash, blockNumber: Number(receipt.blockNumber), already: false };
  });
}

// ---- the log ------------------------------------------------------------------------

/**
 * Append a leaf and anchor the new head on GraspLog. The append is local and
 * durable; if the anchor then fails, the leaf stays in the log and the next
 * anchor covers it, so the failure is reported rather than thrown.
 */
export function appendAndAnchor(leaf, meta) {
  return serial(async () => {
    const index = store.append(leaf, meta);
    // anchorHead reads .env.deployer relative to the working directory.
    const cwd = process.cwd();
    process.chdir(ROOT);
    try {
      const a = await anchorHead(store, ADDR.log);
      return { index, anchor: a ? { index: a.index, root: a.root, size: a.size, txHash: a.txHash, blockNumber: a.blockNumber } : null, anchorError: null };
    } catch (e) {
      return { index, anchor: null, anchorError: e.shortMessage ?? e.message };
    } finally {
      process.chdir(cwd);
    }
  });
}

/** The inclusion proof for a leaf against the first on-chain anchor that covers it. */
export async function proofFor(leafIndex) {
  const count = Number(await pub.readContract({ address: ADDR.log, abi: LOG_ABI, functionName: "anchorCount" }));
  const at = (i) => pub.readContract({ address: ADDR.log, abi: LOG_ABI, functionName: "anchorAt", args: [BigInt(i)] });
  // Anchor sizes only grow, so the first anchor covering the leaf is a binary search away.
  let lo = 0, hi = count - 1, found = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const a = await at(mid);
    if (Number(a.size) > leafIndex) (found = { i: mid, a }), (hi = mid - 1);
    else lo = mid + 1;
  }
  if (!found) return null;
  const size = Number(found.a.size);
  if (store.root(size) !== found.a.root) throw new Error(`the local log disagrees with anchor ${found.i}; run \`pnpm log audit\``);
  const row = store.leafAt(leafIndex);
  return { anchorIndex: found.i, leafIndex, size, root: found.a.root, preimage: row.preimage, leaf: row.leaf, proof: store.inclusionProof(leafIndex, size) };
}

export const verifyLeaf = (p) =>
  pub.readContract({ address: ADDR.verifier, abi: VERIFIER_ABI, functionName: "verifyLeaf", args: [BigInt(p.anchorIndex), p.preimage, p.proof, BigInt(p.leafIndex)] });

// ---- money -----------------------------------------------------------------------------

/** Pay a contributor's bounty from the curator's wallet. */
export function payBounty(to, wei) {
  return serial(async () => {
    if (wei <= 0n) return null;
    if (wei > MAX_REWARD) throw new Error(`bounty above the ${formatEther(MAX_REWARD)} MON cap`);
    const balance = await pub.getBalance({ address: curator.address });
    if (balance < wei + RESERVE) throw new Error(`the curator holds ${formatEther(balance)} MON; paying ${formatEther(wei)} would leave less than the ${formatEther(RESERVE)} MON kept for anchoring`);
    const hash = await walletOf(curator).sendTransaction({ to, value: wei, gas: 21000n, gasPrice: ((await pub.getGasPrice()) * 105n) / 100n });
    const receipt = await pub.waitForTransactionReceipt({ hash, timeout: 60000 });
    if (receipt.status !== "success") throw new Error(`bounty ${hash} reverted`);
    return { txHash: hash, blockNumber: Number(receipt.blockNumber) };
  });
}

/**
 * Seal a task's corpus in FoundryMarket at the log's current anchor. The
 * contract ties a corpus to a whole anchor (every leaf below it, all tasks),
 * so the cap table is what names this task's contributors.
 */
export function sealCorpus(taskIndex, contributors, weights, priceWei) {
  return serial(async () => {
    const count = Number(await pub.readContract({ address: ADDR.log, abi: LOG_ABI, functionName: "anchorCount" }));
    const a = await pub.readContract({ address: ADDR.log, abi: LOG_ABI, functionName: "anchorAt", args: [BigInt(count - 1)] });
    const receipt = await write(curator, {
      address: ADDR.market,
      abi: MARKET_ABI,
      functionName: "sealCorpus",
      args: [BigInt(taskIndex), BigInt(count - 1), a.root, a.size, contributors, weights.map(BigInt), priceWei, "0x0000000000000000000000000000000000000000"],
    });
    const [ev] = parseEventLogs({ abi: MARKET_ABI, logs: receipt.logs, eventName: "CorpusSealed" });
    return { corpusId: Number(ev.args.corpusId), anchorIndex: count - 1, root: a.root, size: Number(a.size), txHash: receipt.transactionHash, blockNumber: Number(receipt.blockNumber) };
  });
}

export async function corpusOnChain(id) {
  const c = await pub.readContract({ address: ADDR.market, abi: MARKET_ABI, functionName: "corpusAt", args: [BigInt(id)] });
  const [who, weights, total] = await pub.readContract({ address: ADDR.market, abi: MARKET_ABI, functionName: "capTable", args: [BigInt(id)] });
  return { id, taskId: Number(c[0]), root: c[1], size: Number(c[2]), priceWei: c[3].toString(), price: formatEther(c[3]), token: c[4], open: c[5], contributors: who.map((a, i) => ({ address: a, weight: weights[i].toString() })), weightTotal: total.toString() };
}

async function liveTerms() {
  const n = Number(await pub.readContract({ address: ADDR.market, abi: MARKET_ABI, functionName: "termsCount" }));
  for (let i = n - 1; i >= 0; i--) {
    const t = await pub.readContract({ address: ADDR.market, abi: MARKET_ABI, functionName: "termsAt", args: [BigInt(i)] });
    if (!t.retired) return { id: i, uri: t.uri };
  }
  throw Object.assign(new Error("FoundryMarket has no live licence terms."), { status: 409 });
}

/**
 * Buy a licence to a corpus as the station's buyer account, topping it up
 * from the curator first when it cannot cover price and gas. The market pays
 * the curator, every contributor and the protocol inside this transaction.
 */
export function license(corpusId) {
  return serial(async () => {
    if (!buyer) throw new Error("No BUYER_PRIVATE_KEY in .env.deployer.");
    const c = await corpusOnChain(corpusId);
    if (!c.open) throw Object.assign(new Error(`Corpus ${corpusId} is closed to new licences.`), { status: 409 });
    const terms = await liveTerms();
    const price = BigInt(c.priceWei);
    const req = { address: ADDR.market, abi: MARKET_ABI, functionName: "license", args: [BigInt(corpusId), BigInt(terms.id)], value: price };
    let funded = null;
    // Monad reserves the whole gas limit up front, so the buyer needs the
    // price plus limit × gas price, not the gas it will actually burn.
    const [gas, gasPrice] = await Promise.all([pub.estimateContractGas({ ...req, account: buyer }), pub.getGasPrice()]);
    // The same limit and price write() will use, plus 2% for the price moving meanwhile.
    const need = price + (((gas * 11n) / 10n) * ((gasPrice * 105n) / 100n) * 102n) / 100n;
    const has = await pub.getBalance({ address: buyer.address });
    if (has < need) {
      const top = need - has;
      // Never send a transfer that cannot land: it would still burn its gas.
      const curatorHas = await pub.getBalance({ address: curator.address });
      const transferCost = 21000n * ((gasPrice * 105n) / 100n);
      if (curatorHas < top + transferCost)
        throw Object.assign(new Error(`The buyer needs ${formatEther(top)} MON more to pay ${formatEther(price)} MON plus gas, and the curator holds only ${formatEther(curatorHas)} MON. Top up the curator (${curator.address}) from the Monad faucet.`), { status: 402 });
      const hash = await walletOf(curator).sendTransaction({ to: buyer.address, value: top, gas: 21000n, gasPrice: (gasPrice * 105n) / 100n });
      const r = await pub.waitForTransactionReceipt({ hash, timeout: 60000 });
      if (r.status !== "success") throw new Error(`funding the buyer reverted: ${hash}`);
      funded = { txHash: hash, amount: formatEther(top) };
    }
    const receipt = await write(buyer, req);
    const logs = parseEventLogs({ abi: MARKET_ABI, logs: receipt.logs });
    const lic = logs.find((l) => l.eventName === "Licensed");
    return {
      receiptId: Number(lic.args.receiptId),
      buyer: buyer.address,
      terms,
      price: formatEther(price),
      toCurator: formatEther(lic.args.toCurator),
      toContributors: formatEther(lic.args.toContributors),
      toProtocol: formatEther(lic.args.toProtocol),
      paid: logs.filter((l) => l.eventName === "ContributorPaid").map((l) => ({ address: l.args.who, amount: formatEther(l.args.amount) })),
      credited: logs.filter((l) => l.eventName === "Credited").map((l) => ({ address: l.args.who, amount: formatEther(l.args.amount) })),
      funded,
      txHash: receipt.transactionHash,
      blockNumber: Number(receipt.blockNumber),
    };
  });
}

export const balanceOf = async (address) => formatEther(await pub.getBalance({ address }));
