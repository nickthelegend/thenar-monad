/** The capture mechanics, driven headlessly. A run here is the same run an
 *  operator makes: the same tick function, the same scorer, the same leaf. */
import { readFileSync } from "node:fs";
import { sampleScene } from "../scene.js";
import { taskId } from "../taskspec.js";
import * as cap from "../caplogic.js";
import { episodeFacts } from "../episode.js";
import { calibrate } from "../score.js";

let fails = 0;
const ok = (c, m, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const spec = JSON.parse(readFileSync(new URL("./fixture-task.json", import.meta.url))).spec;
const tid = taskId(spec);

/* ---------------------------------------------------------- the solver */

let fk = true, worst = 0;
for (let i = 0; i < 500; i++) {
  const a = Math.random() * 7 - 3.5, r = 0.05 + Math.random() * 0.5;
  const x = r * Math.cos(a), y = r * Math.sin(a);
  const ik = cap.solve(x, y);
  const [fx, fy] = cap.forward(ik.j1, ik.j2);
  worst = Math.max(worst, Math.hypot(fx - ik.x, fy - ik.y));
  if (Math.hypot(fx - ik.x, fy - ik.y) > 1e-9) fk = false;
}
ok(fk, "inverse kinematics round-trips through forward kinematics", `worst ${worst.toExponential(1)} m`);
ok(cap.solve(9, 9).clamped && !cap.solve(0.3, 0.1).clamped,
   "a target beyond reach is clamped and says so");
ok(Number.isFinite(cap.solve(0, 0).j1), "and the singular point at the origin does not produce NaN");

/* ------------------------------------------------------------- a real run */

/** Drive the tool along a path, ticking at a fixed step, gripping when told. */
function run(seed, plan, { dt = 1 / 60, jitter = 0 } = {}) {
  const scene = sampleScene(spec, tid, BigInt(seed));
  const st = cap.initialState(spec, tid, scene);
  st.seedUsed = BigInt(seed);
  let t = 0;
  for (const leg of plan) {
    if (leg.grip) cap.toggleGrip(st);
    const from = [...st.tool], steps = Math.max(1, Math.round(leg.secs / dt));
    for (let i = 1; i <= steps; i++) {
      const u = i / steps, e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
      const w = jitter * Math.sin(u * 41) * 0.001;
      st.tool = [from[0] + (leg.to[0] - from[0]) * e + w, from[1] + (leg.to[1] - from[1]) * e + w];
      t += dt;
      cap.tick(st, dt, t);
    }
  }
  return { st, scene };
}

const at = (st) => [...st.goal];
{ // a clean pick and place
  const scene = sampleScene(spec, tid, 7n);
  const s0 = cap.initialState(spec, tid, scene);
  const { st } = run(7, [
    { to: [s0.payload[0], s0.payload[1]], secs: 1.5 },
    { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.4 },
    { to: at(s0), secs: 3.0 },
  ]);
  const r = cap.finishEpisode(st, spec, tid, { seed: 7n, now: 1756000000 });
  ok(r.recorded, "a clean run records an episode");
  ok(st.everHeld && st.drops === 0, "the payload was picked up and never dropped");
  ok(r.score.success, "and landed in tolerance", `${r.score.deviationMm.toFixed(2)} mm`);
  ok(r.accepted, "and cleared the task's bar", `${(r.score.totalBps / 100).toFixed(2)}%`);
  ok(r.score.durationS > 4 && r.score.durationS < 6, "over a plausible duration", `${r.score.durationS.toFixed(2)} s`);
  ok(st.samples.length === Math.round(r.score.durationS * cap.HZ) ||
     Math.abs(st.samples.length - r.score.durationS * cap.HZ) <= 2,
     `sampled at ${cap.HZ} Hz`, `${st.samples.length} samples`);
  const f = episodeFacts(r.preimage);
  ok(f.taskId === tid && f.worldSeed === 7n && f.success === true && f.qualityScore === r.score.totalBps,
     "and the leaf decodes back to what actually happened");
  const rp = cap.replay({ episode: r.episode, trajectory: r.trajectory }, spec);
  ok(rp.scoreMatches && rp.payloadMatches, "a replay recomputes the same score and payload hash");
}

{ // never picked it up
  const { st } = run(7, [{ to: [0.4, 0.1], secs: 2 }, { to: [0.2, -0.2], secs: 2 }]);
  const r = cap.finishEpisode(st, spec, tid, { seed: 7n });
  ok(!r.recorded && /never picked up/.test(r.reason),
     "a run that never grasped is refused, not scored", r.reason);
}

{ // dropped it short of the datum
  const scene = sampleScene(spec, tid, 11n);
  const s0 = cap.initialState(spec, tid, scene);
  const mid = [(s0.payload[0] + s0.goal[0]) / 2, (s0.payload[1] + s0.goal[1]) / 2];
  const { st } = run(11, [
    { to: [s0.payload[0], s0.payload[1]], secs: 1.5 },
    { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.3 },
    { to: mid, secs: 2 },
    { grip: true, to: mid, secs: 0.3 },      // opens the jaws — payload stays
    { to: at(s0), secs: 2 },                  // arm carries on, payload does not
  ]);
  const r = cap.finishEpisode(st, spec, tid, { seed: 11n });
  ok(st.drops === 1, "opening the jaws drops the payload", `${st.drops} drop(s)`);
  ok(r.recorded && !r.score.success && r.score.totalBps === 0,
     "and a dropped payload scores zero, not partial credit", `${r.score.totalBps} bps`);
  ok(!r.accepted, "and is not accepted");
}

{ // over the time limit
  const scene = sampleScene(spec, tid, 3n);
  const s0 = cap.initialState(spec, tid, scene);
  const { st } = run(3, [
    { to: [s0.payload[0], s0.payload[1]], secs: 2 },
    { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.5 },
    { to: at(s0), secs: 130 },
  ], { dt: 1 / 20 });
  const r = cap.finishEpisode(st, spec, tid, { seed: 3n });
  ok(r.score.success && r.overrun && !r.accepted,
     "a run that lands but overruns the limit is not accepted",
     `${r.score.durationS.toFixed(0)} s > ${spec.acceptance.maxDurationS} s`);
}

{ // smoothness actually discriminates on real recorded paths
  const scene = sampleScene(spec, tid, 5n);
  const s0 = cap.initialState(spec, tid, scene);
  const plan = [
    { to: [s0.payload[0], s0.payload[1]], secs: 1.5 },
    { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.3 },
    { to: at(s0), secs: 3 },
  ];
  const calm = cap.finishEpisode(run(5, plan).st, spec, tid, { seed: 5n });
  const shaky = cap.finishEpisode(run(5, plan, { jitter: 900 }).st, spec, tid, { seed: 5n });
  ok(shaky.score.meanJerk > calm.score.meanJerk * 3,
     "a snatchy path measures far more jerk than a calm one",
     `${calm.score.meanJerk.toFixed(1)} vs ${shaky.score.meanJerk.toFixed(1)}`);
  ok(shaky.score.smoothness < calm.score.smoothness,
     "and scores lower for it",
     `${calm.score.smoothness.toFixed(3)} vs ${shaky.score.smoothness.toFixed(3)}`);
  ok(calm.leaf !== shaky.leaf, "two different runs produce two different leaves");
}

{ // the datum is reproducible and reachable
  let reach = true, stable = true;
  for (let s = 0; s < 200; s++) {
    const d = cap.datumFor(tid, BigInt(s), spec);
    if (cap.datumFor(tid, BigInt(s), spec).join() !== d.join()) stable = false;
    const r = Math.hypot(d[0], d[1]);
    if (r > cap.L1 + cap.L2 || r < Math.abs(cap.L1 - cap.L2)) reach = false;
  }
  ok(stable, "the datum is the same every time it is derived from a seed");
  ok(reach, "and always lands inside the arm's reach", "200 seeds");
  ok(cap.datumFor(tid, 1n, spec).join() !== cap.datumFor(tid, 2n, spec).join(),
     "and moves with the seed");
}

{ // tampering is caught
  const scene = sampleScene(spec, tid, 9n);
  const s0 = cap.initialState(spec, tid, scene);
  const { st } = run(9, [
    { to: [s0.payload[0], s0.payload[1]], secs: 1.5 },
    { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.3 },
    { to: at(s0), secs: 3 },
  ]);
  const r = cap.finishEpisode(st, spec, tid, { seed: 9n });
  const forged = { episode: { ...r.episode, qualityScore: r.score.totalBps + 500 }, trajectory: r.trajectory };
  ok(!cap.replay(forged, spec).scoreMatches,
     "a leaf claiming a better score than its trajectory earns is caught by replay");
  const moved = structuredClone(r.trajectory);
  moved.samples[moved.samples.length - 1].object[0] += 0.0001;
  ok(!cap.replay({ episode: r.episode, trajectory: moved }, spec).payloadMatches,
     "and moving a single sample by 0.1 mm breaks the payload hash");
}


{ /* The scorer has to discriminate, not just produce a number.
   *
   * The band this rig ships with was calibrated against exactly this kind of
   * population. Before it, measured jerk spanned three orders of magnitude
   * against a linear 18-60 band and a par of half the time limit, so smoothness
   * was effectively binary and efficiency was the constant 1 — placement was
   * silently carrying the whole score. This test is what would catch that
   * happening again. */
  const pop = [];
  for (let i = 0; i < 120; i++) {
    const jitter = ((i * 37) % 100 / 100) ** 2 * 400;
    const carry = 2 + ((i * 53) % 100 / 100) ** 1.5 * 26;
    const miss = ((i * 71) % 100 / 100) ** 2 * 22;
    const scene = sampleScene(spec, tid, BigInt(i));
    const s0 = cap.initialState(spec, tid, scene);
    const { st } = run(i, [
      { to: [s0.payload[0], s0.payload[1]], secs: 1.2 + ((i * 29) % 100 / 100) ** 2 * 8 },
      { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.3 },
      { to: [s0.goal[0] + miss / 1000, s0.goal[1]], secs: carry },
    ], { jitter });
    pop.push(cap.finishEpisode(st, spec, tid, { seed: BigInt(i) }));
  }
  const good = pop.filter((e) => e.recorded && e.score.success);
  const at = (a, p) => a.slice().sort((x, y) => x - y)[Math.floor(p * a.length)];
  const spread = (f, label) => {
    const a = good.map(f), lo = at(a, 0.1), hi = at(a, 0.9);
    ok(lo > 0.02 && hi < 0.99 && hi - lo > 0.25,
       `${label} spreads across the population rather than saturating`,
       `p10 ${lo.toFixed(2)} p90 ${hi.toFixed(2)}`);
  };
  ok(good.length > 30, "the population contains enough successful runs to judge", `${good.length}/120`);
  spread((e) => e.score.placement, "placement");
  spread((e) => e.score.smoothness, "smoothness");
  {
    // Efficiency deliberately caps at par: beating par earns nothing extra,
    // because paying for speed buys rushed demonstrations. So it saturates at
    // the top by design — what matters is that it separates the rest, and that
    // the capped group is a minority rather than the whole population.
    const eff = good.map((e) => e.score.efficiency);
    const capped = eff.filter((v) => v >= 0.999).length;
    // Par is the 25th percentile of real durations, so a quarter to a third of
    // runs meeting or beating it is the intent, not a defect. Most of them
    // doing so would mean par had drifted too slow to measure anything.
    ok(capped / eff.length < 0.4, "efficiency caps at par for a minority, not most of them",
       `${capped}/${eff.length} at par or better`);
    ok(at(eff, 0.1) > 0.02 && at(eff, 0.5) < 0.99,
       "and separates everyone below par", `p10 ${at(eff, 0.1).toFixed(2)} p50 ${at(eff, 0.5).toFixed(2)}`);
  }
  const tot = good.map((e) => e.score.totalBps);
  ok(new Set(tot).size > good.length * 0.8, "and most runs get their own score",
     `${new Set(tot).size} distinct of ${good.length}`);
  // A flawless run — dead centre, smoother than the tenth percentile, inside
  // par — genuinely deserves full marks. What would be wrong is many of them.
  const perfect = tot.filter((t) => t === 10000).length;
  ok(perfect / tot.length < 0.1, "and full marks stay rare rather than being the default",
     `${perfect}/${tot.length} at 100%`);
  ok(at(tot, 0.5) > 2000 && at(tot, 0.5) < 8000,
     "with the median somewhere a task could sensibly set a bar against",
     `median ${(at(tot, 0.5) / 100).toFixed(1)}%`);
  const cal = calibrate(good.map((e) => ({ samples: e.trajectory.samples,
    durationS: e.score.durationS, success: true })));
  ok(cal.jerkFloor > 0 && cal.jerkCeil / cal.jerkFloor > 10,
     "and the population is wide enough that a linear band could not fit it",
     `jerk ${cal.jerkFloor.toFixed(2)}-${cal.jerkCeil.toFixed(0)}, par ${cal.parSeconds.toFixed(1)} s`);
}


{ /* A recording that stopped partway is not a demonstration.
   *
   * Browsers stop the frame loop on a hidden tab. Without a guard the wall
   * clock keeps counting, and the episode claims a duration through which
   * nothing was recorded and nobody was driving. */
  const scene = sampleScene(spec, tid, 21n);
  const s0 = cap.initialState(spec, tid, scene);
  const { st } = run(21, [
    { to: [s0.payload[0], s0.payload[1]], secs: 1.5 },
    { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.3 },
    { to: at(s0), secs: 3 },
  ]);
  const clean = cap.finishEpisode(st, spec, tid, { seed: 21n });
  ok(clean.recorded && clean.gaps.length === 0, "a continuous run has no gaps");

  const holed = structuredClone(st);
  const mid = Math.floor(holed.samples.length / 2);
  for (let i = mid; i < holed.samples.length; i++) holed.samples[i].t += 4;  // tab hidden 4 s
  holed.everHeld = true;
  const r = cap.finishEpisode(holed, spec, tid, { seed: 21n });
  ok(!r.recorded, "a run with a 4 s hole in it is refused rather than scored", r.reason);
  ok(r.gaps.length === 1 && Math.abs(r.gaps[0].seconds - 4.05) < 0.1,
     "and the gap is reported with its length", `${r.gaps[0]?.seconds.toFixed(2)} s`);

  ok(cap.findGaps(st.samples).length === 0 && cap.findGaps(holed.samples).length === 1,
     "the gap detector sees the hole and not the clean run");
  ok(!cap.replay({ episode: clean.episode, trajectory: { ...clean.trajectory, samples: holed.samples } }, spec).continuous,
     "and a replay of a holed trajectory reports it as not continuous");
}


{ /* Letting go over the datum is how the task is finished, not a fumble.
   * The result panel told an operator who had just placed the object cleanly
   * that they had "dropped 1x", which is the opposite of what happened. */
  const scene = sampleScene(spec, tid, 31n);
  const s0 = cap.initialState(spec, tid, scene);
  const { st } = run(31, [
    { to: [s0.payload[0], s0.payload[1]], secs: 1.5 },
    { grip: true, to: [s0.payload[0], s0.payload[1]], secs: 0.3 },
    { to: at(s0), secs: 3 },
    { grip: true, to: at(s0), secs: 0.4 },     // release, on the datum
  ]);
  const r = cap.finishEpisode(st, spec, tid, { seed: 31n });
  ok(st.places === 1 && st.drops === 0,
     "releasing on the datum counts as a placement, not a drop",
     `${st.places} placed, ${st.drops} dropped`);
  ok(r.recorded && r.score.success, "and the run still scores as a success");

  const away = cap.initialState(spec, tid, scene);
  const mid = [(away.payload[0] + away.goal[0]) / 2, (away.payload[1] + away.goal[1]) / 2];
  const { st: st2 } = run(31, [
    { to: [away.payload[0], away.payload[1]], secs: 1.5 },
    { grip: true, to: [away.payload[0], away.payload[1]], secs: 0.3 },
    { to: mid, secs: 2 },
    { grip: true, to: mid, secs: 0.4 },        // release, nowhere near it
  ]);
  ok(st2.drops === 1 && st2.places === 0,
     "and letting go anywhere else is still a drop", `${st2.drops} dropped`);
}

console.log(fails === 0 ? "\ncapture: all checks passed\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
