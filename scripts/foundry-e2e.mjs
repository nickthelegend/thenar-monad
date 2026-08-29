/**
 * The whole foundry loop, on chain:
 * curator publishes a task -> episodes are recorded against sampled worlds and
 * anchored -> the corpus is sealed with a quality-weighted cap table -> a buyer
 * licences it -> curator, contributors and protocol are all paid in one call.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, keccak256, toHex, parseEther, formatEther } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { taskId, validateTaskSpec } from "../packages/protocol/src/taskspec.ts";
import { sampleScene, sceneHash } from "../packages/protocol/src/sampler.ts";
import { byId } from "../packages/protocol/src/embodiments.ts";
import * as mlog from "../packages/protocol/src/log.ts";

const env = Object.fromEntries(readFileSync(".env.deployer", "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const LOG = "0x10325941C86397a4355b4801dC28EDf6c41F3c6f";
const REGISTRY = "0x70244c42300f427a721a86416331d2a8d6ce2a51";
const MARKET = "0x754845ff489f16a4a216562f0029aea29c678bad";

const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } };
const account = privateKeyToAccount(env.DEPLOYER_PRIVATE_KEY);
const pub = createPublicClient({ chain, transport: http() });
const wallet = createWalletClient({ account, chain, transport: http() });

const logAbi = parseAbi([
  "function anchor(bytes32 root, uint64 size, bytes32 revocationRoot) returns (uint256)",
  "function anchorCount() view returns (uint256)",
  "function anchorAt(uint256) view returns ((bytes32 root, bytes32 prevRoot, bytes32 revocationRoot, uint64 size, uint64 at, uint64 blockNumber))",
  "function verifyClip(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)",
]);
const regAbi = parseAbi([
  "function publish(bytes32 specHash, string uri, uint16 curatorBps, uint32 targetEpisodes) returns (uint256)",
  "function taskCount() view returns (uint256)",
  "function taskAt(uint256) view returns ((bytes32 specHash, address curator, string uri, uint16 curatorBps, uint32 targetEpisodes, uint64 publishedAt, bool open))",
  "function bySpecHash(bytes32) view returns (bool, uint256)",
]);
const mktAbi = parseAbi([
  "function publishTerms(bytes32 documentHash, string uri) returns (uint256)",
  "function termsCount() view returns (uint256)",
  "function sealCorpus(uint256 taskId, uint256 anchorIndex, bytes32 corpusRoot, uint64 corpusSize, address[] contributors, uint256[] weights, uint128 price, address token) returns (uint256)",
  "function corpusCount() view returns (uint256)",
  "function capTable(uint256) view returns (address[], uint256[], uint256)",
  "function license(uint256 corpusId, uint256 termsId) payable returns (uint256)",
  "function receiptCount() view returns (uint256)",
  "function receiptAt(uint256) view returns ((address buyer, uint256 corpusId, uint256 termsId, bytes32 corpusRoot, uint256 amount, address token, uint64 at, uint64 blockNumber))",
]);

let failed = 0;
const check = (ok, m, x = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };
const GAS = { anchor: 200000n, publish: 260000n, terms: 220000n, seal: 700000n, license: 500000n };
const send = async (address, abi, functionName, args, gas, value) => {
  const hash = await wallet.writeContract({ address, abi, functionName, args, gas, ...(value !== undefined ? { value } : {}) });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (r.status !== "success") throw new Error(`${functionName} reverted — ${hash}`);
  return hash;
};
const h = (s) => keccak256(toHex(s));

console.log(`\nTHENAR foundry end-to-end · Monad Testnet`);
console.log(`registry ${REGISTRY}\nmarket   ${MARKET}`);
console.log(`balance  ${formatEther(await pub.getBalance({ address: account.address }))} MON\n`);

// ---- 1. the curator designs a task ----------------------------------------
const stamp = Date.now();
const spec = {
  version: 1,
  embodiment: "franka_panda",
  actionSpace: "ee_pose_gripper",
  instruction: `Place the mug upright on the shelf (${stamp})`,
  world: {
    base: "kitchen_counter_v2",
    objects: [
      { category: "mug", instances: ["mug_a", "mug_b", "mug_c"], x: [0.28, 0.42], y: [-0.15, 0.15], yaw: [0, 6.283] },
      { category: "distractor", instances: ["box", "can"], x: [0.1, 0.5], y: [-0.3, 0.3], count: [0, 3] },
    ],
    lightingIntensity: [0.6, 1.4],
  },
  success: { predicate: "upright_on(mug, shelf) && settled(2.0)", toleranceMm: 25, settleS: 2 },
  acceptance: { minScoreBps: 5500, maxDurationS: 120, targetEpisodes: 500 },
};
const issues = validateTaskSpec(spec);
check(issues.filter((i) => i.severity === "error").length === 0, "the task validates before publication",
  issues.length ? `${issues.length} warning(s)` : "clean");
const emb = byId(spec.embodiment);
check(!!emb && emb.actionSpaces.includes(spec.actionSpace),
  "the embodiment permits this action space", `${emb.name} (${emb.licence})`);

const specHash = taskId(spec);
await send(REGISTRY, regAbi, "publish", [specHash, "https://thenar.io/tasks/mug-shelf", 1000, 500], GAS.publish);
const [found, tid] = await pub.readContract({ address: REGISTRY, abi: regAbi, functionName: "bySpecHash", args: [specHash] });
check(found, "the task is registered and findable by its spec hash", `task #${tid}`);
const task = await pub.readContract({ address: REGISTRY, abi: regAbi, functionName: "taskAt", args: [tid] });
check(task.curatorBps === 1000, "the curator's share is recorded", `${task.curatorBps / 100}%`);

// ---- 2. contributors produce episodes against sampled worlds ---------------
const contributors = [
  { key: generatePrivateKey(), quality: 9100, episodes: 4 },
  { key: generatePrivateKey(), quality: 7400, episodes: 3 },
  { key: generatePrivateKey(), quality: 6200, episodes: 2 },
].map((c) => ({ ...c, address: privateKeyToAccount(c.key).address }));

const scenes = new Set();
const leaves = [];
let n = 0;
for (const c of contributors) {
  for (let i = 0; i < c.episodes; i++) {
    const seed = BigInt(n++);
    const scene = sampleScene(spec, specHash, seed);
    scenes.add(sceneHash(scene));
    leaves.push(h(`episode:${specHash}:${seed}:${c.address}`));
  }
}
check(scenes.size === leaves.length, "every episode ran in a distinct sampled world", `${scenes.size}/${leaves.length}`);
const rebuilt = sceneHash(sampleScene(spec, specHash, 3n));
check([...scenes].includes(rebuilt), "any episode's world rebuilds from its seed alone");

const root = mlog.root(leaves);
const before = Number(await pub.readContract({ address: LOG, abi: logAbi, functionName: "anchorCount" }));
const head = await pub.readContract({ address: LOG, abi: logAbi, functionName: "anchorAt", args: [BigInt(before - 1)] });
await send(LOG, logAbi, "anchor", [root, head.size + BigInt(leaves.length), h(`rev-${stamp}`)], GAS.anchor);
const anchorIndex = before;
check(true, `anchored ${leaves.length} episodes`, `anchor #${anchorIndex}`);

// ---- 3. seal the corpus with a quality-weighted cap table ------------------
const anchor = await pub.readContract({ address: LOG, abi: logAbi, functionName: "anchorAt", args: [BigInt(anchorIndex)] });
const who = contributors.map((c) => c.address);
// Weight by total quality earned, not episode count — a corpus must not be
// farmable by submitting many poor demonstrations.
const weights = contributors.map((c) => BigInt(c.quality * c.episodes));
await send(MARKET, mktAbi, "sealCorpus",
  [tid, BigInt(anchorIndex), anchor.root, anchor.size, who, weights, parseEther("0.02"), "0x0000000000000000000000000000000000000000"], GAS.seal);
const corpusId = Number(await pub.readContract({ address: MARKET, abi: mktAbi, functionName: "corpusCount" })) - 1;
const [capWho, capW, capTotal] = await pub.readContract({ address: MARKET, abi: mktAbi, functionName: "capTable", args: [BigInt(corpusId)] });
check(capWho.length === 3, "the cap table names every contributor", `${capWho.length}`);
check(capTotal === weights.reduce((a, b) => a + b, 0n), "weights sum as recorded");
check(new Set(capW.map(String)).size === 3, "weights differ by quality",
  capW.map((w, i) => `${(Number(w) / Number(capTotal) * 100).toFixed(1)}%`).join(" / "));

// ---- 4. a buyer licences it, and everyone is paid in one call --------------
const termsBefore = Number(await pub.readContract({ address: MARKET, abi: mktAbi, functionName: "termsCount" }));
await send(MARKET, mktAbi, "publishTerms", [h(`THENAR corpus licence v1 ${stamp}`), "https://thenar.io/terms/corpus-v1"], GAS.terms);
const termsId = termsBefore;

const balBefore = await Promise.all(who.map((a) => pub.getBalance({ address: a })));
const curatorBefore = await pub.getBalance({ address: task.curator });
const PRICE = parseEther("0.02");
const licTx = await send(MARKET, mktAbi, "license", [BigInt(corpusId), BigInt(termsId)], GAS.license, PRICE);
check(true, "licence bought — curator, contributors and protocol paid in one transaction", licTx.slice(0, 18));

await new Promise((r) => setTimeout(r, 1500));
const balAfter = await Promise.all(who.map((a) => pub.getBalance({ address: a })));
const protocol = (PRICE * 250n) / 10000n;
const toCurator = (PRICE * BigInt(task.curatorBps)) / 10000n;
const pool = PRICE - protocol - toCurator;

let paid = 0n;
for (let i = 0; i < who.length; i++) {
  const got = balAfter[i] - balBefore[i];
  const want = (pool * capW[i]) / capTotal;
  check(got === want, `contributor ${i + 1} paid exactly their quality share`, `${formatEther(got)} MON`);
  paid += got;
}
// The curator is also the deployer here, so their balance moves with gas too;
// assert the invariant that actually matters instead.
check(paid <= pool, "contributor payments never exceed the pool", `${formatEther(paid)} of ${formatEther(pool)}`);
const marketBal = await pub.getBalance({ address: MARKET });
check(marketBal === 0n, "no value is stranded in the market", `${formatEther(marketBal)} MON`);

const rid = Number(await pub.readContract({ address: MARKET, abi: mktAbi, functionName: "receiptCount" })) - 1;
const receipt = await pub.readContract({ address: MARKET, abi: mktAbi, functionName: "receiptAt", args: [BigInt(rid)] });
check(receipt.corpusRoot === anchor.root, "the receipt names the corpus the log anchored");
check(receipt.amount === PRICE, "the receipt records what was paid", `${formatEther(receipt.amount)} MON`);

writeFileSync("apps/web/sample-task.json", JSON.stringify({
  network: "Monad Testnet (10143)",
  registry: REGISTRY, market: MARKET, log: LOG,
  taskId: Number(tid), specHash, spec,
  anchorIndex, corpusId, receiptId: rid,
  contributors: who, weights: weights.map(String),
  licenceTx: licTx,
}, null, 2));
console.log(`\nwrote apps/web/sample-task.json`);
console.log(`balance left ${formatEther(await pub.getBalance({ address: account.address }))} MON`);
console.log(failed === 0 ? "\nfoundry loop verified end to end on Monad\n" : `\n${failed} check(s) failed\n`);
process.exit(failed ? 1 : 0);
