import { test } from "node:test";
import assert from "node:assert/strict";
import { checkScene, specFromScene, publishable, checkEpisode, buildLeaf, trajectoryOf, payoutAddress } from "../server/episodes.mjs";
import { learn } from "../src/teach.js";

const scene = {
  format: "thenar-scene/1",
  pick: { label: "Red cup", colour: "#c33", x_mm: 285, y_mm: 90 },
  place: { label: "book", colour: "#35c", x_mm: 280, y_mm: -105 },
  others: [{ label: "bottle", colour: "#999", x_mm: 200, y_mm: 0 }],
};

test("a scanned scene becomes a spec the protocol's own validator accepts", () => {
  assert.equal(checkScene(scene), null);
  const spec = specFromScene(scene);
  const { specHash, errors } = publishable(spec);
  assert.deepEqual(errors, []);
  assert.match(specHash, /^0x[0-9a-f]{64}$/);
  assert.equal(spec.success.predicate, "on(red_cup, book) && settled(0.5)");
  assert.equal(spec.instruction, "Pick the Red cup and put it on the book.");
  assert.equal(publishable(specFromScene(scene)).specHash, specHash, "the same scene always hashes the same");
});

test("scenes the arm cannot do are refused with a reason", () => {
  assert.match(checkScene({ ...scene, pick: { ...scene.pick, x_mm: 600, y_mm: 0 } }), /600 mm/);
  assert.match(checkScene({ ...scene, place: { ...scene.pick, label: "x" } }), /already on its target/);
  assert.match(checkScene({}), /Not a scene/);
});

// An episode as the recorder writes it: the object carried from pick to place.
function episode({ endAt = scene.place, frames = 150 } = {}) {
  const f = [];
  for (let i = 0; i < frames; i++) {
    const k = i / (frames - 1);
    const held = k > 0.3 && k < 0.8;
    const s = Math.min(1, Math.max(0, (k - 0.3) / 0.5));
    const x = (scene.pick.x_mm + (endAt.x_mm - scene.pick.x_mm) * s) / 1000, y = (scene.pick.y_mm + (endAt.y_mm - scene.pick.y_mm) * s) / 1000;
    f.push({ t: i / 30, "observation.state": [0, -25 + 10 * k, 35, 0, 0, held ? 0 : 60], action: [0, 0, 0, 0, 0, 0], "observation.tcp": [x, y, 0.05, 0, 0.7071, 0, 0.7071], "observation.cube": [x, y, 0.014, 0, 0, 0, 1], "observation.held": held });
  }
  return { format: "thenar-quest-episode/1", started_at: "2026-09-23T10:00:00.000Z", input: "desktop", frames: f };
}

test("episodes that cannot be scored honestly are refused", () => {
  assert.equal(checkEpisode(episode()), null);
  assert.match(checkEpisode({ ...episode(), frames: episode().frames.slice(0, 5) }), /at least 10/);
  const gap = episode();
  gap.frames = [...gap.frames.slice(0, 20), ...gap.frames.slice(40)];
  assert.match(checkEpisode(gap), /gap/);
  const bad = episode();
  bad.frames[3]["observation.state"][1] = 200;
  assert.match(checkEpisode(bad), /limits/);
});

test("a placed object scores and is accepted; a miss scores zero", () => {
  const spec = specFromScene(scene);
  const { specHash } = publishable(spec);
  const good = buildLeaf({ ep: episode(), scene, specHash, contributor: "0x1", salt: "a" });
  assert.equal(good.accepted, true);
  assert.ok(good.score.totalBps >= 5000);
  assert.equal(good.preimage.length, 2 + 197 * 2);
  const miss = buildLeaf({ ep: episode({ endAt: { x_mm: 200, y_mm: 20 } }), scene, specHash, contributor: "0x1", salt: "a" });
  assert.equal(miss.accepted, false);
  assert.equal(miss.score.totalBps, 0);
  // The salt changes the consent commitment, and so the leaf, but not the score.
  const other = buildLeaf({ ep: episode(), scene, specHash, contributor: "0x1", salt: "b" });
  assert.notEqual(other.leaf, good.leaf);
  assert.equal(other.score.totalBps, good.score.totalBps);
  const traj = trajectoryOf(episode(), scene);
  assert.equal(traj.samples[0].q.length, 6);
  assert.ok(Math.abs(traj.samples[0].q[1] - (-25 * Math.PI) / 180) < 1e-9, "degrees become radians");
});

test("payout addresses are checksummed or refused", () => {
  assert.equal(payoutAddress("0xdf93bda9b5de2fbf71c2201268deff54c1689815"), "0xDf93bdA9B5de2fBf71C2201268DEFf54c1689815");
  assert.equal(payoutAddress("0x123"), null);
  assert.equal(payoutAddress(42), null);
});

test("teach learns from the recorder's own frames", () => {
  const { skill } = learn({ ...episode(), task: { goal: [scene.place.x_mm, scene.place.y_mm] } });
  assert.ok(skill.grasp_t > 0 && skill.release_t > skill.grasp_t);
});

test("the station derives the gripper's pose from the joints, not from the client", async () => {
  const { withTcp } = await import("../server/episodes.mjs");
  const ep = episode();
  ep.frames[0]["observation.tcp"] = [739.8, 200, -0.74, -0.5, 0.5, 0.5, 0.5];
  const f = withTcp(ep.frames.slice(0, 2));
  // Home-ish joints put the gripper ~0.34 m ahead and ~0.2 m up.
  assert.ok(f[0]["observation.tcp"][0] > 0.2 && f[0]["observation.tcp"][0] < 0.45, JSON.stringify(f[0]["observation.tcp"]));
  assert.ok(Math.abs(Math.hypot(...f[0]["observation.tcp"].slice(3)) - 1) < 1e-3);
});

test("who drove the arm is read from every frame, not the client's label", async () => {
  const { inputOf, HUMAN } = await import("../server/episodes.mjs");
  const f = (...s) => s.map((source) => ({ source }));
  assert.equal(inputOf(f("idle", "desktop", "desktop")), "desktop");
  assert.equal(inputOf(f("desktop", "demo", "desktop")), "scripted-demo");
  assert.equal(inputOf(f("controller", "repeat")), "taught-repeat");
  assert.equal(inputOf(f("idle", "hand")), "quest-hand");
  assert.ok(HUMAN.has("quest-controller") && !HUMAN.has("scripted-demo") && !HUMAN.has("taught-repeat"));
});
