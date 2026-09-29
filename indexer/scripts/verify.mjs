#!/usr/bin/env node
// Cross-check the indexer's GraphQL against contract state, field by field.
//
//   pnpm verify:local        the local anvil chain (31337)
//
// Reads every task, run, sale, passkey, operator balance and total straight
// from the contracts' view functions and compares each with what the indexer
// serves. Exits non-zero on any mismatch. Read-only: it sends no transactions.
//
// Env (all optional): VERIFY_RPC, VERIFY_GRAPHQL, VERIFY_CHAIN_ID,
// HASURA_GRAPHQL_ADMIN_SECRET, and the ENVIO_THENAR_LOCAL_* addresses.
import { createRequire } from "node:module";

// viem ships with envio; resolve it from there rather than adding a dependency.
const requireFromEnvio = createRequire(createRequire(import.meta.url).resolve("envio/package.json"));
const { createPublicClient, http, parseAbi } = requireFromEnvio("viem");

const RPC = process.env.VERIFY_RPC ?? process.env.ENVIO_THENAR_LOCAL_RPC_URL ?? "http://127.0.0.1:8645";
const GQL = process.env.VERIFY_GRAPHQL ?? "http://localhost:8089/v1/graphql";
const SECRET = process.env.HASURA_GRAPHQL_ADMIN_SECRET ?? "thenar-admin";
const CHAIN = Number(process.env.VERIFY_CHAIN_ID ?? 31337);
const A = {
  axon: process.env.ENVIO_THENAR_LOCAL_AXON ?? "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
  passkeys: process.env.ENVIO_THENAR_LOCAL_PASSKEY_REGISTRY ?? "0x5FbDB2315678afecb367f032d93F642f64180aa3",
  shares: process.env.ENVIO_THENAR_LOCAL_CORPUS_SHARES ?? "0x0165878A594ca255338adfa4d48449f69242Eb8F",
  sales: process.env.ENVIO_THENAR_LOCAL_SALES_LOG ?? "0xa513E6E4b8f2a923D98304ec87F64353C4D5C853",
};

const abi = {
  axon: parseAbi([
    "struct Task { string name; address funder; uint128 rewardPerTrajectory; uint128 escrow; uint32 slotsTotal; uint32 slotsFilled; uint8 scenario; uint8 difficulty; bool policyMinted; uint64 expiresAt; bool closed; uint64 createdBlock; }",
    "struct Trajectory { uint256 taskId; address contributor; bytes32 trajHash; string cid; uint16 score; uint128 paid; uint64 at; uint64 atBlock; }",
    "function taskCount() view returns (uint256)",
    "function trajectoryCount() view returns (uint256)",
    "function getTask(uint256) view returns (Task)",
    "function getTrajectory(uint256) view returns (Trajectory)",
    "function contributorsOf(uint256) view returns (address[])",
    "function weightOnTask(uint256, address) view returns (uint256)",
    "function runsOnTask(uint256, address) view returns (uint256)",
    "function stats(address) view returns (uint256 runs, uint256 earned, uint256 meanScore)",
    "function totalScore(address) view returns (uint256)",
    "function claimable(address) view returns (uint256)",
  ]),
  shares: parseAbi([
    "function balanceOf(address) view returns (uint256)",
    "function totalSupply() view returns (uint256)",
    "function isInControlList(address) view returns (bool)",
    "function getControlListCount() view returns (uint256)",
  ]),
  passkeys: parseAbi([
    "struct Passkey { bytes32 x; bytes32 y; uint64 registeredAt; }",
    "function passkeyOf(address) view returns (Passkey)",
    "function hasPasskey(address) view returns (bool)",
  ]),
  sales: parseAbi([
    "struct Sale { bytes32 saleId; uint256 taskId; uint8 terms; address buyer; address asset; uint256 amount; bytes32 sha256; uint64 at; }",
    "function saleCount() view returns (uint256)",
    "function getSale(uint256) view returns (Sale)",
  ]),
};

const client = createPublicClient({ transport: http(RPC) });
const read = (which, functionName, args = []) =>
  client.readContract({ address: A[which], abi: abi[which], functionName, args });

async function gql(query) {
  const res = await fetch(GQL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-hasura-admin-secret": SECRET },
    body: JSON.stringify({ query }),
  });
  const body = await res.json();
  if (body.errors) throw new Error(JSON.stringify(body.errors));
  return body.data;
}

let ok = 0;
let bad = 0;
function check(label, chain, indexed) {
  const same = String(chain) === String(indexed);
  if (same) ok++;
  else bad++;
  console.log(`${same ? "ok  " : "FAIL"} ${label}: chain=${chain} indexer=${indexed}`);
}

const where = `where: {chainId: {_eq: ${CHAIN}}}`;
const d = await gql(`{
  _meta { chainId progressBlock sourceBlock isReady }
  Task(${where}, order_by: {taskId: asc}) { taskId name funder slots rewardPerTrajectory scenario difficulty runCount filled expired contributorCount }
  Run(${where}, order_by: {trajectoryId: asc}) { id taskId contributor_id trajHash cid score paid txHash }
  TaskContributor(${where}) { id scoreTotal runCount }
  Operator(${where}) { id runCount paidTotal scoreTotal hasPasskey admitted shareBalance owed }
  Passkey(${where}) { id x y }
  Sale(${where}, order_by: {seq: asc}) { seq saleId taskId terms buyer asset amount sha256 txHash }
  Stats(${where}) { tasks runs paidTotal sales salesVolume shareSupply admitted }
}`);
const meta = d._meta.find((m) => m.chainId === CHAIN);
console.log(`indexer at block ${meta?.progressBlock} of ${meta?.sourceBlock} (ready: ${meta?.isReady})\n`);
const stats = d.Stats[0] ?? {};

// Tasks
check("taskCount", await read("axon", "taskCount"), d.Task.length);
check("Stats.tasks", await read("axon", "taskCount"), stats.tasks);
for (const t of d.Task) {
  const c = await read("axon", "getTask", [BigInt(t.taskId)]);
  const k = `task ${t.taskId}`;
  check(`${k} name`, c.name, t.name);
  check(`${k} funder`, c.funder, t.funder);
  check(`${k} slots`, c.slotsTotal, t.slots);
  check(`${k} rewardPerTrajectory`, c.rewardPerTrajectory, t.rewardPerTrajectory);
  check(`${k} scenario`, c.scenario, t.scenario);
  check(`${k} difficulty`, c.difficulty, t.difficulty);
  check(`${k} runs = slotsFilled`, c.slotsFilled, t.runCount);
  check(`${k} filled`, c.slotsFilled === c.slotsTotal, t.filled);
  check(`${k} expired = closed`, c.closed, t.expired);
  check(`${k} contributors`, (await read("axon", "contributorsOf", [BigInt(t.taskId)])).length, t.contributorCount);
}

// Runs
check("trajectoryCount", await read("axon", "trajectoryCount"), d.Run.length);
let paid = 0n;
for (const r of d.Run) {
  const c = await read("axon", "getTrajectory", [BigInt(r.id)]);
  const k = `run ${r.id}`;
  check(`${k} taskId`, c.taskId, r.taskId);
  check(`${k} contributor`, c.contributor, r.contributor_id);
  check(`${k} trajHash`, c.trajHash, r.trajHash);
  check(`${k} cid`, c.cid, r.cid);
  check(`${k} score`, c.score, r.score);
  check(`${k} paid`, c.paid, r.paid);
  const receipt = await client.getTransactionReceipt({ hash: r.txHash });
  check(`${k} txHash is an Axon tx`, true, receipt.logs.some((l) => l.address.toLowerCase() === A.axon.toLowerCase()));
  paid += c.paid;
}
check("Stats.runs", await read("axon", "trajectoryCount"), stats.runs);
check("Stats.paidTotal", paid, stats.paidTotal);

for (const tc of d.TaskContributor) {
  const [taskId, who] = tc.id.split("-");
  check(`weightOnTask(${taskId}, ${who})`, await read("axon", "weightOnTask", [BigInt(taskId), who]), tc.scoreTotal);
  check(`runsOnTask(${taskId}, ${who})`, await read("axon", "runsOnTask", [BigInt(taskId), who]), tc.runCount);
}

// Operators
for (const o of d.Operator) {
  const k = `operator ${o.id}`;
  const [runs, earned] = await read("axon", "stats", [o.id]);
  check(`${k} runs`, runs, o.runCount);
  check(`${k} earned`, earned, o.paidTotal);
  check(`${k} totalScore`, await read("axon", "totalScore", [o.id]), o.scoreTotal);
  check(`${k} claimable`, await read("axon", "claimable", [o.id]), o.owed);
  check(`${k} share balance`, await read("shares", "balanceOf", [o.id]), o.shareBalance);
  check(`${k} admitted`, await read("shares", "isInControlList", [o.id]), o.admitted);
  check(`${k} hasPasskey`, await read("passkeys", "hasPasskey", [o.id]), o.hasPasskey);
}
check("share totalSupply", await read("shares", "totalSupply"), stats.shareSupply);
check("control list size", await read("shares", "getControlListCount"), stats.admitted);

// Passkeys
for (const p of d.Passkey) {
  const c = await read("passkeys", "passkeyOf", [p.id]);
  check(`passkey ${p.id} x`, c.x, p.x);
  check(`passkey ${p.id} y`, c.y, p.y);
}

// Sales
check("saleCount", await read("sales", "saleCount"), d.Sale.length);
let volume = 0n;
for (const s of d.Sale) {
  const c = await read("sales", "getSale", [BigInt(s.seq)]);
  const k = `sale ${s.seq}`;
  check(`${k} saleId`, c.saleId, s.saleId);
  check(`${k} taskId`, c.taskId, s.taskId);
  check(`${k} terms`, ["X402", "AgentKit"][c.terms], s.terms);
  check(`${k} buyer`, c.buyer, s.buyer);
  check(`${k} asset`, c.asset, s.asset);
  check(`${k} amount`, c.amount, s.amount);
  check(`${k} sha256`, c.sha256, s.sha256);
  const receipt = await client.getTransactionReceipt({ hash: s.txHash });
  check(`${k} txHash is a SalesLog tx`, true, receipt.logs.some((l) => l.address.toLowerCase() === A.sales.toLowerCase()));
  volume += c.amount;
}
check("Stats.sales", await read("sales", "saleCount"), stats.sales);
check("Stats.salesVolume", volume, stats.salesVolume);

console.log(`\n${ok} checks passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
