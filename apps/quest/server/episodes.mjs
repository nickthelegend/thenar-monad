// From a headset episode and a scanned scene to the GRASP protocol's own
// types: a TaskSpec the registry can publish, a Trajectory the scorer scores,
// and the 197-byte episode leaf the log anchors.
//
// Everything that decides whether an episode is accepted runs here, on the
// station, with the protocol package's code. The headset's own opinion of
// how it did is never trusted.
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { keccak256, toHex, stringToHex, isAddress, getAddress } from "viem";
import { buildChain, Joints } from "../src/kinematics.js";
import { taskId as specHashOf, validateTaskSpec } from "../../../packages/protocol/src/taskspec.ts";
import { scoreTrajectory, canonicalTrajectory, CALIBRATION } from "../../../packages/protocol/src/score.ts";
import { encodeEpisode, hashEpisodeLeaf } from "../../../packages/protocol/src/episode.ts";

export const EMBODIMENT = "so101_mg996r_r3";
export const MANIFEST = "thenar-capture/quest3s-webxr-v1";
export const TERMS = "thenar-licence-v1";
/** What a scan can promise about where a thing is: the sheet homography's error plus a hand's placement. */
export const SCAN_UNCERTAINTY_M = 0.015;
export const TOLERANCE_MM = 45;
export const MIN_SCORE_BPS = 5000;
// Nominal, from the R3 jaw geometry: opening grows ~0.9 mm per degree of the moving jaw.
export const JAW_MM_PER_DEG = 0.9;
const LIMITS = [[-85, 85], [-80, 80], [-80, 80], [-80, 80], [-85, 85], [0, 70]];

// The gripper's pose is a function of the joints, so the station derives it
// from them with the arm's own chain instead of trusting what a client sent.
const armSpec = JSON.parse(readFileSync(new URL("../public/models/arm.json", import.meta.url)));
const fk = (() => {
  const s = armSpec.robots.follower;
  const { root, nodes } = buildChain(s.chain);
  return new Joints(root, s.joints.map((j) => nodes[j.id]), nodes[s.tcp], armSpec.limits);
})();
const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
export function withTcp(frames) {
  return frames.map((f) => {
    fk.set(f["observation.state"]);
    fk.tcpPose(_m).decompose(_p, _q, _s);
    return { ...f, "observation.tcp": [_p.x / 1000, _p.y / 1000, _p.z / 1000, _q.x, _q.y, _q.z, _q.w].map((v) => +v.toFixed(5)) };
  });
}

const m = (mm) => +(mm / 1000).toFixed(4);
const range = (v) => [+(v - SCAN_UNCERTAINTY_M).toFixed(4), +(v + SCAN_UNCERTAINTY_M).toFixed(4)];
const label = (s) => String(s ?? "").trim().slice(0, 32);
const ident = (s) => label(s).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "object";

/** Refuse a scene the arm cannot use, with the reason. */
export function checkScene(scene) {
  if (scene?.format !== "thenar-scene/1") return "Not a scene from the scan page.";
  for (const k of ["pick", "place"]) {
    const o = scene[k];
    if (!o || !label(o.label)) return `The scene has no ${k} object.`;
    if (!Number.isFinite(o.x_mm) || !Number.isFinite(o.y_mm)) return `The ${k} object has no position.`;
    const r = Math.hypot(o.x_mm, o.y_mm);
    if (r < 120 || r > 400) return `The ${o.label} is ${Math.round(r)} mm from the base; the arm reaches 120–400 mm.`;
  }
  if (Math.hypot(scene.pick.x_mm - scene.place.x_mm, scene.pick.y_mm - scene.place.y_mm) < 60)
    return "The object to pick is already on its target.";
  return null;
}

/** A scanned scene as a TaskSpec (packages/protocol/src/taskspec.ts). */
export function specFromScene(scene, { manifestSha = "" } = {}) {
  const o = (x) => ({ category: label(x.label), instances: [`scanned:${label(x.label)}:${x.colour ?? ""}`], x: range(m(x.x_mm)), y: range(m(x.y_mm)) });
  return {
    version: 1,
    embodiment: EMBODIMENT,
    actionSpace: "joint_position",
    instruction: `Pick the ${label(scene.pick.label)} and put it on the ${label(scene.place.label)}.`,
    world: {
      base: `thenar-arms/so101-mg996r-r3${manifestSha ? "@" + manifestSha.slice(0, 12) : ""}`,
      objects: [o(scene.pick), o(scene.place), ...(scene.others ?? []).slice(0, 8).map(o)],
    },
    // The protocol's predicate grammar: calls to the checkable predicates, on the objects' names.
    success: { predicate: `on(${ident(scene.pick.label)}, ${ident(scene.place.label)}) && settled(0.5)`, toleranceMm: TOLERANCE_MM, settleS: 0.5 },
    acceptance: { minScoreBps: MIN_SCORE_BPS, maxDurationS: 90, targetEpisodes: 50 },
  };
}

export function publishable(spec) {
  const issues = validateTaskSpec(spec);
  const errors = issues.filter((i) => i.severity === "error").map((i) => i.message);
  return { specHash: specHashOf(spec), errors, warnings: issues.filter((i) => i.severity === "warning").map((i) => i.message) };
}

/** The scanned world has no sampler seed; its seed is the scene's own digest, so it is fixed and checkable. */
export const worldSeedOf = (scene) => BigInt(keccak256(stringToHex(JSON.stringify({ pick: scene.pick, place: scene.place, others: scene.others ?? [] })))) >> 192n;

/**
 * Who drove the arm, derived from every frame's recorded source rather than
 * the client's label: one machine-driven frame (the scripted demo, a taught
 * repeat, a replay) makes the whole take the machine's. Only people's takes
 * earn bounties, teach, or enter a sealed corpus's cap table.
 */
export const HUMAN = new Set(["desktop", "quest-controller", "quest-hand", "leader-arm"]);
export function inputOf(frames) {
  const seen = new Set(frames.map((f) => f.source));
  if (seen.has("repeat")) return "taught-repeat";
  if (seen.has("demo")) return "scripted-demo";
  if (seen.has("replay")) return "replay";
  if (seen.has("hand")) return "quest-hand";
  if (seen.has("controller")) return "quest-controller";
  if (seen.has("leader")) return "leader-arm";
  return seen.has("desktop") ? "desktop" : "idle";
}

/** Refuse an episode that cannot be scored honestly, with the reason. */
export function checkEpisode(ep) {
  if (ep?.format !== "thenar-quest-episode/1") return "Not an episode from the Quest app.";
  const f = ep.frames;
  if (!Array.isArray(f) || f.length < 10) return "An episode needs at least 10 frames.";
  if (f.length > 30 * 120) return "An episode may not run longer than two minutes.";
  let prev = -Infinity;
  const period = f[1].t - f[0].t;
  for (const [i, x] of f.entries()) {
    if (!Number.isFinite(x.t) || x.t <= prev) return `Frame ${i} goes back in time.`;
    // The same rule scripts/ingest-episode.ts applies: no gap over 3× the sampling period.
    if (i && x.t - prev > Math.max(3 * period, 0.1)) return `Frame ${i} follows a ${(x.t - prev).toFixed(2)} s gap; the recording stalled.`;
    prev = x.t;
    const q = x["observation.state"];
    if (!Array.isArray(q) || q.length !== 6 || q.some((v, j) => !Number.isFinite(v) || v < LIMITS[j][0] - 0.01 || v > LIMITS[j][1] + 0.01))
      return `Frame ${i} has joint angles outside the arm's limits.`;
    const c = x["observation.cube"];
    if (!Array.isArray(c) || c.length < 3 || c.slice(0, 3).some((v) => !Number.isFinite(v))) return `Frame ${i} has no object position.`;
  }
  return null;
}

/** The protocol's Trajectory for a headset episode (radians, mm jaw, metres). */
export function trajectoryOf(ep, scene) {
  const t0 = ep.frames[0].t;
  return {
    samples: ep.frames.map((x) => ({
      t: +(x.t - t0).toFixed(4),
      q: x["observation.state"].map((d) => (d * Math.PI) / 180),
      grip: x["observation.state"][5] * JAW_MM_PER_DEG,
      object: x["observation.cube"].slice(0, 3),
    })),
    goal: [m(scene.place.x_mm), m(scene.place.y_mm)],
    // ingest-episode.ts refuses any other par, so the log only holds one scale.
    parSeconds: CALIBRATION.parSeconds,
    toleranceMm: TOLERANCE_MM,
  };
}

/**
 * Score an episode and build its leaf. `salt` makes the consent commitment
 * unlinkable until the contributor reveals it (the station keeps it).
 */
export function buildLeaf({ ep, scene, specHash, contributor, salt, now = Date.now() }) {
  const traj = trajectoryOf(ep, scene);
  const score = scoreTrajectory(traj);
  const accepted = score.success && score.totalBps >= MIN_SCORE_BPS;
  const payloadHash = keccak256(stringToHex(canonicalTrajectory(traj)));
  const consent = JSON.stringify({ contributor, specHash, payloadHash, terms: TERMS, scope: "train+evaluate+redistribute-with-attribution" });
  const capturedAt = BigInt(Math.floor(Date.parse(ep.started_at) / 1000));
  const episode = {
    payloadHash,
    manifestHash: keccak256(stringToHex(MANIFEST)),
    consentCommitment: keccak256(stringToHex(consent + salt)),
    termsId: keccak256(stringToHex(TERMS)),
    taskId: specHash,
    capturedAt,
    submittedAt: BigInt(Math.floor(now / 1000)),
    durationMs: Math.round(score.durationS * 1000),
    scopeBits: 11,
    // Six joints and the object's position.
    channels: 7,
    worldSeed: worldSeedOf(scene),
    successFlag: accepted ? 1 : 0,
    qualityScore: score.totalBps,
  };
  const preimage = encodeEpisode(episode);
  return { traj, score, accepted, episode, preimage, leaf: hashEpisodeLeaf(preimage), consent };
}

export function payoutAddress(a) {
  if (typeof a !== "string" || !isAddress(a, { strict: false })) return null;
  return getAddress(a);
}

export const toJSON = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? x.toString() : x)));
export { toHex };
