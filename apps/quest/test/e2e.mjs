// End to end in headless Chromium: the desktop operator, a spectator mirroring
// it through the relay, and the headset path under Meta's WebXR emulator.
//
//   pnpm e2e            (starts its own dev server and relay on spare ports)
//   SHOTS=dir pnpm e2e  (also writes screenshots there)
import { chromium } from "playwright";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import assert from "node:assert/strict";

const cwd = new URL("..", import.meta.url);
const RELAY_PORT = 18901, WEB_PORT = 5199;
const episodes = mkdtempSync(join(tmpdir(), "thenar-e2e-"));
const shots = process.env.SHOTS;
if (shots) mkdirSync(shots, { recursive: true });

function run(cmd, args, env, ready) {
  const p = spawn(cmd, args, { cwd, env: { ...process.env, ...env } });
  return new Promise((ok, fail) => {
    const on = (d) => String(d).includes(ready) && ok(p);
    p.stdout.on("data", on);
    p.stderr.on("data", on);
    p.on("exit", (c) => fail(new Error(`${cmd} exited ${c}`)));
  });
}
const relay = await run(process.execPath, ["server/relay.mjs", "--port", String(RELAY_PORT), "--episodes", episodes], {}, "THENAR relay on");
const web = await run("npx", ["vite", "--port", String(WEB_PORT), "--strictPort"], { HTTP: "1", RELAY_PORT: String(RELAY_PORT) }, "ready in");
const BASE = `http://localhost:${WEB_PORT}`;

const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const step = (s) => console.log(`· ${s}`);
const errors = [];
async function open(path) {
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !m.text().includes("WebSocket") && errors.push(`${path}: ${m.text()}`));
  await page.goto(BASE + path);
  await page.waitForFunction(() => window.thenar?.follower, null, { timeout: 60000 });
  return page;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const op = await open("/");
  const sp = await open("/?spectate=1");
  await op.waitForFunction(() => document.querySelector("#relay-state").textContent.includes("online"));
  step("operator and spectator are both on the relay");

  await op.evaluate(() => (thenar.toggleRecord(), thenar.toggleDemo()));
  let mirrored = 0;
  for (let i = 0; i < 16; i++) {
    await wait(500);
    if ((await sp.evaluate(() => thenar.source)) === "remote") mirrored++;
    if (i === 5 && shots) await Promise.all([op.screenshot({ path: join(shots, "e2e-operator.png") }), sp.screenshot({ path: join(shots, "e2e-spectator.png") })]);
  }
  await op.waitForFunction(() => thenar.source !== "demo", null, { timeout: 20000 });
  await op.evaluate(() => thenar.toggleRecord());
  const placed = await op.evaluate(() => thenar.task.placed);
  assert.equal(placed, 1, "the scripted demo puts the cube on the pad");
  // Once the arm is still, the spectator must hold exactly the operator's pose.
  // (Mid-motion both run at software-GL frame rates here, so compare at rest.)
  await wait(600);
  const [a, b] = await Promise.all([op.evaluate(() => thenar.q.slice()), sp.evaluate(() => thenar.q.slice())]);
  const rest = Math.max(...a.map((v, j) => Math.abs(v - b[j])));
  assert.ok(mirrored >= 12, `spectator mirrored in only ${mirrored}/16 samples`);
  assert.ok(rest < 0.01, `spectator settled ${rest}° away from the operator`);
  step(`demo placed the cube; spectator mirrored it live (${mirrored}/16 samples) and settled on the same pose`);
  await wait(500);
  const files = readdirSync(episodes);
  assert.equal(files.length, 1, "the relay saved the episode");
  const ep = JSON.parse(readFileSync(join(episodes, files[0])));
  assert.equal(ep.format, "thenar-quest-episode/1");
  // One sample per rendered frame, capped at 30 Hz. Software GL here renders a
  // handful of frames a second, so only the cap and the spacing are checked.
  const gaps = ep.frames.slice(1).map((f, i) => f.t - ep.frames[i].t);
  assert.ok(ep.frame_count >= 20 && ep.frame_count / ep.duration_s <= 31, `${ep.frame_count} frames in ${ep.duration_s}s`);
  assert.ok(Math.min(...gaps) > 1 / 30 - 0.02, "never more than 30 samples a second");
  assert.equal(ep.task.success, true);
  step(`relay saved ${files[0]}: ${ep.frame_count} frames, ${ep.duration_s}s, success=${ep.task.success}`);
  const spPlaced = await sp.evaluate(() => thenar.task.placed);
  assert.equal(spPlaced, 1, "the spectator saw the cube land");
  await sp.close();
  await op.close();

  // ---- the headset path, emulated -------------------------------------------------
  const xr = await open("/?emulate=bare");
  await xr.click("#enter-vr");
  await xr.waitForFunction(() => document.querySelector("#xr-state").textContent.includes("VR"));
  step("entered VR under the emulator");
  const teleop = await xr.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const r = xrDevice.controllers.right, l = xrDevice.controllers.left;
    // Held long enough to span a frame even at software-GL frame rates.
    const press = async (c, id) => (c.updateButtonValue(id, 1), await wait(450), c.updateButtonValue(id, 0), await wait(450));
    const tcp = () => thenar.follower.tcp.getWorldPosition(thenar.target.position.clone());
    const p0 = { x: r.position.x, y: r.position.y, z: r.position.z };
    await press(r, "b-button");
    const recording = thenar.recorder.recording;
    const t0 = tcp();
    r.updateButtonValue("squeeze", 1);
    await wait(150);
    for (let i = 1; i <= 30; i++) (r.position.set(p0.x - 0.003 * i, p0.y + 0.002 * i, p0.z - 0.003 * i), await wait(30));
    await wait(300);
    const t1 = tcp();
    r.updateButtonValue("trigger", 1);
    await wait(200);
    const gripShut = thenar.q[5];
    r.updateButtonValue("trigger", 0);
    r.updateButtonValue("squeeze", 0);
    await wait(150);
    await press(r, "b-button");
    const episodes = thenar.episodes.length;
    await press(l, "x-button");
    await wait(200);
    const replaying = thenar.source;
    return { recording, episodes, replaying, gripShut, moved: [t1.x - t0.x, t1.y - t0.y, t1.z - t0.z].map((v) => v * 1000) };
  });
  const expected = [-90, 60, -90];
  const off = Math.max(...teleop.moved.map((v, i) => Math.abs(v - expected[i])));
  assert.ok(off < 5, `gripper moved ${teleop.moved.map((v) => v.toFixed(1))} for a controller move of ${expected}`);
  assert.equal(teleop.gripShut, 0);
  assert.equal(teleop.recording, true);
  assert.equal(teleop.episodes, 1);
  assert.equal(teleop.replaying, "replay");
  step(`controller moved (${expected}) mm, gripper followed within ${off.toFixed(1)} mm; trigger shut the jaws; B recorded, X replayed`);
  if (shots) {
    await xrDevice(xr);
    await xr.screenshot({ path: join(shots, "e2e-vr.png") });
  }
  assert.deepEqual(errors, [], errors.join("\n"));
  console.log("e2e: all good");
} finally {
  await browser.close();
  relay.kill();
  web.kill();
}

async function xrDevice(page) {
  await page.evaluate(async () => {
    const a = (-35 * Math.PI) / 180;
    xrDevice.quaternion.set(Math.sin(a / 2), 0, 0, Math.cos(a / 2));
    await new Promise((r) => setTimeout(r, 1500));
  });
}
