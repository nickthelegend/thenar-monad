/* Executes the contract read items of TESTPLAN.md against Monad. */
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import * as mlog from "../packages/protocol/src/log.ts";

const chain = { id: 10143, name: "Monad", nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } } };
const pub = createPublicClient({ chain, transport: http() });
// From the deployment record, never a constant — a stale address here reports
// a working contract as broken, which is exactly what it did once.
const c = Object.fromEntries(readFileSync(".env.contracts", "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const LOG = c.GRASP_LOG;
const VERIFIER = c.LEAF_VERIFIER;
const REGISTRY = c.TASK_REGISTRY;
const FMARKET = c.FOUNDRY_MARKET;

const logAbi = parseAbi([
  "function anchorCount() view returns (uint256)",
  "function anchorAt(uint256) view returns ((bytes32 root, bytes32 prevRoot, bytes32 revocationRoot, uint64 size, uint64 at, uint64 blockNumber))",
  "function verifyClip(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)",
]);
const vAbi = parseAbi([
  "function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)",
  "function hashLeaf(bytes preimage) pure returns (bytes32)",
]);
const regAbi = parseAbi(["function taskCount() view returns (uint256)",
  "function taskAt(uint256) view returns ((bytes32 specHash, address curator, string uri, uint16 curatorBps, uint32 targetEpisodes, uint64 publishedAt, bool open))"]);
const fmAbi = parseAbi(["function capTable(uint256) view returns (address[], uint256[], uint256)"]);

const R = [];
const item = (id, ok, note = "") => { R.push({ id, ok, note }); console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${note}`); };

const n = Number(await pub.readContract({ address: LOG, abi: logAbi, functionName: "anchorCount" }));
item("C1", n > 0, `anchorCount = ${n}`);

const anchors = [];
for (let i = 0; i < n; i++) {
  anchors.push(await pub.readContract({ address: LOG, abi: logAbi, functionName: "anchorAt", args: [BigInt(i)] }));
}
let chainOk = true, growOk = true;
for (let i = 1; i < n; i++) {
  if (anchors[i].prevRoot !== anchors[i - 1].root) chainOk = false;
  if (anchors[i].size <= anchors[i - 1].size) growOk = false;
}
item("C2", chainOk && growOk, `prevRoot chains and size grows across ${n} anchors`);

// C3 — coherence. sample-proof.json is a known-good leaf for anchor 0.
const s = JSON.parse(readFileSync("apps/web/sample-proof.json", "utf8"));
let viaLog = false;
try {
  viaLog = await pub.readContract({ address: LOG, abi: logAbi, functionName: "verifyClip",
    args: [BigInt(s.anchorIndex), s.preimage, s.proof, BigInt(s.leafIndex)] });
} catch { viaLog = false; }
item("C4", viaLog === true, `capture verifies against anchor ${s.anchorIndex} via verifyClip`);

const viaVerifier = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "verifyLeaf",
  args: [BigInt(s.anchorIndex), s.preimage, s.proof, BigInt(s.leafIndex)] });
item("C5", viaVerifier === true, "the same capture verifies through LeafVerifier");

// C3 proper: an anchor whose size disagrees with its root can never verify.
// Anchor 4 was written by episode-e2e with size = cumulative but a 6-leaf root.
const { LogStore } = await import("../services/log/src/store.ts");
const { auditAnchors } = await import("../services/log/src/anchorer.ts");
const store = new LogStore(process.env.THENAR_LOG_DB ?? ".data/log.db");
const audit = await auditAnchors(store, LOG);
store.close();
item("C3", audit.length > 0 && audit.every((r) => r.coherent),
  `every anchor's size and root describe the same tree — ${audit.map((r) => `#${r.index}${r.coherent ? "" : " INCOHERENT"}`).join(" ")}`);

const ep = JSON.parse(readFileSync("apps/web/sample-episode.json", "utf8"));
const epOk = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "verifyLeaf",
  args: [BigInt(ep.anchorIndex), ep.preimage, ep.proof, BigInt(ep.leafIndex)] });
item("C6", epOk === true, `a 197-byte episode verifies via LeafVerifier — anchor ${ep.anchorIndex}, leaf ${ep.leafIndex}`);

const facts = await pub.readContract({ address: VERIFIER, abi: parseAbi([
  "function episodeFacts(bytes preimage) view returns (bytes32 taskId, uint64 worldSeed, bool success, uint16 qualityScore)"]),
  functionName: "episodeFacts", args: [ep.preimage] });
item("C7", facts[0] === ep.taskId && Number(facts[1]) === ep.worldSeed && facts[3] === ep.qualityScore,
  `episodeFacts returns the committed fields — seed ${facts[1]}, ${facts[3]} bps`);

// C8 — version guards
const guards = [];
for (const [name, hex] of [["unknown version", "0x09" + "00".repeat(153)],
                           ["empty", "0x"],
                           ["episode length claiming capture", "0x01" + "00".repeat(196)]]) {
  try { await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "hashLeaf", args: [hex] }); guards.push(`${name}: ACCEPTED`); }
  catch { guards.push(`${name}: refused`); }
}
item("C8", guards.every((g) => g.endsWith("refused")), guards.join("; "));

const tc = Number(await pub.readContract({ address: REGISTRY, abi: regAbi, functionName: "taskCount" }));
const t = await pub.readContract({ address: REGISTRY, abi: regAbi, functionName: "taskAt", args: [0n] });
item("C9", tc > 0 && t.curatorBps === 1000, `task 0: curator ${t.curatorBps / 100}%, target ${t.targetEpisodes}`);

const [who, w, total] = await pub.readContract({ address: FMARKET, abi: fmAbi, functionName: "capTable", args: [0n] });
const sum = w.reduce((a, b) => a + b, 0n);
item("C10", sum === total && new Set(w.map(String)).size === w.length,
  `${who.length} contributors, weights sum to total, all distinct`);

console.log(`\n${R.filter((r) => r.ok).length}/${R.length} chain items passed`);
process.exit(R.every((r) => r.ok) ? 0 : 1);
