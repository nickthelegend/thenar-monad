/**
 * Scoring a recorded episode.
 *
 * Deterministic and pure: the same samples always give the same score, in the
 * browser and on the server alike, because the score is committed into the leaf
 * and a buyer filters a corpus on it. A score that drifted between the two
 * would make the committed number a claim rather than a measurement.
 *
 * Three parts, and the weighting says what the task is actually for:
 *   placement   how close the payload came to rest to the goal
 *   smoothness  mean jerk of the tool path, normalised against a human band
 *   efficiency  time taken against the task's own par
 *
 * Placement dominates because a task that lands the object in the wrong place
 * is a failure however elegantly it was done.
 */

export type Sample = {
  /** Seconds since the episode began. */
  t: number;
  /** Joint angles, radians. Length is the embodiment's DoF. */
  q: number[];
  /** Jaw opening, millimetres. */
  grip: number;
  /** Payload position in the world frame, metres. */
  object: [number, number, number];
};

export type Trajectory = {
  samples: Sample[];
  /** Where the payload was meant to come to rest. */
  goal: [number, number];
  /** The task's par time, seconds. */
  parSeconds: number;
  /** Tolerance the task declared, millimetres. */
  toleranceMm: number;
};

export type Score = {
  /** Basis points, 0–10000. */
  totalBps: number;
  placement: number;
  smoothness: number;
  efficiency: number;
  /** Millimetres from the goal at rest. */
  deviationMm: number;
  durationS: number;
  meanJerk: number;
  /** Whether the payload came to rest inside the declared tolerance. */
  success: boolean;
};

export const WEIGHTS = { placement: 0.55, smoothness: 0.25, efficiency: 0.2 } as const;

export type Calibration = {
  /** Mean jerk at or below which smoothness scores 1. */
  jerkFloor: number;
  /** Mean jerk at or above which smoothness scores 0. */
  jerkCeil: number;
  /** Duration at or below which efficiency scores 1, seconds. */
  parSeconds: number;
};

/**
 * The calibration this rig ships with.
 *
 * These are not guesses and they are not universal. They were derived by
 * `calibrate()` from 120 episodes recorded through the browser-kinematic
 * capture loop, spanning careful-and-slow to quick-and-rough, and they are the
 * p10/p90 of the jerk actually measured and the p25 of the duration actually
 * taken. Before this rig, the band was carried over from an earlier setup and
 * was wrong by an order of magnitude: measured jerk spans roughly 0.3 to 160,
 * against an old band of 18–60, so nearly every episode scored either 0 or 1
 * and smoothness discriminated nothing.
 *
 * The honest caveat: 120 episodes driven by a scripted operator model is not
 * 120 episodes driven by people. The shape is right — three orders of magnitude
 * of jerk, durations clustered well under the task's limit — but the exact
 * percentiles will move once real operators use it. `calibrate()` is how they
 * get re-derived, and a task that prices real money should re-derive them from
 * its own accepted episodes rather than inherit these.
 */
export const CALIBRATION: Calibration = { jerkFloor: 0.26, jerkCeil: 162, parSeconds: 11 };

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Mean jerk — the third derivative of the payload path.
 *
 * Jerk, not acceleration, because a smooth carry and a snatchy one can reach
 * the same peak speed; what separates them is how abruptly the speed changes.
 */
export function meanJerk(samples: Sample[]): number {
  if (samples.length < 4) return 0;
  let sum = 0, n = 0;
  for (let i = 3; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt <= 0) continue;
    let acc = 0;
    for (let a = 0; a < 3; a++) {
      const p3 = samples[i].object[a], p2 = samples[i - 1].object[a];
      const p1 = samples[i - 2].object[a], p0 = samples[i - 3].object[a];
      const j = (p3 - 3 * p2 + 3 * p1 - p0) / (dt * dt * dt);
      acc += j * j;
    }
    sum += Math.sqrt(acc);
    n++;
  }
  return n === 0 ? 0 : sum / n;
}

/**
 * Smoothness, on a log scale.
 *
 * Measured jerk spans three orders of magnitude across real runs, so a linear
 * band saturates at both ends and turns a continuous measurement into a coin
 * flip. Log spacing gives the middle of the distribution somewhere to sit.
 */
export function smoothnessOf(jerk: number, cal: Calibration = CALIBRATION): number {
  const lo = Math.log(Math.max(cal.jerkFloor, 1e-6));
  const hi = Math.log(Math.max(cal.jerkCeil, cal.jerkFloor * 1.000001));
  return clamp01((hi - Math.log(Math.max(jerk, 1e-6))) / (hi - lo));
}

/**
 * Score a recorded episode.
 *
 * A miss scores zero throughout rather than partial credit: a payload outside
 * the declared tolerance did not do the task, and a smooth, fast miss is still
 * a miss. `parSeconds` on the trajectory overrides the calibration, so a task
 * that has calibrated its own par can pass it in.
 */
export function scoreTrajectory(traj: Trajectory, cal: Calibration = CALIBRATION): Score {
  const { samples, goal, toleranceMm } = traj;
  if (samples.length === 0) throw new Error("an episode with no samples cannot be scored");
  const last = samples[samples.length - 1];
  const durationS = last.t - samples[0].t;
  const deviationMm = Math.hypot(last.object[0] - goal[0], last.object[1] - goal[1]) * 1000;
  const jerk = meanJerk(samples);
  if (deviationMm > toleranceMm) {
    return { totalBps: 0, placement: 0, smoothness: 0, efficiency: 0,
             deviationMm, durationS, meanJerk: jerk, success: false };
  }
  const par = traj.parSeconds > 0 ? traj.parSeconds : cal.parSeconds;
  const placement = clamp01(1 - deviationMm / toleranceMm);
  const smoothness = smoothnessOf(jerk, cal);
  const efficiency = clamp01(par / Math.max(durationS, 0.001));
  const total = placement * WEIGHTS.placement + smoothness * WEIGHTS.smoothness + efficiency * WEIGHTS.efficiency;
  return { totalBps: Math.round(clamp01(total) * 10000), placement, smoothness, efficiency,
           deviationMm, durationS, meanJerk: jerk, success: true };
}

/**
 * Derive a calibration from episodes that were actually recorded.
 *
 * Refuses a small sample rather than inventing a band from it — a percentile
 * over eight runs is noise wearing a number's clothes.
 */
export function calibrate(episodes: { samples: Sample[]; durationS: number; success: boolean }[]): Calibration & { n: number } {
  const good = episodes.filter((e) => e.success);
  if (good.length < 20) {
    throw new Error(`calibration needs at least 20 successful episodes, got ${good.length}`);
  }
  const at = (a: number[], p: number) => {
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.min(s.length - 1, Math.floor(p * s.length))];
  };
  const jerks = good.map((e) => meanJerk(e.samples)).filter((j) => j > 0);
  if (jerks.length < 20) throw new Error("too few episodes with measurable jerk to calibrate");
  return {
    jerkFloor: at(jerks, 0.1),
    jerkCeil: at(jerks, 0.9),
    parSeconds: at(good.map((e) => e.durationS), 0.25),
    n: good.length,
  };
}

/**
 * The canonical bytes the payload hash commits to.
 *
 * Fixed decimals, because a float formatted one way in the browser and another
 * on the server would give two different hashes for the same episode.
 */
export function canonicalTrajectory(traj: Trajectory): string {
  const rows = traj.samples.map((s) =>
    [s.t.toFixed(4), s.q.map((v) => v.toFixed(6)).join(","), s.grip.toFixed(2),
     s.object.map((v) => v.toFixed(6)).join(",")].join("|"));
  return [
    `goal:${traj.goal[0].toFixed(6)},${traj.goal[1].toFixed(6)}`,
    `par:${traj.parSeconds.toFixed(3)}`,
    `tol:${traj.toleranceMm.toFixed(3)}`,
    ...rows,
  ].join("\n");
}
