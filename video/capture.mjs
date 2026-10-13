/**
 * The live demo take: app.thenar.io on Monad testnet, driven by Playwright in
 * a headed Chromium (GPU), with a visible cursor that glides between targets.
 *
 *   node --import ./test/register.mjs video/capture.mjs
 *
 * The page is captured with CDP's screencast (every painted frame and its
 * timestamp) into video/work/capture/, with a mark at the start of each beat,
 * so the edit can cut the take to the narration. The recorder wallet signs in
 * Node (video/wallet.mjs); the passkey is Chromium's virtual authenticator.
 */
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from "node:fs";
import { chromium } from "playwright";
import { installWallet } from "./wallet.mjs";

const SITE = "https://app.thenar.io";
const OUT = "video/work/capture";
rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/frames`, { recursive: true });
const CHROME = readdirSync(`${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64`).find((f) => f.endsWith(".app"));

const browser = await chromium.launch({
  headless: false,
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1243/chrome-mac-arm64/${CHROME}/Contents/MacOS/Google Chrome for Testing`,
  args: ["--use-angle=metal", "--ignore-gpu-blocklist", "--window-size=1440,920", "--hide-scrollbars"],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 });
const txs = [];
const address = await installWallet(ctx, process.env.RECORDER_KEY ?? ".data/recorder.key", (h) => { txs.push(h); log("tx", h); });
await ctx.addInitScript(() => {
  // The cursor: an arrow that follows the mouse, with a ring on every press.
  const put = () => {
    if (document.getElementById("__cur")) return;
    const c = document.createElement("div");
    c.id = "__cur";
    c.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24"><path d="M4 2.5l15 8.6-6.6 1.6 3.9 7.2-2.6 1.4-3.9-7.2L5 18.6z" fill="#fff" stroke="#111" stroke-width="1.3" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: "fixed", left: "0", top: "0", zIndex: 2147483647, pointerEvents: "none", transform: "translate(-200px,-200px)", filter: "drop-shadow(0 2px 6px rgba(0,0,0,.55))" });
    document.documentElement.appendChild(c);
    addEventListener("mousemove", (e) => { c.style.transform = `translate(${e.clientX - 4}px,${e.clientY - 2}px)`; }, true);
    addEventListener("mousedown", (e) => {
      const r = document.createElement("div");
      Object.assign(r.style, { position: "fixed", left: `${e.clientX - 22}px`, top: `${e.clientY - 22}px`, width: "44px", height: "44px", borderRadius: "50%", border: "3px solid #a99bff", zIndex: 2147483646, pointerEvents: "none", transition: "transform .5s cubic-bezier(.2,.8,.2,1), opacity .5s", opacity: "1", transform: "scale(.4)" });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = "scale(1.5)"; r.style.opacity = "0"; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  document.readyState === "loading" ? addEventListener("DOMContentLoaded", put) : put();
});

// Meta's WebXR emulator (IWER) stands in for a Quest 3S: same bundle and fix as test/live-station-xr.mjs.
await ctx.addInitScript({ content: readFileSync(".localnet/iwer/iwer.bundle.js", "utf8") });
await ctx.addInitScript(() => {
  const xr = navigator.xr; if (!xr) return;
  const request = xr.requestSession.bind(xr);
  xr.requestSession = async (mode, init) => {
    const s = await request(mode, init);
    window.__xrSession = s;
    const proto = Object.getPrototypeOf(await s.requestReferenceSpace("local-floor"));
    if (!proto.__offsetFixed) {
      const offset = proto.getOffsetReferenceSpace;
      proto.getOffsetReferenceSpace = function (t) { return offset.call(this, t && t.matrix ? t.matrix : t); };
      proto.__offsetFixed = true;
    }
    return s;
  };
});
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", { options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true } });

// Every painted frame, with the browser's own timestamp.
const frames = [];
cdp.on("Page.screencastFrame", async ({ data, metadata, sessionId }) => {
  const n = frames.length;
  writeFileSync(`${OUT}/frames/${String(n).padStart(6, "0")}.jpg`, Buffer.from(data, "base64"));
  frames.push(metadata.timestamp);
  cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
});
const marks = [];
const started = Date.now();
const now = () => (Date.now() - started) / 1000;
const mark = (id) => { marks.push({ id, t: Date.now() / 1000 }); log("mark", id); };
const log = (...a) => console.log(`[${now().toFixed(1).padStart(6)}]`, ...a);

let cx = 720, cy = 450;
const ease = (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
async function glideTo(x, y, ms = 700) {
  const steps = Math.max(12, Math.round(ms / 16)), x0 = cx, y0 = cy;
  for (let i = 1; i <= steps; i++) {
    const u = ease(i / steps);
    await page.mouse.move(x0 + (x - x0) * u, y0 + (y - y0) * u);
    await page.waitForTimeout(16);
  }
  cx = x; cy = y;
}
async function glide(locator, ms) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  await glideTo(b.x + b.width / 2, b.y + b.height / 2, ms);
}
async function click(locator, ms) { await glide(locator, ms); await page.waitForTimeout(180); await page.mouse.down(); await page.waitForTimeout(70); await page.mouse.up(); }
async function scrollBy(dy, ms = 1200) {
  await page.evaluate(([dy, ms]) => new Promise((r) => { const y0 = scrollY, s = performance.now(); const f = (t) => { const u = Math.min(1, (t - s) / ms); const e = u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; scrollTo(0, y0 + dy * e); u < 1 ? requestAnimationFrame(f) : r(); }; requestAnimationFrame(f); }), [dy, ms]);
}
const text = () => page.evaluate(() => document.body.innerText);
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn().catch(() => null); if (v) return v; await page.waitForTimeout(250); }
  throw new Error(`timed out waiting for ${what}`);
}


// A terminal drawn in the page: the command is typed, then its real output appears as it arrives.
const TERM_CSS = `html,body{margin:0;height:100%;background:#0b0b0d;color:#e9e7f2;font:16px/1.55 "SFMono-Regular",Menlo,monospace}
  .win{margin:28px auto;width:1360px;height:740px;border-radius:14px;background:#141418;border:1px solid #2a2a33;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.6)}
  .bar{height:38px;background:#1c1c22;display:flex;align-items:center;gap:9px;padding:0 16px;color:#8d8a9c;font-size:14px}
  .d{width:12px;height:12px;border-radius:50%;background:#3a3a44}
  pre{margin:0;padding:20px 26px;white-space:pre-wrap;word-break:break-all;height:660px;overflow:hidden}
  .p{color:#a99bff}.k{color:#8d8a9c}.ok{color:#4ee08c}.no{color:#fb7185}`;
async function terminal(title, shown, cmd, args, { cwd, env, good = /^$/, bad = /^$/, skip = /^$/ } = {}) {
  await page.setContent(`<!doctype html><html><head><style>${TERM_CSS}</style></head><body><div class="win"><div class="bar"><span class="d"></span><span class="d"></span><span class="d"></span><span style="margin-left:12px">${title}</span></div><pre id="o"></pre></div></body></html>`);
  const add = (h) => page.evaluate((h) => { const o = document.getElementById("o"); o.insertAdjacentHTML("beforeend", h); o.scrollTop = o.scrollHeight; }, h);
  const esc = (x) => x.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  await add('<span class="p">$ </span>');
  for (const ch of shown) { await add(esc(ch)); await page.waitForTimeout(14); }
  await add("\n");
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { cwd, env: { ...process.env, NODE_NO_WARNINGS: "1", ...env } });
    let all = "", queue = Promise.resolve();
    const feed = (d) => {
      const str = d.toString(); all += str;
      for (const line of str.split("\n")) {
        if (!line.trim() || /Warning|Reparsing|trace-|MODULE_TYPELESS|DEP0205|\(Use `node/.test(line) || skip.test(line)) continue;
        const cls = good.test(line) ? "ok" : bad.test(line) ? "no" : "";
        queue = queue.then(() => add(`<span class="${cls}">${esc(line.replace(/\x1b\[[0-9;]*m/g, ""))}</span>\n`)).catch(() => {});
      }
    };
    p.stdout.on("data", feed); p.stderr.on("data", feed);
    p.on("close", async () => { await queue; resolve(all); });
  });
}

await cdp.send("Page.startScreencast", { format: "jpeg", quality: 88, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 1 });
const out = {};
try {
  // 0. The lab: a bounty posted from its Privy server wallet, under a policy that only lets it fund Thenar.
  mark("lab");
  const labOut = await terminal("thenar · a robotics lab's budget · Privy server wallet · Monad testnet",
    'node scripts/privy-lab.mjs "Lab bounty: put the toothpaste into the upper drawer"',
    "node", ["--import", "./test/register.mjs", "scripts/privy-lab.mjs", "Lab bounty: put the toothpaste into the upper drawer"],
    { env: { SCENARIO: "3" }, good: /signed by Privy|escrowed|timers/, bad: /forbid|refused|policy_violation/ });
  const task = Number(labOut.match(/task #(\d+)/)?.[1]);
  out.bountyTx = labOut.match(/tx\/(0x[0-9a-f]{64})/)?.[1];
  if (!Number.isFinite(task)) throw new Error("no bounty task");
  out.task = task; log("bounty task", task, out.bountyTx);
  await page.waitForTimeout(4000);

  // 1. The front door: who it is for, and Monad's blocks, live.
  await page.goto(`${SITE}/`, { waitUntil: "load" });
  await until(async () => /Proposed/.test(await text()), 20_000, "the block strip").catch(() => {});
  await page.mouse.move(cx, cy);
  mark("home");
  await page.waitForTimeout(5000);
  await glideTo(980, 320, 1400); await page.waitForTimeout(3500);
  await scrollBy(390, 1600); await page.waitForTimeout(4500);

  // 2. One way in.
  await page.goto(`${SITE}/start`, { waitUntil: "load" });
  await page.waitForTimeout(1200);
  mark("start");
  await page.waitForTimeout(3000);
  await click(page.getByRole("link", { name: "Set up your passkey" }));

  // 3. The passkey (Mera): on chain, admitted, and the key that commands the arm.
  await page.waitForURL(/\/passkey/);
  mark("passkey");
  await page.waitForTimeout(1500);
  const setUp = page.getByRole("button", { name: /Set up your passkey|Sign in with your passkey/ });
  await setUp.waitFor({ timeout: 30_000 });
  await click(setUp);
  await until(async () => /Passkey set · you can earn/.test(await text()), 120_000, "the passkey to be set");
  await page.waitForTimeout(2000);
  const derive = page.getByRole("button", { name: /Derive my SO-101 key/ });
  await derive.waitFor({ timeout: 15_000 }).catch(() => {});
  if (await derive.count()) {
    mark("derive");
    await click(derive);
    await until(async () => /Derive it again/.test(await text()), 60_000, "the arm key").catch(() => log("no derive result"));
    await page.waitForTimeout(3500);
  } else log("no derive button");

  // 4. The lab's task at the station, driven in the headset.
  await page.goto(`${SITE}/station/${task}`, { waitUntil: "load" });
  const begin = page.getByRole("button", { name: /^Begin run$/ });
  await begin.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  mark("station");
  await page.waitForTimeout(2000);
  const enter = page.getByRole("button", { name: "Enter in VR" }).first();
  await enter.waitFor({ timeout: 30_000 });
  await click(enter);
  await page.getByRole("button", { name: "In the headset" }).waitFor({ timeout: 20_000 });
  await glideTo(1470, 830, 400); // the mouse leaves the frame: the controller drives now
  mark("drive");
  const vrOut = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const d = window.xrDevice, r = d.controllers.right;
    const press = async (id) => (r.updateButtonValue(id, 1), await wait(300), r.updateButtonValue(id, 0), await wait(300));
    const ease = (u) => (u < .5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
    const tool = () => { const t = document.body.innerText.match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/); return t ? [+t[1], +t[2], +t[3]] : null; };
    // Look down at the bench, as an operator does: pitch the head ~32 degrees over a second.
    const q0 = { x: d.quaternion.x, y: d.quaternion.y, z: d.quaternion.z, w: d.quaternion.w };
    for (let i = 1; i <= 40; i++) {
      const th = (-32 * Math.PI / 180) * ease(i / 40) / 2, px = Math.sin(th), pw = Math.cos(th);
      // q0 * pitch(about local X)
      d.quaternion.set(q0.w * px + q0.x * pw, q0.y * pw + q0.z * px, q0.z * pw - q0.y * px, q0.w * pw - q0.x * px);
      await wait(25);
    }
    await wait(900);
    await press("a-button");
    await wait(700);
    r.updateButtonValue("squeeze", 1);
    await wait(300);
    const at = () => ({ x: r.position.x, y: r.position.y, z: r.position.z });
    const nudge = async (v, steps = 24) => {
      const p = at();
      for (let i = 1; i <= steps; i++) { const u = ease(i / steps); r.position.set(p.x + v[0] * u, p.y + v[1] * u, p.z + v[2] * u); await wait(28); }
      await wait(200);
    };
    const settled = async () => { let last = tool(); for (let i = 0; i < 20; i++) { await wait(80); const now = tool(); if (now && last && now.every((v, k) => Math.abs(v - last[k]) < 0.0005)) return now; last = now; } return last; };
    const probe = async (axis) => {
      const sides = [];
      for (const sign of [1, -1]) {
        const before = await settled(), v = [0, 0, 0];
        v[axis] = 0.04 * sign; await nudge(v, 10);
        const after = await settled();
        v[axis] = -0.04 * sign; await nudge(v, 10);
        sides.push(after.map((a, i) => (a - before[i]) / (0.04 * sign)));
      }
      return sides.reduce((best, c) => (Math.abs(Math.hypot(...c) - 1) < Math.abs(Math.hypot(...best) - 1) ? c : best));
    };
    const M = [await probe(0), await probe(1), await probe(2)];
    const inv = (m) => { const [a, b, c] = m; const cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - b[0] * (a[1] * c[2] - a[2] * c[1]) + c[0] * (a[1] * b[2] - a[2] * b[1]); return [cross(b, c), cross(c, a), cross(a, b)].map((row) => row.map((x) => x / det)); };
    const Mi = inv(M);
    const goTo = async (goal) => { for (let k = 0; k < 4; k++) { const now = tool(), e = goal.map((g, i) => g - now[i]); if (Math.hypot(...e) < 0.004) break; await nudge(Mi.map((row) => row[0] * e[0] + row[1] * e[1] + row[2] * e[2])); } return tool(); };
    window.__driveStart = Date.now();
    // A route of its own: over the payload, down, grip, up high, round by the far side, into the ring.
    await goTo([0.24, 0.10, 0.13]);
    await goTo([0.22, 0.14, 0.12]);
    await goTo([0.22, 0.14, 0.05]);
    r.updateButtonValue("trigger", 1); await wait(600);
    const held = /HELD|holding/i.test(document.body.innerText);
    // The carry, round the near side at its own height (a route already on the task is refused).
    await goTo([0.22, 0.14, 0.18]);
    await goTo([0.11, 0.03, 0.18]);
    await goTo([0.10, -0.17, 0.15]);
    await goTo([0.16, -0.18, 0.12]);
    await goTo([0.16, -0.18, 0.07]);
    r.updateButtonValue("trigger", 0); await wait(500);
    r.updateButtonValue("squeeze", 0);
    await goTo([0.16, -0.18, 0.19]);
    for (let i = 0; i < 30 && !/IN TOLERANCE|OUT OF TOLERANCE/.test(document.body.innerText); i++) await wait(300);
    await wait(1500);
    return { held, follow: M.map((c) => +Math.hypot(...c).toFixed(3)) };
  });
  log("vr", vrOut);
  await page.evaluate(() => window.__xrSession?.end()).catch(() => {});
  await page.waitForTimeout(1500);
  await glideTo(980, 480, 600);
  await until(async () => /IN TOLERANCE|OUT OF TOLERANCE/.test(await text()), 20_000, "the verdict");
  const verdict = (await text()).match(/(IN|OUT OF) TOLERANCE\s*([\d.]+)/)?.[0];
  log("verdict", verdict);
  mark("verdict");
  await page.waitForTimeout(2500);
  if (!/^IN/.test(verdict ?? "")) throw new Error(`out of tolerance: ${verdict}`);

  // 5. Submit: scored, signed and paid in one transaction, timed to final; then the receipt's details.
  const submit = page.getByRole("button", { name: "Submit and get paid" });
  await submit.scrollIntoViewIfNeeded();
  await glide(page.getByText(/Gas on submit/).first(), 900).catch(() => {});
  await page.waitForTimeout(2000);
  await click(submit);
  mark("submit");
  await until(async () => {
    const alert = await page.getByRole("alert").textContent({ timeout: 200 }).catch(() => null);
    if (alert) throw new Error(`submit failed: ${alert}`);
    const refused = (await text()).match(/This run follows a route already recorded[^\n]*/)?.[0];
    if (refused) throw new Error(refused);
    return /Recorded and paid in one transaction/.test(await text());
  }, 120_000, "the submit to confirm");
  const timers = page.getByTestId("receipt-timers");
  await timers.scrollIntoViewIfNeeded();
  await until(async () => /\d/.test(await timers.locator("[data-key=final]").textContent()), 60_000, "final");
  out.timers = { executed: await timers.locator("[data-key=executed]").textContent(), final: await timers.locator("[data-key=final]").textContent() };
  out.runTx = txs[txs.length - 1];
  log("timers", out.timers, out.runTx);
  mark("paid");
  await glide(timers, 900);
  await page.waitForTimeout(1500);
  const details = timers.getByText(/Details/).first();
  if (await details.count()) { await click(details); await page.waitForTimeout(500); await timers.scrollIntoViewIfNeeded(); }
  await page.waitForTimeout(4500);
  await until(async () => /issued on|No corpus shares/.test(await text()), 60_000, "the shares line").catch(() => log("no shares line"));
  const shares = page.getByText(/issued on/).first();
  if (await shares.count()) { mark("shares"); await glide(shares, 800); await page.waitForTimeout(3500); }

  // 6. The same transaction on MonadVision (BlockVision).
  await page.goto(`https://testnet.monadvision.com/tx/${out.runTx}`, { waitUntil: "load" });
  mark("explorer");
  await page.waitForTimeout(6500);
  await scrollBy(300, 1400); await page.waitForTimeout(3000);

  // 7. The data: the lab's task, its episode, and the corpus summary.
  await page.goto(`${SITE}/corpus?task=${task}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  mark("corpus");
  await page.waitForTimeout(3500);
  await glideTo(680, 380, 1000);
  await scrollBy(450, 1800); await page.waitForTimeout(4000);
  await scrollBy(450, 1800); await page.waitForTimeout(4000);

  // 8. An agent buys the lab's corpus over x402, and the sale is on its page.
  mark("agent");
  const agentOut = await terminal("thenar · buyer agent · x402 on Monad testnet",
    `node scripts/agent-buy.mjs ${SITE} ${task}`, "node", ["--import", "./test/register.mjs", "scripts/agent-buy.mjs", SITE, String(task)],
    { good: /settled\s+true|agrees|same sha256/ });
  out.agentTx = agentOut.match(/tx (0x[0-9a-f]{64})/)?.[1];
  log("agent", out.agentTx);
  await page.waitForTimeout(4000);
  await page.goto(`${SITE}/agents`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  mark("agents");
  await page.waitForTimeout(3500);
  await glideTo(700, 420, 1000);
  await scrollBy(500, 1800); await page.waitForTimeout(4000);
  await scrollBy(500, 1800); await page.waitForTimeout(4000);

  // 9. Chainlink CRE audits the corpus against what is committed on Monad, and writes its verdict there.
  mark("cre");
  const creOut = await terminal("thenar · Chainlink CRE · corpus-audit workflow → CorpusAudit on Monad testnet",
    "cre workflow simulate corpus-audit --target staging-settings --non-interactive --trigger-index 0 --broadcast",
    `${process.env.HOME}/.cre/bin/cre`, ["workflow", "simulate", "corpus-audit", "--target", "staging-settings", "--non-interactive", "--trigger-index", "0", "--broadcast"],
    { cwd: "cre", good: /verdict|tx|Transaction|success|Matches|Grown/i, bad: /error|fail/i });
  out.creTx = creOut.match(/0x[0-9a-f]{64}/g)?.pop();
  log("cre", out.creTx);
  await page.waitForTimeout(4000);
  await page.goto(`${SITE}/corpus?task=${task}`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  mark("audit");
  const cre = page.getByText(/Chainlink CRE audit/).first();
  if (await cre.count()) await glide(cre, 900);
  await page.waitForTimeout(5000);

  // 10. Who earned, and who bought.
  await page.goto(`${SITE}/leaderboard`, { waitUntil: "load" });
  await page.waitForTimeout(1500);
  mark("leaderboard");
  await page.waitForTimeout(3000);
  await scrollBy(450, 1800); await page.waitForTimeout(3500);

  // 11. The network page: Monad against Ethereum, read live.
  await page.goto(`${SITE}/network`, { waitUntil: "load" });
  await until(async () => /Proposed/.test(await text()) && !/waiting for a block/.test(await text()), 20_000, "the strip").catch(() => {});
  await page.waitForTimeout(1000);
  mark("network");
  await page.waitForTimeout(4000);
  await glideTo(820, 390, 1200);
  await scrollBy(420, 1800); await page.waitForTimeout(5000);
  await scrollBy(420, 1800); await page.waitForTimeout(5000);
  await scrollBy(420, 1800); await page.waitForTimeout(4000);
  mark("end");
} catch (e) {
  log("FAILED", e.message);
  await page.screenshot({ path: `${OUT}/failed.png` }).catch(() => {});
  process.exitCode = 1;
} finally {
  await cdp.send("Page.stopScreencast").catch(() => {});
  await page.waitForTimeout(300);
  writeFileSync(`${OUT}/take.json`, JSON.stringify({ address, txs, marks, out, frames }, null, 1));
  log("frames", frames.length, "txs", txs.length, JSON.stringify(out));
  await browser.close();
}
