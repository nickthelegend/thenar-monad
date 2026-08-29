/**
 * The log service, end to end against Monad.
 *
 * Episodes are appended to the persisted log, the service anchors its real
 * head, and the chain confirms inclusion — the thing that was impossible while
 * every script built its own tree and declared a cumulative size.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, keccak256, toHex } from "viem";
import { LogStore } from "../services/log/src/store.ts";
import { anchorHead, auditAnchors, MONAD } from "../services/log/src/anchorer.ts";
import { taskId } from "../packages/protocol/src/taskspec.ts";
import { sampleScene, sceneHash } from "../packages/protocol/src/sampler.ts";
import { encodeEpisode, hashEpisodeLeaf, episodeFacts } from "../packages/protocol/src/episode.ts";

const LOG = process.env.GRASP_LOG;
const VERIFIER = process.env.LEAF_VERIFIER;
const DB = process.env.THENAR_LOG_DB ?? ".data/log.db";

const pub = createPublicClient({ chain: MONAD, transport: http() });
const vAbi = parseAbi([
  "function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)",
  "function episodeFacts(bytes preimage) view returns (bytes32 taskId, uint64 worldSeed, bool success, uint16 qualityScore)",
]);
const logAbi = parseAbi([
  "function anchorAt(uint256) view returns ((bytes32 root, bytes32 prevRoot, bytes32 revocationRoot, uint64 size, uint64 at, uint64 blockNumber))",
  "function verifyAppendOnly(uint256 earlier, uint256 later, bytes32[] proof) view returns (bool)",
  "function verifyConsentLive(uint256 index, bytes32 consentKey, uint256 bitmap, bytes32[] siblings) view returns (bool)",
]);

let failed = 0;
const check = (ok, m, x = "") => { if (!ok) failed++; console.log(`${ok ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };
const h = (s) => keccak256(toHex(s));

console.log(`\nLog service end-to-end · Monad Testnet\nlog      ${LOG}\nverifier ${VERIFIER}\ndb       ${DB}\n`);

const store = new LogStore(DB);
const spec = JSON.parse(readFileSync("apps/web/sample-task.json", "utf8")).spec;
const tid = taskId(spec);
const stamp = BigInt(Math.floor(Date.now() / 1000));

function makeEpisode(i) {
  const seed = BigInt(i);
  const success = i % 4 !== 3;
  return {
    seed, scene: sampleScene(spec, tid, seed),
    ep: {
      payloadHash: h(`payload-${i}-${stamp}`), manifestHash: h("band-manifest-v1"),
      consentCommitment: h(`consent-${i}-${stamp}`), termsId: h("thenar-licence-v1"),
      taskId: tid, capturedAt: stamp - BigInt(900 - i * 60), submittedAt: stamp - BigInt(600 - i * 30),
      durationMs: 3200 + i * 140, scopeBits: 11, channels: 6,
      worldSeed: seed, successFlag: success ? 1 : 0,
      // Basis points: the encoder refuses anything above 10000, and the index
      // is not bounded, so the spread has to wrap rather than run away.
      qualityScore: success ? 6200 + (i % 12) * 300 : 1800,
    },
  };
}

// ---- append the first batch ------------------------------------------------
const base = store.size();
const first = [];
for (let i = 0; i < 7; i++) {
  const e = makeEpisode(i);
  const pre = encodeEpisode(e.ep);
  const leaf = hashEpisodeLeaf(pre);
  const idx = store.append(leaf, { preimage: pre, taskId: tid,
    qualityScore: e.ep.qualityScore, success: e.ep.successFlag });
  first.push({ ...e, pre, leaf, idx });
}
check(store.size() === base + 7, "the log grew by the first batch", `${base} -> ${store.size()} leaves`);
check(new Set(first.map((e) => sceneHash(e.scene))).size === 7, "every episode ran in a distinct world");

const a1 = await anchorHead(store, LOG);
check(a1 !== null && a1.size === store.size(), "anchored the log's real head",
  a1 ? `anchor #${a1.index}, size ${a1.size}` : "anchorHead returned null");

// The anchor must be coherent: size and root describe the same tree.
const onChain1 = await pub.readContract({ address: LOG, abi: logAbi, functionName: "anchorAt", args: [BigInt(a1.index)] });
check(onChain1.root === store.root(Number(onChain1.size)) && Number(onChain1.size) === store.size(),
  "the anchor's size and root describe the same tree");

// ---- the chain confirms inclusion ------------------------------------------
const pick = base + 3;
const proof = store.inclusionProof(pick);
const inLog = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "verifyLeaf",
  args: [BigInt(a1.index), first[pick - base].pre, proof, BigInt(pick)] });
check(inLog === true, "the chain confirms a 197-byte episode is in the log", `leaf ${pick}, ${proof.length}-word proof`);

let all = true;
for (let i = 0; i < first.length; i++) {
  const idx = base + i;
  const p = store.inclusionProof(idx);
  const v = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "verifyLeaf",
    args: [BigInt(a1.index), first[i].pre, p, BigInt(idx)] });
  if (!v) all = false;
}
check(all, "every episode in the batch verifies on chain", `${first.length}/${first.length}`);

const tampered = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "verifyLeaf",
  args: [BigInt(a1.index), first[0].pre, proof, BigInt(pick)] });
check(tampered === false, "a substituted episode is refused by the same proof");

// ---- the buyer's filter fields ---------------------------------------------
const facts = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "episodeFacts", args: [first[pick - base].pre] });
check(facts[0] === tid && facts[1] === first[pick - base].seed, "the chain reports the task and world seed", `seed ${facts[1]}`);
check(facts[3] === first[pick - base].ep.qualityScore, "the chain reports the quality score", `${facts[3]} bps`);
const offChain = episodeFacts(first[pick - base].pre);
check(offChain.taskId === facts[0] && offChain.worldSeed === facts[1] && offChain.qualityScore === facts[3],
  "the TypeScript decoder agrees with the contract, field for field");

const failIdx = first.findIndex((e) => e.ep.successFlag === 0);
const failFacts = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "episodeFacts", args: [first[failIdx].pre] });
check(failFacts[2] === false, "a failed attempt reads back as failed", `${failFacts[3]} bps`);

// ---- the scene rebuilds from what the chain reported ------------------------
check(sceneHash(sampleScene(spec, facts[0], facts[1])) === sceneHash(first[pick - base].scene),
  "the scene rebuilds from the task and seed the chain reported");

// ---- extend the log, and prove nothing was rewritten ------------------------
const second = [];
for (let i = 7; i < 12; i++) {
  const e = makeEpisode(i);
  const pre = encodeEpisode(e.ep);
  const leaf = hashEpisodeLeaf(pre);
  store.append(leaf, { preimage: pre, taskId: tid, qualityScore: e.ep.qualityScore, success: e.ep.successFlag });
  second.push({ ...e, pre, leaf });
}
const a2 = await anchorHead(store, LOG);
check(a2 !== null && a2.size === store.size(), "extended and re-anchored",
  a2 ? `anchor #${a2.index}, size ${a2.size}` : "null");

const cproof = store.consistencyProof(a1.size, a2.size);
const appendOnly = await pub.readContract({ address: LOG, abi: logAbi, functionName: "verifyAppendOnly",
  args: [BigInt(a1.index), BigInt(a2.index), cproof] });
check(appendOnly === true, "the chain confirms the log was only appended to", `${cproof.length}-word proof`);

// An earlier leaf must still verify against the NEW root.
const stillIn = await pub.readContract({ address: VERIFIER, abi: vAbi, functionName: "verifyLeaf",
  args: [BigInt(a2.index), first[pick - base].pre, store.inclusionProof(pick), BigInt(pick)] });
check(stillIn === true, "an earlier episode still verifies against the extended root");

// ---- consent withdrawal ----------------------------------------------------
const revokedKey = h(`consent-2-${stamp}`);
store.revoke(revokedKey, h("withdrawal-record"));
const a3 = await anchorHead(store, LOG);
check(a3 === null, "anchoring refuses when the head has not moved");

// A store behind the chain must fail loudly rather than submit a doomed size.
const { LogStore: LS } = await import("../services/log/src/store.ts");
const behind = new LS(":memory:");
behind.append(h("a-single-leaf"));
let refusedBehind = false;
try { await anchorHead(behind, LOG); } catch (e) { refusedBehind = /behind the chain/.test(e.message); }
check(refusedBehind, "a store behind the chain refuses to anchor, loudly");

store.append(hashEpisodeLeaf(encodeEpisode(makeEpisode(1000 + store.size()).ep)), { taskId: tid });
const a4 = await anchorHead(store, LOG);
check(a4 !== null && a4.revocationRoot !== `0x${"0".repeat(64)}`, "the withdrawal is carried in the next anchor");

const liveKey = h(`consent-never-${stamp}`);
const { SparseTree } = await import("../packages/protocol/src/sparse.ts");
const t = new SparseTree();
for (const r of store.revocations()) t.set(r.consentKey, r.value);
const p = t.proof(liveKey);
const live = await pub.readContract({ address: LOG, abi: logAbi, functionName: "verifyConsentLive",
  args: [BigInt(a4.index), liveKey, p.bitmap, p.siblings] });
check(live === true, "an unwithdrawn consent still proves live against the anchored root");

// ---- the service can re-derive every anchor it wrote ------------------------
const audit = await auditAnchors(store, LOG);
check(audit.every((r) => r.status === "coherent"), "every anchor re-derives from the stored leaves",
  audit.map((r) => `#${r.index} ${r.status}`).join(" "));

writeFileSync("apps/web/sample-episode.json", JSON.stringify({
  network: "Monad Testnet (10143)", log: LOG, verifier: VERIFIER,
  anchorIndex: a2.index, leafIndex: pick,
  preimage: first[pick - base].pre, proof: store.inclusionProof(pick, a2.size),
  taskId: tid, worldSeed: Number(first[pick - base].seed),
  success: first[pick - base].ep.successFlag === 1, qualityScore: first[pick - base].ep.qualityScore,
  expected: true,
}, null, 2));
console.log(`\nwrote apps/web/sample-episode.json`);
store.close();
console.log(failed === 0 ? "\nlog service verified end to end on Monad\n" : `\n${failed} check(s) failed\n`);
process.exit(failed ? 1 : 0);
