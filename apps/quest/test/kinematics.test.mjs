import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildChain, Joints, solveIK } from "../src/kinematics.js";

const arm = JSON.parse(readFileSync(new URL("../public/models/arm.json", import.meta.url)));

function follower() {
  const spec = arm.robots.follower;
  const { root, nodes } = buildChain(spec.chain);
  const joints = new Joints(root, spec.joints.map((j) => nodes[j.id]), nodes[spec.tcp], arm.limits);
  joints.set(arm.home);
  return joints;
}

// A deterministic spread of poses inside the limits, away from the edges.
function* poses(count) {
  let s = 20260923;
  const r = () => ((s = (s * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
  for (let i = 0; i < count; i++) yield arm.limits.slice(0, 5).map(([lo, hi]) => lo * 0.7 + (hi - lo) * 0.7 * r());
}

test("the chain has six joints and a TCP", () => {
  const j = follower();
  assert.equal(j.nodes.length, 6);
  const p = new THREE.Vector3().setFromMatrixPosition(j.tcpPose());
  // The SO-101 reaches roughly 0.3–0.4 m; a TCP at the origin means a broken chain.
  assert.ok(p.length() > 150 && p.length() < 500, `TCP at ${p.toArray()}`);
});

test("joints clamp to the manifest's limits", () => {
  const j = follower();
  const q = j.set([999, -999, 0, 0, 0, 999]);
  assert.deepEqual([q[0], q[1], q[5]], [arm.limits[0][1], arm.limits[1][0], arm.limits[5][1]]);
});

test("IK recovers reachable poses from home, position within 2 mm", () => {
  const j = follower();
  let worst = 0, solved = 0;
  for (const q of poses(40)) {
    j.set([...q, 20]);
    const target = j.tcpPose().clone();
    j.set(arm.home);
    let err = Infinity;
    // A few frames of the solver, as the headset would run it.
    for (let f = 0; f < 8 && err > 2; f++) err = solveIK(j, target);
    worst = Math.max(worst, err);
    if (err < 2) solved++;
  }
  assert.ok(solved >= 38, `solved ${solved}/40, worst ${worst.toFixed(2)} mm`);
});

test("IK tracks a moving target frame to frame", () => {
  const j = follower();
  const start = j.tcpPose().clone();
  const p = new THREE.Vector3().setFromMatrixPosition(start);
  let worst = 0;
  for (let f = 0; f < 90; f++) {
    const t = start.clone().setPosition(p.x + 40 * Math.sin(f / 15), p.y + 40 * (1 - Math.cos(f / 15)), p.z + 20 * Math.sin(f / 10));
    worst = Math.max(worst, solveIK(j, t, { iterations: 6 }));
  }
  assert.ok(worst < 3, `worst ${worst.toFixed(2)} mm`);
});
