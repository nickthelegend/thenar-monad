/* caplogic.js — the mechanics of a capture, with no DOM in sight.
 *
 * Everything here is pure: given a state and an input, it returns the next
 * state. That is what lets the capture loop be tested without a browser, and
 * what lets the same functions run in a headless replay to check that a
 * submitted trajectory really does produce the score it claims.
 */
import { keccak256 } from "./keccak.js";
import { scoreTrajectory, canonicalTrajectory, CALIBRATION } from "./score.js";
import { encodeEpisode, hashEpisodeLeaf } from "./episode.js";

export const HZ = 20;
/* A sample gap this much larger than the sampling period means the recorder
   stopped: a hidden tab, a stalled frame loop, a machine that went to sleep.
   The samples either side are real, but the span between them is not a
   demonstration, and a trajectory that hides it would claim a duration nobody
   was driving through. */
export const MAX_GAP_FACTOR = 3;
export const GRIP_OPEN = 42, GRIP_CLOSED = 12, GRIP_SHUT = 6;
export const CAPTURE_R = 0.06;   // metres; the jaws have to be this close
export const L1 = 0.30, L2 = 0.26;

/** Two-link planar arm. A target outside the annulus is clamped onto it, and
 *  says so, rather than silently teleporting the tool somewhere unreachable. */
export function solve(x, y) {
  const r = Math.hypot(x, y);
  const rc = Math.max(Math.abs(L1 - L2) + 1e-4, Math.min(L1 + L2 - 1e-4, r));
  const s = r === 0 ? 0 : rc / r;
  const cx = r === 0 ? rc : x * s, cy = r === 0 ? 0 : y * s;
  const c2 = (cx * cx + cy * cy - L1 * L1 - L2 * L2) / (2 * L1 * L2);
  const j2 = Math.acos(Math.max(-1, Math.min(1, c2)));
  const j1 = Math.atan2(cy, cx) - Math.atan2(L2 * Math.sin(j2), L1 + L2 * Math.cos(j2));
  return { j1, j2, clamped: Math.abs(rc - r) > 1e-9, x: cx, y: cy };
}

/** Forward kinematics, used to check the solver against itself. */
export function forward(j1, j2) {
  return [L1 * Math.cos(j1) + L2 * Math.cos(j1 + j2),
          L1 * Math.sin(j1) + L2 * Math.sin(j1 + j2)];
}

/**
 * Where the payload has to end up. The spec names a datum in its predicate but
 * does not place one, so it is drawn from the same taskId and seed the world
 * came from: reproducible by anyone holding the episode, and written into the
 * trajectory so a verifier never has to guess it.
 */
export function datumFor(taskId, seed, spec) {
  const h = keccak256(taskId + BigInt(seed).toString(16).padStart(16, "0") + "0d47a3");
  const u = (i) => Number(BigInt("0x" + h.slice(2 + i * 8, 10 + i * 8))) / 2 ** 32;
  const xr = spec.world.objects[0].x, yr = spec.world.objects[0].y;
  return [xr[0] - 0.10 - u(0) * 0.06, yr[0] - 0.06 - u(1) * 0.10];
}

export function initialState(spec, taskId, scene) {
  const first = scene.objects[0];
  return {
    tool: [first.x + 0.05, first.y + 0.05],
    payload: [first.x, first.y, 0],
    goal: datumFor(taskId, scene.seed, spec),
    grip: GRIP_OPEN,
    held: false, everHeld: false, drops: 0,
    samples: [], t: 0, acc: 0,
  };
}

/**
 * One tick. The grasp forms only when the jaws close inside the capture volume
 * and breaks the moment they open — which is why an operator who opens the
 * jaws early leaves the payload where it was dropped, and the score records it.
 */
export function tick(st, dt, tSeconds) {
  const ik = solve(st.tool[0], st.tool[1]);
  const near = Math.hypot(ik.x - st.payload[0], ik.y - st.payload[1]) < CAPTURE_R;
  if (!st.held && st.grip <= GRIP_CLOSED && near) { st.held = true; st.everHeld = true; }
  else if (st.held && st.grip > GRIP_CLOSED) { st.held = false; st.drops++; }
  if (st.held) { st.payload[0] = ik.x; st.payload[1] = ik.y; }

  st.acc += dt;
  if (st.acc >= 1 / HZ - 1e-9) {
    st.acc = 0;
    st.samples.push({
      t: +tSeconds.toFixed(4),
      q: [ik.j1, ik.j2, 0, 0, 0, 0],
      grip: st.grip,
      object: [st.payload[0], st.payload[1], 0],
    });
  }
  st.t = tSeconds;
  return st;
}

export const toggleGrip = (st) => {
  st.grip = st.grip > GRIP_CLOSED ? GRIP_SHUT : GRIP_OPEN;
  return st;
};

const hex = (s) => "0x" + Array.from(new TextEncoder().encode(s),
  (b) => b.toString(16).padStart(2, "0")).join("");

/**
 * Turn a finished run into a scored episode leaf.
 *
 * Refuses a run with no grasp in it: an operator who never picked anything up
 * has not demonstrated the task, and a leaf claiming otherwise would be the
 * exact dishonesty the log exists to prevent.
 */
export function findGaps(samples, hz = HZ) {
  const limit = (MAX_GAP_FACTOR / hz);
  const out = [];
  for (let i = 1; i < samples.length; i++) {
    const dt = samples[i].t - samples[i - 1].t;
    if (dt > limit) out.push({ at: samples[i - 1].t, seconds: dt });
  }
  return out;
}

export function finishEpisode(st, spec, taskId, opts = {}) {
  if (!st.everHeld || st.samples.length < 4) {
    return { recorded: false,
      reason: st.everHeld ? "the run was too short to measure" : "the payload was never picked up" };
  }
  const traj = {
    samples: st.samples,
    goal: st.goal,
    // Par comes from the calibration, not from half the time limit: the limit
    // is what a run must not exceed, which is a different thing from what a
    // competent run takes. Recorded here so a verifier scores it the same way.
    parSeconds: opts.parSeconds ?? CALIBRATION.parSeconds,
    toleranceMm: spec.success.toleranceMm,
  };
  const gaps = findGaps(st.samples);
  if (gaps.length) {
    // Refused rather than scored down: there is no honest score for a run whose
    // recording stopped partway. The operator can simply run it again.
    return { recorded: false, gaps,
      reason: `the recording stopped for ${gaps.reduce((a, g) => a + g.seconds, 0).toFixed(1)} s ` +
              `across ${gaps.length} gap(s), so the run is not a continuous demonstration` };
  }
  const score = scoreTrajectory(traj);
  const overrun = score.durationS > spec.acceptance.maxDurationS;
  const accepted = score.success && !overrun && score.totalBps >= spec.acceptance.minScoreBps;

  const payloadHash = keccak256(hex(canonicalTrajectory(traj)));
  const now = BigInt(opts.now ?? Math.floor(Date.now() / 1000));
  const episode = {
    payloadHash,
    manifestHash: keccak256(hex("thenar-capture/browser-kinematic-v1")),
    consentCommitment: opts.consentCommitment ?? keccak256(hex(`consent:${payloadHash}`)),
    termsId: keccak256(hex("thenar-licence-v1")),
    taskId,
    capturedAt: now - BigInt(Math.round(score.durationS)),
    submittedAt: now,
    durationMs: Math.round(score.durationS * 1000),
    scopeBits: 11,
    channels: 3,
    worldSeed: BigInt(st.seedUsed ?? opts.seed ?? 0),
    successFlag: accepted ? 1 : 0,
    qualityScore: score.totalBps,
  };
  const preimage = encodeEpisode(episode);
  return { recorded: true, accepted, overrun, gaps, score, trajectory: traj, episode,
           preimage, leaf: hashEpisodeLeaf(preimage) };
}

/** Recompute a submitted episode's score from its own trajectory. A buyer, or
 *  the ingest script, runs this rather than trusting the number in the leaf. */
export function replay(bundle, spec) {
  const gaps = findGaps(bundle.trajectory.samples);
  const score = scoreTrajectory(bundle.trajectory);
  const payloadHash = keccak256(hex(canonicalTrajectory(bundle.trajectory)));
  return {
    gaps,
    continuous: gaps.length === 0,
    scoreMatches: score.totalBps === bundle.episode.qualityScore,
    payloadMatches: payloadHash.toLowerCase() === String(bundle.episode.payloadHash).toLowerCase(),
    recomputed: score,
  };
}
