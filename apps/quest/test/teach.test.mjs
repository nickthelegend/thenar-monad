import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as THREE from "three";
import { buildChain, Joints, solveIK } from "../src/kinematics.js";
import { Task } from "../src/task.js";
import { learn, poseAt } from "../src/teach.js";

const arm = JSON.parse(readFileSync(new URL("../public/models/arm.json", import.meta.url)));
const ONE = new THREE.Vector3(1, 1, 1);

function rig() {
  const spec = arm.robots.follower;
  const { root, nodes } = buildChain(spec.chain);
  const joints = new Joints(root, spec.joints.map((j) => nodes[j.id]), nodes[spec.tcp], arm.limits);
  joints.set(arm.home);
  return { joints, task: new Task(new THREE.Group()) };
}
const down = (x, y) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(y, x)));

/** Drive the arm through target poses at 30 Hz, stepping the task, and record it as the app does. */
function run({ joints, task }, poseFn, T) {
  const frames = [];
  const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
  const dt = 1 / 30;
  for (let t = 0; t <= T; t += dt) {
    const { pos, quat, grip } = poseFn(t);
    solveIK(joints, new THREE.Matrix4().compose(pos, quat, ONE));
    const qq = [...joints.q];
    qq[5] = grip;
    joints.set(qq);
    task.step(joints.tcpPose(m), grip, dt);
    joints.tcpPose(m).decompose(p, q, s);
    frames.push({
      t,
      "observation.state": [...joints.q],
      "observation.tcp": [p.x / 1000, p.y / 1000, p.z / 1000, q.x, q.y, q.z, q.w],
      "observation.cube": task.cubePose(),
      "observation.held": !!task.held,
    });
  }
  return frames;
}

// A demonstration: the same keyframed pick-and-place the desktop demo runs.
function demo(c, g) {
  const keys = [
    [0, [c.x, c.y, 120], 60], [1.0, [c.x, c.y, 22], 60], [1.5, [c.x, c.y, 22], 0], [2.3, [c.x, c.y, 130], 0],
    [3.6, [g.x, g.y, 130], 0], [4.4, [g.x, g.y, 36], 0], [4.9, [g.x, g.y, 36], 60], [5.6, [g.x, g.y, 140], 60],
  ];
  return (t) => {
    let i = 0;
    while (i < keys.length - 2 && keys[i + 1][0] < t) i++;
    const [ta, pa, ga] = keys[i], [tb, pb, gb] = keys[i + 1];
    const k = Math.min(1, Math.max(0, (t - ta) / (tb - ta)));
    const pos = new THREE.Vector3(...pa).lerp(new THREE.Vector3(...pb), k);
    return { pos, quat: down(pos.x, pos.y), grip: ga + (gb - ga) * k };
  };
}

test("a take in which nothing was picked up teaches nothing, and says so", () => {
  const r = rig();
  const frames = run(r, () => ({ pos: new THREE.Vector3(300, 0, 150), quat: down(300, 0), grip: 60 }), 1);
  const { skill, reason } = learn({ frames });
  assert.equal(skill, null);
  assert.match(reason, /never picked up/);
});

test("taught once, the arm repeats the task with the cube and pad moved", () => {
  const teachRig = rig();
  const frames = run(teachRig, demo(teachRig.task.cubeStart, teachRig.task.goal), 5.6);
  assert.equal(teachRig.task.success, true, "the demonstration itself succeeds");
  const { skill } = learn({ frames, started_at: "t", task: { goal: [teachRig.task.goal.x, teachRig.task.goal.y] } });
  assert.ok(skill);

  // New layout: cube and pad both elsewhere, and on other bearings from the base.
  for (const [cube, pad] of [[[300, 40], [250, -150]], [[260, 130], [300, -60]]]) {
    const r = rig();
    r.task.cubeStart.set(cube[0], cube[1], 14);
    r.task.goal.set(pad[0], pad[1], 0);
    r.task.reset();
    run(r, (t) => {
      const { p, q, grip } = poseAt(skill, t, [cube[0] / 1000, cube[1] / 1000], [pad[0] / 1000, pad[1] / 1000]);
      return { pos: new THREE.Vector3(p[0] * 1000, p[1] * 1000, p[2] * 1000), quat: new THREE.Quaternion(...q), grip };
    }, skill.duration_s);
    assert.equal(r.task.success, true, `cube ${cube} → pad ${pad}: ended ${r.task.status()} at ${r.task.cube.position.toArray().map(Math.round)}`);
  }
});
