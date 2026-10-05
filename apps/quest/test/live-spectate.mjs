// Live E1: an operator and a spectator in two headed windows, through the
// running station. The spectator must load the operator's scanned scene and
// settle on exactly the operator's joints. No transactions.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:5174";
const { TASK, SHOTS } = process.env;
const browser = await chromium.launch({ headless: false });
const errors = [];
async function open(path) {
  const ctx = await browser.newContext({ viewport: { width: 1100, height: 700 } });
  const p = await ctx.newPage();
  p.on("console", (m) => m.type() === "error" && errors.push(`${path}: ${m.text()}`));
  p.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  await p.goto(BASE + path);
  await p.waitForFunction(() => window.thenar?.follower, null, { timeout: 60000 });
  return p;
}
try {
  const op = await open(`/?task=${TASK}`);
  await op.waitForFunction((t) => window.thenar.station.current?.specHash === t, TASK);
  const sp = await open("/?spectate=1");
  await op.click("#demo");
  await op.waitForFunction(() => window.thenar.source === "demo");
  let mirrored = 0;
  for (let i = 0; i < 12; i++) {
    await op.waitForTimeout(500);
    if ((await sp.evaluate(() => thenar.source)) === "remote") mirrored++;
  }
  if (SHOTS) await sp.screenshot({ path: join(SHOTS, "e1-spectator.png") });
  await op.waitForFunction(() => window.thenar.source !== "demo", null, { timeout: 30000 });
  await op.waitForTimeout(800);
  const [a, b, scene] = await Promise.all([op.evaluate(() => thenar.q.slice()), sp.evaluate(() => thenar.q.slice()), sp.evaluate(() => ({ goal: thenar.task.goal.toArray(), start: thenar.task.cubeStart.toArray(), label: thenar.task.label, placed: thenar.task.placed }))]);
  const off = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  console.log(JSON.stringify({ mirrored, off, scene, errors }));
  assert.ok(mirrored >= 10, `mirrored ${mirrored}/12`);
  assert.ok(off < 0.01, `spectator ${off}° off`);
  assert.deepEqual(scene.label, { pick: "cup", place: "shaker" });
  assert.deepEqual(scene.start.slice(0, 2), [156, 64]);
  assert.equal(scene.placed, 1, "the spectator saw the cup land");
  assert.deepEqual(errors, []);
  console.log("LIVE E1: PASS");
} finally {
  await browser.close();
}
