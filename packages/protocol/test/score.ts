/** The scorer, which decides what a contributor is paid and what a buyer filters on. */
import { scoreTrajectory, meanJerk, canonicalTrajectory, WEIGHTS, CALIBRATION, smoothnessOf, calibrate,
         type Sample, type Trajectory } from "../src/score.ts";

let fails = 0;
const ok = (c: boolean, m: string, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const HZ = 20;
/** A path from `from` to `to` over `secs`, with a smoothness knob. */
function path(from: [number, number], to: [number, number], secs: number,
              opts: { jitter?: number; endOffsetMm?: number } = {}): Sample[] {
  const n = Math.round(secs * HZ);
  const jitter = opts.jitter ?? 0;
  const out: Sample[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    // A deterministic wobble so "snatchy" is reproducible.
    const w = jitter * Math.sin(u * 37) * 0.001;
    out.push({
      t: +(i / HZ).toFixed(4),
      q: [0.1 * e, 0.5 * e, 0.9 * e, 0, 1.2 * e, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [from[0] + (to[0] - from[0]) * e + w, from[1] + (to[1] - from[1]) * e + w, 0],
    });
  }
  const off = (opts.endOffsetMm ?? 0) / 1000;
  const l = out[out.length - 1];
  l.object = [to[0] + off, to[1], 0];
  return out;
}

const GOAL: [number, number] = [0.17, -0.24];
const base = (samples: Sample[], par = 90): Trajectory =>
  ({ samples, goal: GOAL, parSeconds: par, toleranceMm: 25 });

// --- placement --------------------------------------------------------------
const dead = scoreTrajectory(base(path([0.3, 0.2], GOAL, 90, { endOffsetMm: 0 })));
ok(dead.success && dead.deviationMm < 0.01, "a dead-centre placement is a success", `${dead.deviationMm.toFixed(3)} mm`);
ok(dead.placement > 0.99, "and scores placement at essentially full marks", dead.placement.toFixed(4));

const edge = scoreTrajectory(base(path([0.3, 0.2], GOAL, 90, { endOffsetMm: 24 })));
ok(edge.success && edge.placement < 0.1, "a placement just inside tolerance barely scores", edge.placement.toFixed(4));

const miss = scoreTrajectory(base(path([0.3, 0.2], GOAL, 90, { endOffsetMm: 40 })));
ok(!miss.success && miss.totalBps === 0, "a miss scores zero, not partial credit", `${miss.deviationMm.toFixed(1)} mm`);
ok(miss.smoothness === 0 && miss.efficiency === 0,
   "and collects no credit for being smooth or quick about it");

// --- smoothness -------------------------------------------------------------
const calm = scoreTrajectory(base(path([0.3, 0.2], GOAL, 90, { jitter: 0 })));
const snatchy = scoreTrajectory(base(path([0.3, 0.2], GOAL, 90, { jitter: 260 })));
ok(snatchy.meanJerk > calm.meanJerk, "a jerkier path measures a higher jerk",
   `${calm.meanJerk.toFixed(1)} vs ${snatchy.meanJerk.toFixed(1)}`);
ok(snatchy.smoothness <= calm.smoothness, "and scores no better on smoothness",
   `${calm.smoothness.toFixed(3)} vs ${snatchy.smoothness.toFixed(3)}`);
ok(CALIBRATION.jerkFloor < CALIBRATION.jerkCeil, "the jerk band is the right way round");

// --- efficiency -------------------------------------------------------------
const quick = scoreTrajectory(base(path([0.3, 0.2], GOAL, 45), 90));
const slow = scoreTrajectory(base(path([0.3, 0.2], GOAL, 180), 90));
ok(quick.efficiency === 1, "beating par caps efficiency rather than exceeding it", quick.efficiency.toFixed(3));
ok(slow.efficiency > 0 && slow.efficiency < 0.6, "and taking twice par halves it", slow.efficiency.toFixed(3));
ok(quick.totalBps > slow.totalBps, "so the quicker run scores higher, all else equal",
   `${quick.totalBps} vs ${slow.totalBps}`);

// --- the committed number ---------------------------------------------------
ok(dead.totalBps >= 0 && dead.totalBps <= 10000, "the total is basis points", `${dead.totalBps}`);
ok(Math.abs((WEIGHTS.placement + WEIGHTS.smoothness + WEIGHTS.efficiency) - 1) < 1e-9,
   "the weights sum to one");

// Determinism: the committed score must not move between two runs of the same data.
const t = base(path([0.3, 0.2], GOAL, 72, { jitter: 40, endOffsetMm: 6 }));
ok(scoreTrajectory(t).totalBps === scoreTrajectory(t).totalBps, "scoring is deterministic");
ok(canonicalTrajectory(t) === canonicalTrajectory(t), "and so is the canonical form");

// --- refusals ---------------------------------------------------------------
let threw = false;
try { scoreTrajectory(base([])); } catch { threw = true; }
ok(threw, "an episode with no samples is refused rather than scored zero");

ok(meanJerk(path([0, 0], [0, 0], 0.1)) >= 0, "a very short path does not divide by zero");

// The canonical form must change if any sample does, or the payload hash is not
// a commitment to the trajectory.
const t2 = base(path([0.3, 0.2], GOAL, 72, { jitter: 40, endOffsetMm: 6 }));
t2.samples[10].object[0] += 0.0001;
ok(canonicalTrajectory(t) !== canonicalTrajectory(t2), "one moved sample changes the canonical form");

// The band is applied correctly even though this rig's synthetic paths sit far
// below it. Exercised directly rather than inferred from a path that never
// reaches the band.
ok(smoothnessOf(CALIBRATION.jerkFloor) === 1 && smoothnessOf(CALIBRATION.jerkCeil) === 0,
   "the band maps its floor to 1 and its ceiling to 0");
ok(smoothnessOf(CALIBRATION.jerkFloor / 100) === 1 && smoothnessOf(CALIBRATION.jerkCeil * 100) === 0,
   "and clamps outside it rather than going out of range");
{
  // Log spacing is the point: on a linear band the geometric midpoint would sit
  // far off centre, and the middle of a three-orders-of-magnitude distribution
  // is exactly where most episodes live.
  const mid = Math.sqrt(CALIBRATION.jerkFloor * CALIBRATION.jerkCeil);
  ok(Math.abs(smoothnessOf(mid) - 0.5) < 1e-9,
     "and the geometric midpoint scores exactly a half", smoothnessOf(mid).toFixed(6));
}
{
  let mono = true;
  for (let j = 0.01; j < 500; j *= 1.3) if (smoothnessOf(j * 1.3) > smoothnessOf(j)) mono = false;
  ok(mono, "smoothness never rises as jerk rises");
}
{
  let refused = false;
  try { calibrate([{ samples: path([0, 0], [1, 1], 5), durationS: 5, success: true }]); }
  catch { refused = true; }
  ok(refused, "calibration refuses too small a sample rather than inventing a band");

  const many = Array.from({ length: 40 }, (_, i) => ({
    samples: path([0, 0], GOAL, 3 + (i % 7), 20 + i * 9),
    durationS: 3 + (i % 7), success: true,
  }));
  const cal = calibrate(many);
  ok(cal.n === 40 && cal.jerkFloor < cal.jerkCeil && cal.parSeconds > 0,
     "and derives a band and a par from enough real episodes",
     `${cal.jerkFloor.toFixed(1)}–${cal.jerkCeil.toFixed(1)}, par ${cal.parSeconds.toFixed(1)} s`);
  ok(calibrate(many.map((e) => ({ ...e }))).jerkCeil === cal.jerkCeil,
     "and is deterministic over the same episodes");
  let ignoresFails = false;
  try { calibrate([...many.slice(0, 19), ...many.map((e) => ({ ...e, success: false }))]); }
  catch { ignoresFails = true; }
  ok(ignoresFails, "and will not calibrate a bar out of episodes that missed it");
}

console.log(fails === 0 ? "\nscoring: all checks passed\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
