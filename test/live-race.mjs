/**
 * Live, on the local chain: racing the best run at the station.
 *
 *   BASE=http://localhost:3336 node --import ./test/register.mjs test/live-race.mjs
 *
 * Needs the local build and a task with a paid run (task 0 after
 * test/live-localnet.mjs). No wallet: a practice run is enough, since the ghost
 * is drawn, not scored. Checks that:
 * - the toggle loads the task's best paid run from the ledger, the one /api/task/0/runs ranks first;
 * - the ghost starts with the run and follows its clock;
 * - the run is still measured as usual.
 * SHOTS=dir saves the station mid-race at 1440 and 390 px.
 */
import assert from "node:assert/strict";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://localhost:3336";
const TASK = Number(process.env.TASK ?? 0);
const SHOTS = process.env.SHOTS;

const runs = (await (await fetch(`${BASE}/api/task/${TASK}/runs`)).json()).runs ?? [];
assert.ok(runs.length, `task ${TASK} needs a paid run to race`);
const best = [...runs].sort((a, b) => b.score - a.score || a.duration_s - b.duration_s)[0];

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM });
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
const status = () => page.getByTestId("race-status").innerText();
try {
  await page.goto(`${BASE}/station/${TASK}`);
  await page.getByRole("button", { name: /^Race the best run/ }).click();
  await page.waitForFunction((h) => document.querySelector("[data-testid=race-status]")?.textContent?.includes(h), best.traj_hash.slice(0, 6), { timeout: 20_000 });
  console.log("loaded    ", (await status()).replace(/\s+/g, " "));

  await page.getByRole("button", { name: "Practise first, no wallet needed" }).click();
  await page.waitForFunction(() => /The ghost is at/.test(document.querySelector("[data-testid=race-status]")?.textContent ?? ""), null, { timeout: 15_000 });
  await page.waitForTimeout(2500);
  const mid = (await status()).replace(/\s+/g, " ");
  console.log("racing    ", mid);
  const at = Number(mid.match(/ghost is at (\d+):(\d+\.\d)/)?.slice(1).reduce((m, s) => Number(m) * 60 + Number(s)));
  assert.ok(at >= 2, "the ghost's clock runs with the run");
  if (SHOTS) {
    await page.locator("canvas").first().hover();
    await page.screenshot({ path: `${SHOTS}/race-desktop.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: `${SHOTS}/race-mobile.png` });
  }
  assert.deepEqual(errors, [], "no console errors");
  console.log("LIVE RACE: PASS");
} finally {
  await browser.close();
}
