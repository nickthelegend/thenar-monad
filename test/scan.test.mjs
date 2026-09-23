import { test } from "node:test";
import assert from "node:assert/strict";
import { parseScan, formatScan, instructionOf, checkScan, homography, apply, sheetCorners, checkQuad, footprint } from "../lib/scan.ts";
import { goalFor, startFor, GOAL, START } from "../lib/bench.ts";
import { evaluate, deviationFromSamples } from "../lib/score.ts";

test("a scanned scene round-trips through the task's name", () => {
  const name = formatScan("Put the cup on the coaster", { pick: [0.202, 0.038], place: [0.288, -0.066] });
  assert.equal(name, "Put the cup on the coaster [scan 202,38 > 288,-66]");
  assert.deepEqual(parseScan(name), { pick: [0.202, 0.038], place: [0.288, -0.066] });
  assert.equal(instructionOf(name), "Put the cup on the coaster");
});

test("an ordinary task has no scene and keeps the bench's datum", () => {
  assert.equal(parseScan("Put the toothpaste into the upper drawer"), null);
  assert.deepEqual(goalFor("Put the toothpaste into the upper drawer"), GOAL);
  assert.deepEqual(startFor(undefined), START);
  assert.deepEqual(goalFor("Put the cup on the coaster [scan 202,38 > 288,-66]"), [0.288, -0.066]);
});

test("a scene the arm cannot use is refused, with the reason", () => {
  assert.match(checkScan({ pick: [0.6, 0], place: [0.2, 0] }), /600 mm/);
  assert.match(checkScan({ pick: [0.2, 0.01], place: [0.21, 0.02] }), /already on its target/);
  assert.equal(parseScan("Move it [scan 600,0 > 200,0]"), null, "an out-of-reach tag is not a scene");
});

test("four clicked corners measure the table to within a millimetre", () => {
  const Htrue = [0.9, -0.12, 310, 0.05, 0.62, 140, 0.0001, 0.0009, 1];
  const corners = sheetCorners();
  const H = homography(corners.map((c) => apply(Htrue, c)), corners);
  for (const p of [{ x: 250, y: 60 }, { x: 150, y: 0 }]) {
    const back = apply(H, apply(Htrue, p));
    assert.ok(Math.hypot(back.x - p.x, back.y - p.y) < 1);
  }
  assert.match(checkQuad([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }, { x: 200, y: 200 }]), /cross/);
  assert.deepEqual(footprint({ x: 100, y: 50, w: 40, h: 80 }), { x: 120, y: 130 });
});

test("a scanned task is scored against its own goal, not the bench's", () => {
  const place = [0.288, -0.066];
  const samples = Array.from({ length: 40 }, (_, i) => ({ t: i / 20, q: [0, 0, 0, 0, 0, 0], grip: i > 5 && i < 30 ? 6 : 42, object: [0.202 + ((place[0] - 0.202) * Math.min(i, 30)) / 30, 0.038 + ((place[1] - 0.038) * Math.min(i, 30)) / 30, 0] }));
  assert.ok(deviationFromSamples(samples, place) < 1);
  assert.ok(deviationFromSamples(samples) > 100, "against the bench goal it would be far off");
  const traj = { taskId: "5", samples, durationSeconds: 2, success: true, deviationMm: 0 };
  assert.equal(evaluate(traj, 60, 1, place).success, true);
  assert.equal(evaluate(traj, 60, 1).success, false);
});

test("the arm travels in the name too, beside the scan, and either can be absent", async () => {
  const { formatName, armOf, instructionOf, parseScan } = await import("../lib/scan.ts");
  const n = formatName("Put the glass on the plate", { arm: "so101", scan: { pick: [0.199, 0.035], place: [0.309, -0.052] } });
  assert.equal(n, "Put the glass on the plate [arm so101] [scan 199,35 > 309,-52]");
  assert.equal(armOf(n), "so101");
  assert.equal(instructionOf(n), "Put the glass on the plate");
  assert.deepEqual(parseScan(n), { pick: [0.199, 0.035], place: [0.309, -0.052] });
  assert.equal(formatName(n, { arm: "thenar6" }), "Put the glass on the plate [arm thenar6]");
  assert.equal(armOf(formatName(n, { arm: "thenar6" })), "thenar6");
});

test("an untagged task runs on the SO-101, unless it needs two arms", async () => {
  const { armOf } = await import("../lib/scan.ts");
  assert.equal(armOf("Put the pen on the closed laptop"), "so101");
  assert.equal(armOf("Steady the crate with both arms and place the battery inside"), "thenar6");
  assert.equal(armOf("Steady the crate with both arms [arm so101]"), "so101", "a tag always wins");
});
