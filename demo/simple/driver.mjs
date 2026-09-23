/**
 * The short demo: one take, ten beats, about a minute and a half.
 *
 * Copied from demo/v2/driver.mjs, which records the full walkthrough, and cut
 * down to the parts a first-time viewer needs. Captions are drawn in the page
 * so they are in the frames; the only transaction is the lab's bounty, signed
 * inside Privy and confirmed from its Monad receipt before the take moves on.
 *
 *   BASE=http://localhost:3333 node demo/simple/driver.mjs
 *
 * The original header follows.
 *
 * One raw take of Thenar for the Monad Metropolis demo.
 *
 * Real Playwright input events, real network calls, real testnet transactions,
 * each confirmed on Monad before the take moves on. The cursor is an SVG
 * drawn in the page and eased with requestAnimationFrame; the hardware cursor
 * is never driven. Every beat is logged as `DEMO_LINE <ms> <id>` against the
 * same clock the video starts on, and held for its measured narration.
 *
 *   DEMO_W=1440 DEMO_H=810 node demo/v2/driver.mjs
 *
 * Three transactions are made, all on Monad testnet: the lab's bounty, signed
 * inside Privy; the agent's x402 purchase, signed by AGENT_PRIVATE_KEY and
 * submitted by the facilitator; and a dividend declared by the CorpusShares
 * issuer. Each is confirmed from its Monad receipt, not from the page.
 */
import { chromium } from "playwright";
import { spawn, execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, rmSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { decodeFunctionResult, encodeFunctionData, parseAbi } from "viem";

const W = Number(process.env.DEMO_W ?? 1920);
const H = Number(process.env.DEMO_H ?? 1080);
const BASE = process.env.BASE ?? "http://localhost:3222";
const DIR = "demo/simple";
const TAKE = `${DIR}/take`;
const MONAD_RPC = "https://testnet-rpc.monad.xyz";
const EXPLORER = "https://testnet.monadscan.com";
const AGENT = "0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA";
// The lab bounty: one run at 0.004 MON, well inside the Privy policy's 0.1 MON
// ceiling per transaction.
const BOUNTY_RUNS = "1";
const BOUNTY_PER_RUN = "0.004";
const DIVIDEND_MON = "0.01";
// Scripts that import TypeScript from lib/ run through the repo's loader.
const TS = ["--import", "./test/register.mjs"];
const ERC20 = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);
const SALES_LOG = parseAbi(["function servedCount(bytes32) view returns (uint256)"]);
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

// Real Google Chrome, headless: a visible window gets occluded by whatever is
// in front of it, and Chrome stops painting an occluded window — the first
// full-HD take captured 51 frames in three minutes that way.
const CHROME_ARGS = [
  `--window-size=${W},${H}`,
  "--autoplay-policy=no-user-gesture-required",
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-background-timer-throttling",
  "--disable-features=CalculateNativeWinOcclusion,Translate",
  "--disable-notifications",
  "--hide-scrollbars",
];

rmSync(TAKE, { recursive: true, force: true });
mkdirSync(TAKE, { recursive: true });
const durations = JSON.parse(readFileSync(`${DIR}/audio/durations.json`, "utf8"));
const LOG = `${TAKE}/beats.log`;
writeFileSync(LOG, "");
const take = { base: BASE, viewport: [W, H], startedAt: new Date().toISOString(), marks: [], txs: {}, notes: {}, appErrors: [] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let T0 = Date.now();
const now = () => Date.now() - T0;
function mark(label) {
  const ms = now();
  appendFileSync(LOG, `DEMO_LINE ${ms} ${label}\n`);
  take.marks.push({ id: label, ms });
  console.log(`DEMO_LINE ${ms} ${label}`);
  return ms;
}
const started = {};
function line(id) {
  if (!(id in durations)) throw new Error(`NO_AUDIO_DURATION:${id}`);
  started[id] = Date.now();
  mark(id);
}
async function hold(id) {
  const wait = started[id] + durations[id] * 1000 + 450 - Date.now();
  if (wait > 0) await sleep(wait);
}
async function until(label, predicate, timeoutMs = 30000, every = 250) {
  const t = Date.now();
  for (;;) {
    let v = null;
    try { v = await predicate(); } catch { v = null; }
    if (v) return v;
    if (Date.now() - t > timeoutMs) throw new Error(`UNTIL_TIMEOUT:${label}`);
    await sleep(every);
  }
}
async function rpc(method, params) {
  const r = await fetch(MONAD_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  return (await r.json()).result;
}
async function call(to, abi, functionName, args) {
  const data = await rpc("eth_call", [{ to, data: encodeFunctionData({ abi, functionName, args }) }, "latest"]);
  return decodeFunctionResult({ abi, functionName, data });
}
const monOf = async (a) => Number(BigInt(await rpc("eth_getBalance", [a, "latest"]))) / 1e18;
// A transaction is confirmed when Monad has a receipt for it with status 1.
const monadReceipt = (label, hash, timeoutMs = 60000) =>
  until(label, async () => { const r = await rpc("eth_getTransactionReceipt", [hash]); return r && r.status === "0x1" ? r : null; }, timeoutMs, 500);
const api = async (path) => { const r = await fetch(`${BASE}${path}`); if (!r.ok) throw new Error(`API_${r.status}:${path}`); return r.json(); };
const same = (a, b) => typeof a === "string" && typeof b === "string" && a.toLowerCase() === b.toLowerCase();
const topicAddr = (t) => `0x${t.slice(-40)}`;
function run(cmd, args) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd: process.cwd(), env: process.env });
    let out = "";
    p.stdout.on("data", (d) => { out += d; });
    p.stderr.on("data", (d) => { out += d; });
    p.on("close", (code) => resolve({ code, out }));
  });
}

// ---- pre-flight: funds for every transaction this take will make ----------
// Addresses come from the running server — the lab wallet from /api/lab, the
// x402 terms from /api/agent/sales, the shares' issuer from /api/tokenize — so
// the take checks the same wallets the pages show.
const lab = await api("/api/lab");
{
  const labMon = Number(BigInt(lab.balanceWei)) / 1e18;
  const labCeiling = Number(BigInt(lab.limitWei)) / 1e18;
  take.notes.preflight = { lab: lab.wallet.address, labMon, labCeiling };
  console.log("preflight", take.notes.preflight);
  const bounty = Number(BOUNTY_RUNS) * Number(BOUNTY_PER_RUN);
  if (bounty > labCeiling) throw new Error("PREFLIGHT_BOUNTY_OVER_POLICY_CEILING");
  // Monad charges the gas limit, not the gas used, so the lab holds a margin.
  if (labMon < bounty + 0.02) throw new Error("PREFLIGHT_LAB_UNDERFUNDED");
}

// ---- pre-flight: the recorder records real content -------------------------
{
  const b = await chromium.launch({ channel: "chrome", headless: true, args: CHROME_ARGS });
  const c = await b.newContext({ viewport: { width: W, height: H } });
  const p = await c.newPage();
  await p.goto(`${BASE}/hub`, { waitUntil: "domcontentloaded" });
  await sleep(2500);
  const s = await c.newCDPSession(p);
  const frame = await new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("PREFLIGHT_NO_SCREENCAST_FRAME")), 15000);
    s.on("Page.screencastFrame", (f) => { clearTimeout(t); s.send("Page.screencastAck", { sessionId: f.sessionId }).catch(() => {}); resolve(f); });
    s.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: W, maxHeight: H }).catch(reject);
  });
  writeFileSync(`${TAKE}/preflight.jpg`, Buffer.from(frame.data, "base64"));
  await c.close();
  await b.close();
  const stat = execFileSync("python3", ["-c", `from PIL import Image, ImageStat; im=Image.open("${TAKE}/preflight.jpg"); s=ImageStat.Stat(im.convert("L")); print(s.mean[0], s.stddev[0], im.size[0], im.size[1])`]).toString().trim().split(" ").map(Number);
  if (stat[2] !== W || stat[3] !== H) throw new Error(`PREFLIGHT_WRONG_SIZE ${stat[2]}x${stat[3]}`);
  console.log("preflight frame mean/stddev", stat);
  if (!(stat[1] > 12)) throw new Error("PREFLIGHT_RECORDER_BLANK");
}

const INIT = `(() => {
  if (window.__demo) return;
  const root = () => document.documentElement;
  const ensure = (x, y) => {
    let d = document.getElementById("__demo_cursor");
    if (!d) {
      d = document.createElement("div");
      d.id = "__demo_cursor";
      d.innerHTML = '<svg width="30" height="30" viewBox="0 0 30 30"><path d="M5 3 L5 24 L10.6 18.6 L14.3 26.8 L18.1 25.2 L14.5 17.2 L22.3 17.2 Z" fill="#111" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>';
      Object.assign(d.style, { position: "fixed", left: "0", top: "0", zIndex: "2147483647", pointerEvents: "none", filter: "drop-shadow(0 2px 3px rgba(0,0,0,.35))", willChange: "transform" });
      root().appendChild(d);
    }
    d.style.transform = "translate(" + (x - 5) + "px," + (y - 3) + "px)";
  };
  const glide = (x0, y0, x1, y1, ms) => new Promise((res) => {
    ensure(x0, y0);
    const el = document.getElementById("__demo_cursor");
    const t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
    const step = (n) => {
      const t = Math.min(1, (n - t0) / ms), e = ease(t);
      el.style.transform = "translate(" + (x0 + (x1 - x0) * e - 5) + "px," + (y0 + (y1 - y0) * e - 3) + "px)";
      if (t < 1) requestAnimationFrame(step); else res();
    };
    requestAnimationFrame(step);
  });
  const ring = (x, y) => {
    const r = document.createElement("div");
    Object.assign(r.style, { position: "fixed", left: (x - 20) + "px", top: (y - 20) + "px", width: "40px", height: "40px", borderRadius: "50%", border: "3px solid #2B50E0", zIndex: "2147483646", pointerEvents: "none", transform: "scale(.35)", opacity: "1", transition: "transform 480ms cubic-bezier(.16,1,.3,1), opacity 480ms ease-out" });
    root().appendChild(r);
    requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = "scale(1.7)"; r.style.opacity = "0"; }));
    setTimeout(() => r.remove(), 700);
  };
  const overlay = (title, sub) => {
    let o = document.getElementById("__demo_overlay");
    if (!o) { o = document.createElement("div"); o.id = "__demo_overlay"; root().appendChild(o); }
    Object.assign(o.style, { position: "fixed", inset: "0", zIndex: "2147483645", background: "#1F3FD1", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif" });
    o.innerHTML = '<div style="font-size:52px;font-weight:650;letter-spacing:-0.02em">' + title + '</div><div style="margin-top:16px;font:500 20px/1.4 ui-monospace,Menlo,monospace;opacity:.9">' + (sub || "") + '</div>';
  };
  const clearOverlay = () => document.getElementById("__demo_overlay")?.remove();
  const scrollBy = (dy, ms) => new Promise((res) => {
    const y0 = window.scrollY, t0 = performance.now();
    const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
    const step = (n) => { const t = Math.min(1, (n - t0) / ms); window.scrollTo(0, y0 + dy * ease(t)); if (t < 1) requestAnimationFrame(step); else res(); };
    requestAnimationFrame(step);
  });
  // Frame pump: a 2px element whose opacity changes every frame, so the
  // compositor draws — and the screencast delivers — frames at a steady rate
  // even while the page itself is still.
  const pump = () => {
    let p = document.getElementById("__demo_pump");
    if (!p && document.documentElement) {
      p = document.createElement("div");
      p.id = "__demo_pump";
      Object.assign(p.style, { position: "fixed", right: "0", bottom: "0", width: "2px", height: "2px", zIndex: "2147483647", pointerEvents: "none", background: "#000", opacity: "0.01" });
      document.documentElement.appendChild(p);
    }
    if (p) p.style.opacity = p.style.opacity === "0.01" ? "0.02" : "0.01";
    requestAnimationFrame(pump);
  };
  requestAnimationFrame(pump);
  const caption = (t) => {
    let c = document.getElementById("__demo_caption");
    if (!c) { c = document.createElement("div"); c.id = "__demo_caption"; root().appendChild(c); }
    Object.assign(c.style, { position: "fixed", left: "50%", bottom: "44px", transform: "translateX(-50%)", maxWidth: "min(1180px, 86vw)", zIndex: "2147483646", pointerEvents: "none", background: "rgba(10,10,12,0.82)", color: "#fff", padding: "14px 26px", borderRadius: "12px", font: "500 28px/1.35 system-ui,-apple-system,Segoe UI,sans-serif", textAlign: "center", letterSpacing: "-0.005em" });
    c.textContent = t;
  };
  const card = (title, sub) => {
    let o = document.getElementById("__demo_overlay");
    if (!o) { o = document.createElement("div"); o.id = "__demo_overlay"; root().appendChild(o); }
    Object.assign(o.style, { position: "fixed", inset: "0", zIndex: "2147483645", background: "#0E0E10", color: "#fff", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "system-ui,-apple-system,Segoe UI,sans-serif", textAlign: "center" });
    o.innerHTML = '<div style="font-size:96px;font-weight:700;letter-spacing:-0.03em">' + title + '</div><div style="margin-top:22px;font:500 30px/1.4 system-ui,sans-serif;opacity:.8;max-width:1100px">' + (sub || "") + '</div>';
  };
  window.__demo = { ensure, glide, ring, overlay, clearOverlay, scrollBy, caption, card };
})();`;

const browser = await chromium.launch({ channel: "chrome", headless: true, args: CHROME_ARGS });
const context = await browser.newContext({ viewport: { width: W, height: H }, colorScheme: "light", locale: "en-US" });
await context.addInitScript(INIT);
const page = await context.newPage();
T0 = Date.now();

// Capture: a loop of real Chrome screenshots at full viewport resolution,
// JPEG quality 88, each stamped on the same wall clock as the marks. Chrome's
// screencast stalled here at 0.3 fps; captureScreenshot forces a fresh frame
// each time and holds ~30 fps at 1920x1080, even on the 3D station.
const FRAMES = `${TAKE}/frames`;
mkdirSync(FRAMES, { recursive: true });
const frames = [];
const pendingWrites = new Set();
let cdp = null;
let capturing = true;
async function startCast() {
  if (!cdp) cdp = await context.newCDPSession(page);
}
// A session that saw a navigation can hang on its next capture forever, so
// every capture is raced against a timeout and a session is dropped the moment
// it fails, times out, or the page navigates.
function resetCast() {
  const old = cdp;
  cdp = null;
  old?.detach().catch(() => {});
}
const withTimeout = (p, ms) => Promise.race([p, new Promise((_, reject) => setTimeout(() => reject(new Error("CAPTURE_TIMEOUT")), ms))]);
async function captureLoop() {
  while (capturing) {
    const t = Date.now();
    try {
      await startCast();
      const { data } = await withTimeout(cdp.send("Page.captureScreenshot", { format: "jpeg", quality: 88, optimizeForSpeed: true }), 1200);
      const name = `f${String(frames.length).padStart(6, "0")}.jpg`;
      frames.push({ name, ms: t - T0 });
      const w = writeFile(`${FRAMES}/${name}`, Buffer.from(data, "base64")).finally(() => pendingWrites.delete(w));
      pendingWrites.add(w);
    } catch {
      resetCast();
      await sleep(30);
    }
  }
}
await startCast();
const captureDone = captureLoop();
page.on("dialog", (d) => d.accept().catch(() => {}));
page.on("console", (m) => { if (m.type() === "error" && page.url().startsWith(BASE)) take.appErrors.push({ ms: now(), url: page.url(), text: m.text().slice(0, 200) }); });
page.on("pageerror", (e) => { if (page.url().startsWith(BASE)) take.appErrors.push({ ms: now(), url: page.url(), text: String(e).slice(0, 200) }); });

let cur = { x: W / 2, y: H / 2 };
const ensureCursor = () => page.evaluate(([x, y]) => window.__demo.ensure(x, y), [cur.x, cur.y]).catch(() => {});
async function glide(x, y, ms = 700) {
  await ensureCursor();
  await page.evaluate(([x0, y0, x1, y1, d]) => window.__demo.glide(x0, y0, x1, y1, d), [cur.x, cur.y, x, y, ms]);
  cur = { x, y };
  await page.mouse.move(x, y);
}
async function center(locator) {
  await locator.scrollIntoViewIfNeeded({ timeout: 15000 });
  await sleep(300);
  const b = await locator.boundingBox();
  if (!b) throw new Error("NO_BOUNDING_BOX");
  return [b.x + b.width / 2, b.y + b.height / 2];
}
async function clickAt(x, y) {
  await glide(x, y, 650);
  await page.evaluate(([a, b]) => window.__demo.ring(a, b), [x, y]);
  await page.mouse.down();
  await sleep(70);
  await page.mouse.up();
}
const clickEl = async (loc) => { const [x, y] = await center(loc); await clickAt(x, y); };
const hoverEl = async (loc, ms = 750) => { const [x, y] = await center(loc); await glide(x, y, ms); };
async function typeInto(loc, text) {
  await clickEl(loc);
  // fill("") and not select-all: a number input ignores Meta+A, which left
  // "01" and "00.004" on screen in the first take.
  await loc.fill("");
  for (const ch of text) {
    await page.keyboard.type(ch);
    await sleep(1000 / 24 + (Math.random() - 0.5) * 24);
  }
}
const smoothScroll = async (dy, ms = 900) => { await page.evaluate(([a, b]) => window.__demo.scrollBy(a, b), [dy, ms]); await sleep(ms + 120); };
const text = () => page.evaluate(() => document.body.innerText);
const has = (s) => async () => (await text()).toLowerCase().includes(s.toLowerCase());
// Monadscan shows a cookie notice over the page. It is hidden with a style
// rather than clicked away: "Got it" accepts terms, and that is not the take's
// to accept. These are the selectors demo/record-explorer.mjs used.
const HIDE_COOKIES = `#cookieconsent, .cookie-consent, [class*="cookie" i][class*="banner" i],
  [id*="cookie" i][id*="consent" i], [class*="CookieConsent" i] { display: none !important; }`;
const INTERSTITIAL = /security verification|verify you are human|just a moment|are not a bot/i;
async function go(url, label, ready, timeout = 45000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
  resetCast();
  const explorer = url.startsWith(EXPLORER);
  if (explorer) {
    // An explorer page behind a bot check is not the transaction. It is waited
    // out, never answered: if it does not clear by itself the take fails
    // rather than recording the check.
    await until(`${label} (past the explorer's bot check)`, async () => {
      const t = (await text()).replace(/\s+/g, " ");
      return !INTERSTITIAL.test(t) && t.length > 200;
    }, 45000, 1000).catch(() => { throw new Error(`EXPLORER_BLOCKED ${url}`); });
    await page.addStyleTag({ content: HIDE_COOKIES }).catch(() => {});
  }
  await until(label, ready, timeout);
  // A notice rendered late is caught by the second pass.
  if (explorer) await page.addStyleTag({ content: HIDE_COOKIES }).catch(() => {});
  await ensureCursor();
}
// Monadscan prints a transaction's hash in full and its status as "Success".
const explorerShowsTx = (hash) => async () => {
  const t = (await text()).toLowerCase();
  return t.includes(hash.slice(0, 14).toLowerCase()) && /success/.test(t);
};
const visibleButton = (re) => page.locator("button:visible", { hasText: re }).first();

const narration = Object.fromEntries(JSON.parse(readFileSync(`${DIR}/narration.json`, "utf8")).map((n) => [n.id, n.text]));
/** Start a line: mark it on the clock and put its words on screen. */
async function say(id) {
  line(id);
  await page.evaluate((t) => window.__demo.caption(t), narration[id]);
}

let failed = null;
try {
  // Sync flash: the cut locks this log's clock to the video's with it.
  await page.setContent('<html><body style="margin:0;background:#000;height:100vh"></body></html>');
  await sleep(800);
  await page.evaluate(() => { document.body.style.background = "#fff"; });
  mark("SYNC_FLASH_ON");
  await sleep(400);
  await page.evaluate(() => { document.body.style.background = "#000"; });
  await sleep(300);

  // 1 — what Thenar is, on a title card over the live landing page
  await go(`${BASE}/`, "landing arm video playing", () => page.evaluate(() => { const v = document.querySelector(".subject-motion"); return !!v && !v.paused && v.readyState >= 3; }), 45000);
  await page.evaluate(() => window.__demo.card("Thenar", "Robot training data, made by people · live on Monad testnet"));
  await say("intro");
  await hold("intro");
  await page.evaluate(() => window.__demo.clearOverlay());

  // 2 — the live app
  await say("landing");
  await glide(W * 0.22, H * 0.34, 900);
  await hoverEl(page.getByRole("heading", { level: 1 }).first(), 800);
  await hold("landing");

  // 3 — tasks, with rewards held in escrow on chain
  await go(`${BASE}/hub`, "hub tasks listed", async () => (await page.locator('main a[href^="/station/"]').count()) > 2);
  await say("hub");
  await hoverEl(page.getByText("Escrow at stake").first());
  await hoverEl(page.locator('main a[href^="/station/"]').first());
  await hold("hub");

  // 4 — the station: a practice run, driven with the station's own keys.
  // Not the built-in policy: it was trained on one scene and hovers on these,
  // and a demo of it failing, or of a success it did not earn, says the wrong
  // thing. No run is submitted and no verdict is shown.
  await go(`${BASE}/station/2`, "station ready", async () => (await page.getByText(/Practise first/i).count()) > 0 && (await page.locator("canvas").count()) > 0, 60000);
  await say("station");
  await clickEl(page.getByText(/Practise first/i).first());
  await until("practice run started", async () => (await visibleButton(/^End run$/).count()) > 0, 20000);
  await glide(W * 0.5, H * 0.46, 800);
  const drive = [["KeyD", 900], ["KeyW", 700], ["KeyQ", 900], ["Space", 80], ["KeyE", 800], ["KeyA", 1300], ["KeyQ", 700], ["Space", 80], ["KeyE", 600]];
  for (const [k, ms] of drive) { await page.keyboard.down(k); await sleep(ms); await page.keyboard.up(k); await sleep(260); }
  await hold("station");

  // 6 — a lab funds a task from a policy-bound Privy wallet
  await go(`${BASE}/lab`, "lab wallet loaded", has("Privy, as server wallet"), 60000);
  await say("lab");
  await hoverEl(page.getByText("eth_sendTransaction").first());
  const escrowLabel = `Escrow ${Number(BOUNTY_RUNS) * Number(BOUNTY_PER_RUN)} MON`;
  const inputs = page.locator("main input");
  await typeInto(inputs.nth(1), BOUNTY_RUNS);
  await typeInto(inputs.nth(2), BOUNTY_PER_RUN);
  const escrowButton = page.locator("button", { hasText: escrowLabel }).first();
  // The button is styled uppercase, and innerText reports it as drawn.
  await until(`button reads ${escrowLabel}`, async () => (await escrowButton.innerText()).trim().toLowerCase() === escrowLabel.toLowerCase(), 5000);
  await hold("lab");
  await clickEl(escrowButton);
  await page.evaluate(() => window.__demo.overlay("Signing…", "Privy signs under the lab's policy · Monad confirms"));
  mark("bounty:signing");
  const bountyHref = await until("bounty result with its transaction", () => page.evaluate(() => {
    const p = [...document.querySelectorAll("main *")].find((e) => e.children.length < 8 && /Signed by Privy, settled on Monad Testnet/.test(e.textContent || ""));
    return p?.querySelector('a[href*="/tx/0x"]')?.href ?? null;
  }), 120000);
  const bountyHash = bountyHref.match(/0x[0-9a-fA-F]{64}/)[0];
  const receipt = await monadReceipt("Monad receipt status 1 for the bounty", bountyHash);
  const taskNo = await page.evaluate(() => Number((document.querySelector("main").innerText.match(/Task #(\d+) holds/) || [])[1]));
  take.txs.monadBounty = { hash: bountyHash, task: taskNo, block: parseInt(receipt.blockNumber, 16), from: receipt.from, to: receipt.to, status: receipt.status, explorer: `${EXPLORER}/tx/${bountyHash}` };
  mark("bounty:confirmed");
  await page.evaluate(() => window.__demo.clearOverlay());
  // 7 — said only once the receipt says so
  await say("bounty");
  await hoverEl(page.locator("main a", { hasText: bountyHash.slice(0, 8) }).first()).catch(() => {});
  await hold("bounty");

  // 8 — the same wallet is refused anything else
  const sendBtn = page.locator("button", { hasText: /^Send 0\.01 MON$/ }).first();
  await hoverEl(sendBtn);
  await clickEl(sendBtn);
  await until("Privy refusal", has("Refused by Privy's policy engine"), 60000);
  take.notes.privyRefusal = ((await text()).match(/Refused by Privy's policy engine[^\n]*/) || [])[0] ?? null;
  await say("refuse");
  await hoverEl(page.getByText("Refused by Privy's policy engine").first()).catch(() => {});
  await hold("refuse");

  // 9 — agents buy the data per download
  await go(`${BASE}/agents`, "agents terms loaded", async () => (await page.locator("main a", { hasText: /^SalesLog 0x/ }).count()) > 0, 60000);
  await say("agents");
  await hoverEl(page.getByText("per task corpus").first()).catch(() => {});
  await hoverEl(page.locator("main a", { hasText: /^SalesLog 0x/ }).first());
  await hold("agents");

  // 10 — the people who record it own it
  await go(`${BASE}/corpus-token`, "shares loaded", has("Thenar Robot Corpus"), 90000);
  await say("shares");
  await hoverEl(page.getByText("Thenar Robot Corpus").first());
  await typeInto(page.getByLabel("Holder address"), AGENT);
  await page.keyboard.press("Enter");
  await until("AccountIsNotInControlList", has("AccountIsNotInControlList"), 60000);
  await hoverEl(page.getByText(/AccountIsNotInControlList/).first()).catch(() => {});
  await hold("shares");

  // 11 — twelve verified contracts
  await go(`${BASE}/contracts`, "contracts listed", async () => /Deployed\s*\n?\s*12/.test(await text()), 60000);
  await say("contracts");
  await smoothScroll(480, 1500);
  await hold("contracts");

  // 12 — close
  await page.evaluate(() => window.__demo.card("Thenar", "Robot data, made by people, owned by people · Monad Metropolis, Track 4"));
  await say("outro");
  await hold("outro");
  await sleep(800);
  mark("END");
} catch (e) {
  failed = String(e?.message ?? e);
  mark(`DEMO_FAIL ${failed.split("\n")[0].slice(0, 160)}`);
}

capturing = false;
await captureDone;
await Promise.all([...pendingWrites]);
writeFileSync(`${TAKE}/frames.json`, JSON.stringify(frames));
take.frames = frames.length;
await context.close();
await browser.close();
take.finishedAt = new Date().toISOString();
take.failed = failed;
writeFileSync(`${TAKE}/take.json`, JSON.stringify(take, null, 2));
console.log(failed ? `TAKE FAILED: ${failed}` : "TAKE OK");
console.log(JSON.stringify(take.txs, null, 2));
process.exit(failed ? 1 : 0);
