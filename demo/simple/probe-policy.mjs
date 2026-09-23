/**
 * Which task does the built-in policy actually complete? Runs its practice
 * run on each candidate in real headless Chrome and prints the verdict the
 * station measured. Used to pick the demo's station beat, not guessed.
 *
 *   BASE=http://localhost:3333 node demo/simple/probe-policy.mjs 0 2 4
 */
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3333";
const ids = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--window-size=1920,1080", "--disable-renderer-backgrounding", "--disable-background-timer-throttling"] });
for (const id of ids) {
  const c = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await c.newPage();
  p.on("dialog", (d) => d.accept().catch(() => {}));
  await p.goto(`${BASE}/station/${id}`, { waitUntil: "domcontentloaded" });
  const btn = (re) => p.locator("button:visible", { hasText: re }).first();
  try {
    await btn(/Let the policy drive/).waitFor({ timeout: 60000 });
    await btn(/Let the policy drive/).click();
    await btn(/Begin practice run/).waitFor({ timeout: 20000 });
    await btn(/Begin practice run/).click();
    // Sample the live telemetry each second for 35 s.
    const t = Date.now(); let held = false, lastDev = null, poses = new Set();
    while (Date.now() - t < 35000) {
      const txt = await p.evaluate(() => document.body.innerText);
      const pos = (txt.match(/X\s+([-\d.]+)\s+Y\s+([-\d.]+)\s+Z\s+([-\d.]+)/) || []).slice(1).join(",");
      if (pos) poses.add(pos);
      if (/PAYLOAD HELD/.test(txt)) held = true;
      const dev = (txt.match(/DEVIATION FROM[\s\S]{0,40}?([+-]?\d+\.\d)/) || [])[1];
      if (dev) lastDev = dev;
      if (!(await btn(/^End run$/).count())) break; // the station measured on its own
      await sleep(1000);
    }
    const ended = !(await btn(/^End run$/).count());
    if (!ended) { await btn(/^End run$/).click().catch(() => {}); await sleep(3000); }
    const txt = await p.evaluate(() => document.body.innerText);
    const verdict = (txt.match(/(In tolerance|Out of tolerance|Placed|Not placed)[^\n]*/i) || [""])[0];
    console.log(`task ${id}: distinct poses=${poses.size} everHeld=${held} lastDeviation=${lastDev} selfEnded=${ended} verdict="${verdict}" after ${((Date.now() - t) / 1000).toFixed(0)}s`);
  } catch (e) { console.log(`task ${id}: ERROR ${String(e.message).split("\n")[0]}`); }
  await c.close();
}
await b.close();
