import { test } from "node:test";
import assert from "node:assert/strict";
import { homography, apply, sheetCorners, checkQuad, footprint } from "../src/scan-geometry.js";

// A camera looking down at the table at an angle: a known projective map.
const Htrue = [0.9, -0.12, 310, 0.05, 0.62, 140, 0.0001, 0.0009, 1];
const project = (p) => apply(Htrue, p);

test("four clicked corners recover positions on the table to within a millimetre", () => {
  const corners = sheetCorners();
  const clicks = corners.map((c) => project({ x: c.x, y: c.y }));
  const H = homography(clicks, corners);
  for (const p of [{ x: 250, y: 60 }, { x: 420, y: -130 }, { x: 150, y: 0 }]) {
    const back = apply(H, project(p));
    assert.ok(Math.hypot(back.x - p.x, back.y - p.y) < 1, `${JSON.stringify(p)} → ${JSON.stringify(back)}`);
  }
});

test("a bad set of clicks is refused with a reason", () => {
  assert.match(checkQuad([{ x: 0, y: 0 }, { x: 10, y: 0 }]), /four corners/);
  assert.match(checkQuad([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 0, y: 200 }, { x: 200, y: 200 }]), /cross/);
  assert.match(checkQuad([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }, { x: 0, y: 5 }]), /too small/);
  assert.equal(checkQuad([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 220, y: 150 }, { x: -10, y: 160 }]), null);
});

test("an object stands where the bottom of its box meets the table", () => {
  assert.deepEqual(footprint({ x: 100, y: 50, w: 40, h: 80 }), { x: 120, y: 130 });
});
