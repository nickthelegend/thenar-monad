import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildChain, Joints, solveIK } from "../src/kinematics.js";
import { Task } from "../src/task.js";

const arm = JSON.parse(readFileSync(new URL("../public/models/arm.json", import.meta.url)));
const ONE = new THREE.Vector3(1, 1, 1);
const down = (x, y) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(y, x)));

// The desktop demo's keyframes (src/main.js demoPose), run against scanned layouts.
function runDemo(cube, pad) {
  const spec = arm.robots.follower;
  const { root, nodes } = buildChain(spec.chain);
  const j = new Joints(root, spec.joints.map((x) => nodes[x.id]), nodes[spec.tcp], arm.limits);
  j.set(arm.home);
  const task = new Task(new THREE.Group());
  task.setScene({ pick: { label: "a", x_mm: cube[0], y_mm: cube[1] }, place: { label: "b", x_mm: pad[0], y_mm: pad[1] } });
  const c = task.cubeStart, g = task.goal;
  const keys = [[0, [c.x, c.y, 120], 60], [1.4, [c.x, c.y, 120], 60], [2.4, [c.x, c.y, 22], 60], [3.0, [c.x, c.y, 22], 0], [3.9, [c.x, c.y, 130], 0],
    [5.4, [g.x, g.y, 130], 0], [6.3, [g.x, g.y, 36], 0], [6.9, [g.x, g.y, 36], 60], [7.8, [g.x, g.y, 140], 60], [9.0, [g.x, g.y, 140], 60]];
  const m = new THREE.Matrix4();
  for (let t = 0; t <= 9.2; t += 1 / 60) {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] < t) i++;
    const [ta, pa, ga] = keys[i], [tb, pb, gb] = keys[i + 1];
    const k = THREE.MathUtils.smootherstep(t, ta, tb);
    const p = new THREE.Vector3(...pa).lerp(new THREE.Vector3(...pb), k);
    solveIK(j, new THREE.Matrix4().compose(p, down(p.x, p.y), ONE), { seed: arm.home });
    const q = [...j.q];
    q[5] = ga + (gb - ga) * k;
    j.set(q);
    task.step(j.tcpPose(m), q[5], 1 / 60);
  }
  return task;
}

test("the demo completes on layouts across the reach, including near the base", () => {
  for (const [cube, pad] of [[[285, 90], [280, -105]], [[156, 64], [171, -34]], [[200, 120], [330, -40]]]) {
    const t = runDemo(cube, pad);
    assert.equal(t.success, true, `cube ${cube} → pad ${pad}: ${t.status()} at ${t.cube.position.toArray().map(Math.round)}`);
  }
});
