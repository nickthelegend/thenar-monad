/**
 * Take an episode captured in the browser and put it in the log.
 *
 *   pnpm tsx scripts/ingest-episode.ts episode-1a2b3c4d.json [--anchor]
 *
 * The script does not trust the bundle. The score in the leaf is recomputed
 * from the trajectory the bundle carries, the payload hash is recomputed from
 * the same samples, and the leaf is re-derived from the preimage: three ways an
 * edited file gets caught before it reaches the log. An episode is only worth
 * anchoring if it says what actually happened, and the whole point of the log
 * is that nobody has to take the submitter's word for it.
 */
import { readFileSync } from "node:fs";
import { keccak256, toHex, type Hex } from "viem";
import { LogStore } from "../services/log/src/store.ts";
import { anchorHead } from "../services/log/src/anchorer.ts";
import { scoreTrajectory, canonicalTrajectory, CALIBRATION } from "../packages/protocol/src/score.ts";
import { encodeEpisode, hashEpisodeLeaf, episodeFacts } from "../packages/protocol/src/episode.ts";

const file = process.argv[2];
if (!file) {
  console.error("usage: pnpm tsx scripts/ingest-episode.ts <episode.json> [--anchor]");
  process.exit(1);
}
const anchor = process.argv.includes("--anchor");
const bundle = JSON.parse(readFileSync(file, "utf8"));

const problems: string[] = [];
const check = (cond: boolean, msg: string) => { if (!cond) problems.push(msg); };

/* 1. The trajectory has to be there to check anything against. */
const traj = bundle.trajectory;
check(!!traj?.samples?.length, "the bundle carries no trajectory, so nothing in it can be checked");

if (traj?.samples?.length) {
  /* 2. The score has to be the one the samples earn. */
  const recomputed = scoreTrajectory(traj);
  check(recomputed.totalBps === Number(bundle.episode.qualityScore),
    `the leaf claims ${bundle.episode.qualityScore} bps, the trajectory earns ${recomputed.totalBps}`);

  /* 3. The payload hash has to commit to those same samples. */
  const canon = keccak256(toHex(canonicalTrajectory(traj)));
  check(canon.toLowerCase() === String(bundle.episode.payloadHash).toLowerCase(),
    "the payload hash does not match the trajectory it claims to commit to");

  /* 4. The recording has to be continuous. A trajectory with a hole in it
   *    claims a duration through which nothing was recorded. */
  const period = traj.samples.length > 1 ? traj.samples[1].t - traj.samples[0].t : 1 / 20;
  const gaps = traj.samples.slice(1)
    .map((s: any, i: number) => s.t - traj.samples[i].t)
    .filter((d: number) => d > period * 3);
  check(gaps.length === 0,
    `the recording stopped for ${gaps.reduce((a: number, b: number) => a + b, 0).toFixed(1)} s across ` +
    `${gaps.length} gap(s), so the run is not a continuous demonstration`);

  /* 5. The par used has to be the calibrated one, or a run could pick a par
   *    that flatters it and still verify against its own arithmetic. */
  check(Math.abs(traj.parSeconds - CALIBRATION.parSeconds) < 1e-9,
    `the trajectory was scored against par ${traj.parSeconds} s, not the calibrated ${CALIBRATION.parSeconds} s`);
}

/* 6. The preimage has to encode exactly the episode described. */
const e = bundle.episode;
const rebuilt = encodeEpisode({
  payloadHash: e.payloadHash as Hex, manifestHash: e.manifestHash as Hex,
  consentCommitment: e.consentCommitment as Hex, termsId: e.termsId as Hex, taskId: e.taskId as Hex,
  capturedAt: BigInt(e.capturedAt), submittedAt: BigInt(e.submittedAt),
  durationMs: Number(e.durationMs), scopeBits: Number(e.scopeBits), channels: Number(e.channels),
  worldSeed: BigInt(e.worldSeed), successFlag: Number(e.successFlag), qualityScore: Number(e.qualityScore),
});
check(rebuilt.toLowerCase() === String(bundle.preimage).toLowerCase(),
  "the preimage does not encode the episode beside it");

/* 7. And the leaf has to be that preimage's hash. */
check(hashEpisodeLeaf(rebuilt).toLowerCase() === String(bundle.leaf).toLowerCase(),
  "the leaf is not the hash of its own preimage");

if (problems.length) {
  console.error(`refusing ${file} — an episode has to say what happened:`);
  for (const p of problems) console.error(`  · ${p}`);
  process.exit(1);
}

const facts = episodeFacts(rebuilt);
console.log(`checked  ${file}`);
console.log(`  leaf         ${bundle.leaf}`);
console.log(`  task         ${facts.taskId}`);
console.log(`  world seed   ${facts.worldSeed}`);
console.log(`  score        ${(facts.qualityScore / 100).toFixed(2)}%  ${facts.success ? "accepted" : "not accepted"}`);
console.log(`  samples      ${traj.samples.length} at ${traj.samples.length > 1 ? (1 / (traj.samples[1].t - traj.samples[0].t)).toFixed(0) : "?"} Hz`);
console.log(`  recomputed   score and payload hash both match the trajectory`);

async function main() {
  const store = new LogStore(process.env.THENAR_LOG_DB ?? ".data/log.db");
  try {
    // The leaf hash, with the preimage as metadata — never the preimage itself.
    const idx = store.append(hashEpisodeLeaf(rebuilt), {
      preimage: rebuilt,
      taskId: facts.taskId,
      qualityScore: facts.qualityScore,
      success: facts.success ? 1 : 0,
    });
    console.log(`appended at index ${idx}; log is now ${store.size()} leaves, root ${store.root()}`);
    if (anchor) {
      const address = (process.env.GRASP_LOG ?? "") as Hex;
      if (!address) throw new Error("set GRASP_LOG to anchor");
      const r = await anchorHead(store, address);
      console.log(r ? `anchored #${r.index} size ${r.size} in block ${r.blockNumber}\n${r.txHash}`
                    : "nothing new to anchor");
    } else {
      console.log("not anchored — pass --anchor to write it on chain");
    }
  } finally {
    store.close();
  }
}

main().catch((e) => { console.error(e.message); process.exit(1); });
