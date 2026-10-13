/**
 * Render video/frames.html to frames, one seek per frame.
 *
 *   node video/render.mjs <intro|outro|overlay> <data.json> <out-dir>
 *
 * intro and outro: a JPEG per frame at 30 fps. overlay: transparent PNGs, one
 * per distinct state, with a concat list giving each its duration, since the
 * overlay holds still for most of the cut.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { chromium } from "playwright";

const [mode, dataFile, out] = process.argv.slice(2);
const data = { ...JSON.parse(readFileSync(dataFile, "utf8")), mode };
const FPS = 30;
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
const dir = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64`;
const app = readdirSync(dir).find((f) => f.endsWith(".app"));
const browser = await chromium.launch({ headless: true, executablePath: `${dir}/${app}/Contents/MacOS/Google Chrome for Testing`, args: ["--allow-file-access-from-files", "--autoplay-policy=no-user-gesture-required"] });
const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 })).newPage();
await page.addInitScript((d) => { window.__DATA = d; }, data);
await page.goto(pathToFileURL(resolve("video/frames.html")).href);
await page.evaluate(() => window.ready);
const n = Math.round(data.total * FPS);
const list = [];
let last = null, file = null, held = 0;
for (let i = 0; i < n; i++) {
  await page.evaluate((t) => window.seek(t), i / FPS);
  if (mode === "overlay") {
    const key = await page.evaluate(() => document.getElementById("root").innerHTML);
    if (key === last) { held++; continue; }
    if (file) list.push(`file '${file}'\nduration ${(held / FPS).toFixed(5)}`);
    file = `${String(i).padStart(6, "0")}.png`;
    await page.screenshot({ path: `${out}/${file}`, omitBackground: true });
    last = key; held = 1;
  } else {
    await page.screenshot({ path: `${out}/${String(i).padStart(6, "0")}.jpg`, type: "jpeg", quality: 93 });
  }
  if (i % 300 === 0) console.log(`${mode} ${i}/${n}`);
}
if (mode === "overlay") {
  list.push(`file '${file}'\nduration ${(held / FPS).toFixed(5)}`, `file '${file}'`);
  writeFileSync(`${out}/list.txt`, list.join("\n") + "\n");
}
await browser.close();
console.log(`${mode}: ${n} frames to ${out}`);
