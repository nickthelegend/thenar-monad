// Live, against the running dev server and station, on Monad testnet:
// the arm page's record → submit → teach → repeat flow (TESTPLAN C4–C7),
// driven with real clicks and keys in a headed Chromium with a real GPU.
//
//   BASE=http://localhost:5174 TASK=0x… PAYOUT=0x… SHOTS=dir node test/live-arm.mjs
//
// This spends testnet MON: an anchor and a bounty for C4, an anchor each for C4b, A10 and C6.
import { chromium } from "playwright";
import { join } from "node:path";
import assert from "node:assert/strict";

const BASE = process.env.BASE ?? "http://localhost:5174";
const TASK = process.env.TASK;
const PAYOUT = process.env.PAYOUT;
const SHOTS = process.env.SHOTS;
if (!TASK || !PAYOUT) throw new Error("TASK and PAYOUT are required");

const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,950"] });
const page = await browser.newPage({ viewport: { width: 1480, height: 860 } });
const errors = [], failed = [], api = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => r.url().includes("/api/") && api.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`));
const results = {};
const shot = (n) => SHOTS && page.screenshot({ path: join(SHOTS, `live-${n}.png`) });
const log = (k, v) => ((results[k] = v), console.log(k, JSON.stringify(v)));

try {
  await page.goto(`${BASE}/?task=${TASK}`);
  await page.waitForFunction((t) => window.thenar?.station?.current?.specHash === t, TASK, { timeout: 60000 });
  const fps = await page.evaluate(() => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = () => (++n, performance.now() - t0 < 1000 ? requestAnimationFrame(f) : r(n)); requestAnimationFrame(f); }));
  log("fps", fps);

  // C3 in this browser too: type the payout address like a person.
  await page.fill("#payout", "");
  await page.type("#payout", PAYOUT.toLowerCase());
  await page.press("#payout", "Tab");
  assert.equal(await page.inputValue("#payout"), PAYOUT);

  // C4: a person does the task with the keyboard (real key events), then submits it.
  const where = () => page.evaluate(() => {
    const t = thenar, m = t.target.matrixWorld.clone();
    t.follower.root.updateMatrixWorld(true);
    const local = t.follower.root.matrixWorld.clone().invert().multiply(m);
    const e = local.elements;
    // Translation is already in the arm frame's millimetres; only the basis carries the scale.
    return { x: e[12], y: e[13], z: e[14], cube: t.task.cube.position.toArray(), goal: t.task.goal.toArray(), held: !!t.task.held, grip: t.q[5] };
  });
  async function goTo(x, y, z) {
    for (let i = 0; i < 300; i++) {
      const p = await where();
      const d = { x: x - p.x, y: y - p.y, z: z - p.z };
      const [axis, v] = Object.entries(d).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      if (Math.abs(v) < 4) return p;
      const key = axis === "x" ? (v > 0 ? "ArrowUp" : "ArrowDown") : axis === "y" ? (v > 0 ? "ArrowLeft" : "ArrowRight") : v > 0 ? "PageUp" : "PageDown";
      await page.keyboard.press(Math.abs(v) > 30 ? `Shift+${key}` : key);
      await page.waitForTimeout(40);
    }
    throw new Error(`could not reach ${x},${y},${z}`);
  }
  const grip = async (key, n) => { for (let i = 0; i < n; i++) (await page.keyboard.press(key), await page.waitForTimeout(40)); };
  await page.click("#home");
  await page.mouse.click(1300, 120); // focus the scene, not a form field
  await page.click("#rec");
  const s0 = await where();
  const [cx, cy] = s0.cube, [gx, gy] = s0.goal;
  await grip("]", 5); // open
  await goTo(cx, cy, 90);
  await goTo(cx, cy, 24);
  await grip("[", 7); // close on it
  await page.waitForTimeout(300);
  assert.equal((await where()).held, true, "the keyboard grasp took hold");
  await goTo(cx, cy, 110);
  await goTo(gx, gy, 110);
  await goTo(gx, gy, 40);
  await grip("]", 7); // let go
  await page.waitForTimeout(900);
  await shot("c4-keyboard");
  await page.click("#rec");
  const ep = await page.evaluate(() => { const e = thenar.episodes.at(-1); return { input: e.input, frames: e.frame_count, hz: e.frame_count / e.duration_s, held: e.frames.filter((f) => f["observation.held"]).length, success: e.task.success }; });
  log("c4-episode", ep);
  assert.equal(ep.input, "desktop");
  assert.equal(ep.success, true, "the person put the object on its target");
  assert.ok(ep.hz > 25 && ep.hz <= 31, `sampled at ${ep.hz} Hz`);
  await page.click("#submit");
  await page.waitForSelector(".result", { timeout: 90000 });
  await page.waitForFunction(() => /✓|✗|Not verified/.test(document.querySelector("#verified")?.textContent ?? ""), null, { timeout: 60000 });
  const c4 = await page.evaluate(() => ({ text: document.querySelector("#result").innerText, links: [...document.querySelectorAll("#result a")].map((a) => a.href) }));
  log("c4-result", c4);
  await shot("c4-result");
  assert.match(c4.text, /^Accepted/);
  assert.match(c4.text, /✓ LeafVerifier on Monad confirms leaf \d+ is in anchor #\d+/);
  assert.match(c4.text, /Paid 0\.001 MON/);

  // C4b: the scripted demo is logged and scored like anything else, but earns nothing.
  await page.click("#home");
  await page.click("#rec");
  await page.click("#demo");
  await page.waitForFunction(() => window.thenar.source === "demo");
  await page.waitForFunction(() => window.thenar.source !== "demo", null, { timeout: 30000 });
  await page.click("#rec");
  assert.equal(await page.evaluate(() => thenar.episodes.at(-1).input), "scripted-demo");
  await page.click("#submit");
  await page.waitForFunction(() => /No bounty: this take was driven by the scripted demo/.test(document.querySelector("#result")?.innerText ?? ""), null, { timeout: 90000 });
  log("c4b-result", await page.innerText("#result"));

  // A10: a person's take that drops the object off the target is logged, scored zero, and not paid.
  await page.click("#home");
  await page.mouse.click(1300, 120);
  await page.click("#rec");
  {
    const s1 = await where();
    const [cx1, cy1] = s1.cube;
    await grip("]", 5);
    await goTo(cx1, cy1, 90);
    await goTo(cx1, cy1, 24);
    await grip("[", 7);
    await page.waitForTimeout(300);
    await goTo(cx1, cy1, 110);
    await goTo(cx1 + 90, cy1, 110); // away from the target, not onto it
    await grip("]", 7);
    await page.waitForTimeout(900);
  }
  await page.click("#rec");
  await page.click("#submit");
  await page.waitForFunction(() => /^Not accepted/.test(document.querySelector("#station-line").textContent), null, { timeout: 90000 });
  const a10 = await page.innerText("#result");
  log("a10-result", a10);
  assert.match(a10, /came to rest \d+ mm from the .+; the task allows 45 mm/);
  assert.doesNotMatch(a10, /Paid/);

  // C5: teach from it, then let the arm do it alone.
  await page.click("#teach");
  await page.waitForFunction(() => /Taught from episode/.test(document.querySelector("#skill-state").textContent), null, { timeout: 30000 });
  log("c5-skill", await page.textContent("#skill-state"));
  await page.click("#repeat");
  await page.waitForFunction(() => window.thenar.repeating);
  await page.waitForTimeout(3500);
  await shot("c5-repeat");
  await page.waitForFunction(() => !window.thenar.repeating, null, { timeout: 30000 });
  const c5 = await page.textContent("#station-line");
  log("c5-line", c5);
  assert.match(c5, /The taught skill put the .+ ✓/);

  // C6: a repeat recorded as data is accepted but earns no bounty.
  await page.click("#home");
  await page.click("#rec");
  await page.click("#repeat");
  await page.waitForFunction(() => window.thenar.repeating);
  await page.waitForFunction(() => !window.thenar.repeating, null, { timeout: 30000 });
  await page.click("#rec");
  const input = await page.evaluate(() => thenar.episodes.at(-1).input);
  log("c6-input", input);
  assert.equal(input, "taught-repeat");
  await page.click("#submit");
  await page.waitForFunction(() => /driven by the taught skill/.test(document.querySelector("#result")?.innerText ?? ""), null, { timeout: 90000 });
  await page.waitForFunction(() => /✓|✗|Not verified/.test(document.querySelector("#verified")?.textContent ?? ""), null, { timeout: 60000 });
  const c6 = await page.innerText("#result");
  log("c6-result", c6);
  assert.match(c6, /^Accepted/);
  assert.match(c6, /No bounty: this take was driven by the taught skill/);
  assert.match(c6, /✓ LeafVerifier/);

  // C7: home, replay, download.
  await page.click("#home");
  const home = await page.evaluate(() => thenar.q.slice(0, 5));
  assert.deepEqual(home, [0, -25, 35, 0, 0]);
  await page.click("#replay");
  await page.waitForFunction(() => window.thenar.source === "replay");
  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("#download")]);
  log("c7-download", dl.suggestedFilename());

  log("api", api);
  log("console-errors", errors);
  log("failed-requests", failed);
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log("LIVE C4–C7: PASS");
} finally {
  await browser.close();
}
