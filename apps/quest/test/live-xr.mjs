// Live, the headset path (TESTPLAN D1–D4) under Meta's IWER emulator in a
// headed Chromium, against the running dev server and station on Monad
// testnet. The emulated Quest's controllers are driven through IWER's own
// device API: squeeze, move, trigger, B, left-stick click.
//
//   TASK=0x… PAYOUT=0x… SHOTS=dir node test/live-xr.mjs      (one anchor + one bounty)
import { chromium } from "playwright";
import { join } from "node:path";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:5174";
const { TASK, PAYOUT, SHOTS } = process.env;
if (!TASK || !PAYOUT) throw new Error("TASK and PAYOUT are required");

const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,950"] });
const page = await browser.newPage({ viewport: { width: 1480, height: 860 } });
const errors = [], failed = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, `xr-${n}.png`) });
const log = (k, v) => console.log(k, JSON.stringify(v));

try {
  await page.goto(`${BASE}/?emulate=bare&task=${TASK}`);
  await page.waitForFunction((t) => window.thenar?.station?.current?.specHash === t, TASK, { timeout: 60000 });
  await page.fill("#payout", PAYOUT);
  await page.press("#payout", "Tab");

  // D1
  await page.click("#enter-vr");
  await page.waitForFunction(() => /VR/.test(document.querySelector("#xr-state").textContent));
  await page.waitForTimeout(800);
  const hudTask = await page.evaluate(() => document.querySelector("#station-line").textContent);
  log("d1", { xr: await page.textContent("#xr-state"), line: hudTask });
  await page.evaluate(async () => {
    const a = (-40 * Math.PI) / 180;
    xrDevice.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2));
    await new Promise((r) => setTimeout(r, 300));
  });
  await shot("d1-vr");

  // D2 + D3: do the task with the right controller, recording it with B.
  const run = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const r = xrDevice.controllers.right;
    const press = async (id) => (r.updateButtonValue(id, 1), await wait(250), r.updateButtonValue(id, 0), await wait(250));
    const V = thenar.target.position.constructor;
    const world = (o) => o.getWorldPosition(new V());
    // Move the controller so the gripper travels by (dx,dy,dz) metres, in steps.
    async function move(d, steps = 30) {
      const p0 = { x: r.position.x, y: r.position.y, z: r.position.z };
      for (let i = 1; i <= steps; i++) (r.position.set(p0.x + (d.x * i) / steps, p0.y + (d.y * i) / steps, p0.z + (d.z * i) / steps), await wait(25));
      await wait(200);
    }
    const tcp = () => world(thenar.follower.tcp);
    await press("b-button");
    const recording = thenar.recorder.recording;
    r.updateButtonValue("squeeze", 1);
    await wait(200);
    // D2: a pure translation of the controller moves the gripper by the same amount.
    const t0 = tcp();
    await move({ x: 0, y: 0.06, z: 0 });
    const t1 = tcp();
    const follow = [t1.x - t0.x, t1.y - t0.y, t1.z - t0.z].map((v) => +(v * 1000).toFixed(1));
    // Over the object, down onto it, close, carry it to the target, let go.
    const cube = world(thenar.task.cube), pad = world(thenar.task.pad);
    let c = tcp();
    await move({ x: cube.x - c.x, y: cube.y + 0.07 - c.y, z: cube.z - c.z });
    c = tcp();
    await move({ x: cube.x - c.x, y: cube.y + 0.01 - c.y, z: cube.z - c.z });
    r.updateButtonValue("trigger", 1);
    await wait(500);
    const held = !!thenar.task.held;
    c = tcp();
    await move({ x: 0, y: 0.09, z: 0 });
    c = tcp();
    await move({ x: pad.x - c.x, y: 0, z: pad.z - c.z });
    c = tcp();
    await move({ x: 0, y: pad.y + 0.03 - c.y, z: 0 });
    r.updateButtonValue("trigger", 0);
    await wait(900);
    r.updateButtonValue("squeeze", 0);
    await wait(200);
    const success = thenar.task.success;
    await press("b-button"); // stop: a placed object goes straight to the station
    return { recording, follow, held, success, input: thenar.episodes.at(-1)?.input };
  });
  log("d2-d3-run", run);
  assert.equal(run.recording, true, "B started recording");
  assert.ok(Math.abs(run.follow[1] - 60) < 5 && Math.abs(run.follow[0]) < 5 && Math.abs(run.follow[2]) < 5, `gripper moved ${run.follow} for a 60 mm lift`);
  assert.equal(run.held, true, "the trigger closed the jaws on the object");
  assert.equal(run.success, true, "the object ended on its target");
  assert.equal(run.input, "quest-controller");
  await page.waitForFunction(() => /^Accepted|^Not accepted/.test(document.querySelector("#station-line").textContent), null, { timeout: 90000 });
  const d3 = await page.textContent("#station-line");
  log("d3-line", d3);
  assert.match(d3, /^Accepted .* paid 0\.001 MON/);
  await page.waitForTimeout(500);
  await shot("d3-hud");

  // D4: left-stick click runs the taught skill.
  await page.evaluate(async () => {
    const l = xrDevice.controllers.left;
    l.updateButtonValue("thumbstick", 1);
    await new Promise((r) => setTimeout(r, 250));
    l.updateButtonValue("thumbstick", 0);
  });
  await page.waitForFunction(() => window.thenar.repeating, null, { timeout: 5000 });
  await page.waitForFunction(() => !window.thenar.repeating, null, { timeout: 30000 });
  const d4 = await page.textContent("#station-line");
  log("d4-line", d4);
  assert.match(d4, /The taught skill put the .+ ✓/);

  log("console-errors", errors);
  log("failed-requests", failed);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log("LIVE D1–D4: PASS");
} finally {
  await browser.close();
}
