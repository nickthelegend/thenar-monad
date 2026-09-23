/**
 * Live: the station's headset path, end to end, in a headed Chromium with
 * Meta's WebXR emulator (IWER) standing in for a Quest.
 *
 *   IWER=path/to/iwer.bundle.js BASE=http://localhost:3334 TASK=0 node test/live-station-xr.mjs
 *
 * IWER.bundle is `import { XRDevice, metaQuest3 } from "iwer"; new XRDevice(metaQuest3)
 * .installRuntime({ forceInstall: true })`, bundled as an IIFE that sets window.xrDevice.
 *
 * It enters VR, presses A to begin a run, squeezes to take hold of the arm and
 * carries the payload to the goal by moving the controller, closes and opens
 * the jaws with the trigger, and expects the page to measure a placed run.
 * No wallet is connected, so nothing is submitted and no transaction is sent.
 */
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:3334";
const TASK = process.env.TASK ?? "0";
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,950"], executablePath: process.env.CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1480, height: 860 } });
await page.addInitScript({ content: readFileSync(process.env.IWER, "utf8") });
const errors = [], failed = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
const log = (k, v) => console.log(k, JSON.stringify(v));

try {
  await page.goto(`${BASE}/station/${TASK}`);
  const vr = page.getByRole("button", { name: "Enter in VR" });
  await vr.waitFor({ timeout: 90000 });
  log("buttons", await page.locator("button", { hasText: /Enter (in VR|on your table)/ }).allTextContents());
  await vr.click();
  await page.getByRole("button", { name: "In the headset" }).waitFor({ timeout: 20000 });

  const result = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const d = window.xrDevice, r = d.controllers.right;
    const press = async (id) => (r.updateButtonValue(id, 1), await wait(300), r.updateButtonValue(id, 0), await wait(300));
    // The tool's position as the page's own readout shows it (arm frame, metres).
    const tool = () => {
      const t = document.body.innerText.match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/);
      return t ? [+t[1], +t[2], +t[3]] : null;
    };
    await wait(800);
    await press("a-button"); // begin the run
    await wait(600);
    const running = /end run/i.test(document.body.innerText);
    r.updateButtonValue("squeeze", 1);
    await wait(300);
    // Learn how a controller move maps onto the tool, then steer by it: the
    // bench was placed facing the operator, so the two frames are rotated.
    const at = () => ({ x: r.position.x, y: r.position.y, z: r.position.z });
    const nudge = async (v) => {
      const p = at();
      for (let i = 1; i <= 12; i++) (r.position.set(p.x + (v[0] * i) / 12, p.y + (v[1] * i) / 12, p.z + (v[2] * i) / 12), await wait(30));
      await wait(250);
    };
    const probe = async (axis) => {
      const before = tool(), v = [0, 0, 0];
      v[axis] = 0.04;
      await nudge(v);
      const after = tool();
      v[axis] = -0.04;
      await nudge(v);
      return after.map((a, i) => (a - before[i]) / 0.04);
    };
    const M = [await probe(0), await probe(1), await probe(2)]; // columns: tool delta per controller axis
    const follow = M.map((c) => Math.hypot(...c)); // should all be ~1: millimetre for millimetre
    // Solve M * c = e for the controller move c that gives tool error e.
    const inv = (m) => {
      const [a, b, c] = m; // columns
      const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]);
      return [cross(b, c), cross(c, a), cross(a, b)].map((row) => row.map((x) => x / det));
    };
    const Mi = inv(M);
    const goTo = async (goal) => {
      for (let k = 0; k < 4; k++) {
        const now = tool(), e = goal.map((g, i) => g - now[i]);
        if (Math.hypot(...e) < 0.004) break;
        await nudge(Mi.map((row) => row[0] * e[0] + row[1] * e[1] + row[2] * e[2]));
      }
      return tool();
    };
    await goTo([0.22, 0.14, 0.12]);
    await goTo([0.22, 0.14, 0.05]);
    r.updateButtonValue("trigger", 1);
    await wait(500);
    const held = /HELD|holding/i.test(document.body.innerText);
    await goTo([0.22, 0.14, 0.16]);
    await goTo([0.16, -0.18, 0.16]);
    await goTo([0.16, -0.18, 0.08]);
    r.updateButtonValue("trigger", 0);
    await wait(400);
    r.updateButtonValue("squeeze", 0);
    await goTo([0.16, -0.18, 0.18]);
    // The page measures the run once the payload has been down 0.7 s.
    for (let i = 0; i < 30 && !/Measured|Not placed|score/i.test(document.body.innerText.slice(0, 20000)); i++) await wait(300);
    return { running, follow: follow.map((v) => +v.toFixed(3)), held, text: document.body.innerText.match(/(Deviation|deviation)[^\n]*\n?[^\n]*/g)?.slice(0, 3) ?? [], hud: window.__hud ?? null };
  });
  log("run", result);
  const verdict = await page.evaluate(() => document.body.innerText);
  const measured = /Placed|Measured|within tolerance|mm from the/i.test(verdict);
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/station-xr.png` });
  log("verdict-snippet", verdict.split("\n").filter((l) => /score|mm|placed|Placed|practice|wallet/i.test(l)).slice(0, 12));
  assert.equal(result.running, true, "A began a run");
  assert.ok(result.follow.every((f) => Math.abs(f - 1) < 0.05), `the tool followed the controller 1:1 (${result.follow})`);
  assert.equal(result.held, true, "the trigger closed the jaws on the payload");
  assert.ok(measured, "the run was measured");
  // The recording the station kept is one the verifier will sign: the arm in
  // it moved the payload (lib/coherence.ts physicalityOf, run before signing).
  const draft = await page.evaluate(() => sessionStorage.getItem("thenar:run-draft:v1"));
  if (draft && process.env.PHYSICALITY_OUT) (await import("node:fs")).writeFileSync(process.env.PHYSICALITY_OUT, draft);
  log("draft-samples", draft ? JSON.parse(draft).samples?.length ?? null : null);
  log("console-errors", errors);
  log("failed-requests", failed);
  assert.deepEqual(errors, []);
  console.log("LIVE STATION XR: PASS");
} finally {
  await browser.close();
}
