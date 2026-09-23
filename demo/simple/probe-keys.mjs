/** Does holding the station's keys move the arm in a headless take? Prints telemetry. */
import { chromium } from "playwright";
const BASE = process.env.BASE ?? "http://localhost:3333";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await chromium.launch({ channel: "chrome", headless: true, args: ["--window-size=1920,1080", "--disable-renderer-backgrounding", "--disable-background-timer-throttling", "--disable-backgrounding-occluded-windows"] });
const c = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const p = await c.newPage();
p.on("dialog", (d) => d.accept().catch(() => {}));
await p.goto(`${BASE}/station/${process.argv[2] ?? 2}`, { waitUntil: "domcontentloaded" });
const tel = async () => { const t = await p.evaluate(() => document.body.innerText); return ((t.match(/X\s+([-\d.]+)\s+Y\s+([-\d.]+)\s+Z\s+([-\d.]+)\s+JAW\s+(\d+)/) || []).slice(1).join(",")) + (/PAYLOAD HELD/.test(t) ? " HELD" : ""); };
const start = p.getByText(/Practise first/i).first();
await start.waitFor({ timeout: 60000 });
await start.click();
await sleep(1500);
console.log("buttons:", await p.locator("button:visible").allInnerTexts().then((a) => a.filter((x) => /run|practi/i.test(x)).slice(0, 6)));
console.log("t0", await tel());
await p.mouse.click(960, 500);
for (const [k, ms] of [["KeyD", 900], ["KeyW", 700], ["KeyQ", 900], ["Space", 60], ["KeyE", 700], ["KeyA", 1200], ["KeyQ", 600], ["Space", 60]]) {
  await p.keyboard.down(k); await sleep(ms); await p.keyboard.up(k); await sleep(250);
  console.log(k, await tel());
}
await c.close(); await b.close();
