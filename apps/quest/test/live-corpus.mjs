// Live F3 (and F4): buy a licence to a sealed corpus with a real click in a
// headed Chromium, then fetch the LeRobot export. One real licence purchase.
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:5174";
const { TASK, SHOTS } = process.env;
const browser = await chromium.launch({ headless: false });
const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
const errors = [], failed = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
page.on("requestfailed", (r) => failed.push(`${r.method()} ${r.url()}`));
try {
  const posts = [];
  page.on("request", (r) => r.method() === "POST" && posts.push(new URL(r.url()).pathname));
  await page.goto(`${BASE}/corpus.html?task=${TASK}`);

  // F1: verify the newest leaf from this page against Monad.
  const last = page.locator("[data-verify]").last();
  await last.waitFor({ timeout: 60000 });
  const leaf = await last.getAttribute("data-verify");
  await last.click();
  await page.waitForFunction((l) => /✓|✗|Failed/.test(document.querySelector(`[data-verify="${l}"]`).textContent), leaf, { timeout: 60000 });
  console.log("F1", leaf, await last.textContent());
  assert.match(await last.textContent(), /✓ in anchor #\d+/);

  // F2: a bad price never leaves the page; a good one seals a new corpus on chain.
  const before = await page.locator(".card").count();
  if (!(await page.isDisabled("#seal"))) {
    await page.fill("#price", "9");
    await page.click("#seal");
    assert.equal(await page.textContent("#seal-state"), "The licence price must be above 0 and at most 0.05 MON.");
    assert.equal(posts.filter((x) => x.endsWith("/corpus")).length, 0, "no request for a bad price");
    await page.fill("#price", "0.005");
    await page.click("#seal");
    await page.waitForFunction((n) => document.querySelectorAll(".card").length > n, before, { timeout: 120000 });
    console.log("F2", await page.locator(".card").first().innerText());
    assert.ok(await page.isDisabled("#seal"), "a corpus covering everything cannot be sealed twice");
  }
  const buy = page.locator("[data-license]").first();
  await buy.waitFor({ timeout: 60000 });
  await buy.scrollIntoViewIfNeeded();
  const card = page.locator(".card").first();
  const had = await card.locator(".licence").count();
  await buy.click();
  // Wait for a new licence in this corpus's own card, not an older one elsewhere.
  await page.waitForFunction((n) => document.querySelector(".card").querySelectorAll(".licence").length > n, had, { timeout: 120000 });
  const text = await card.locator(".licence").first().innerText();
  console.log("F3", JSON.stringify(text));
  if (SHOTS) await page.screenshot({ path: join(SHOTS, "f3-licence.png"), fullPage: true });
  assert.match(text, /Licence #\d+ · bought by/);
  assert.match(text, /paid 0x5beE…086b 0\.004375 MON/);

  // F4: the export link serves a gzip of the dataset.
  const href = await page.getAttribute("#export", "href");
  const res = await page.request.get(`${BASE}/corpus.html`.replace("corpus.html", href));
  console.log("F4", res.status(), res.headers()["content-type"], res.headers()["content-disposition"], (await res.body()).length);
  assert.equal(res.status(), 200);
  assert.equal(res.headers()["content-type"], "application/gzip");
  console.log(JSON.stringify({ errors, failed }));
  assert.deepEqual(errors, []);
  assert.deepEqual(failed, []);
  console.log("LIVE F3–F4: PASS");
} finally {
  await browser.close();
}
