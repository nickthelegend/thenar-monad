/**
 * Live, on the local chain: an operator's whole first day, in a real browser.
 *
 *   BASE=http://127.0.0.1:3336 NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs test/live-localnet.mjs
 *
 * Needs the local chain (scripts/localnet.mjs) and the local build
 * (scripts/localnet-app.mjs). Headed Chromium, because the station is WebGL
 * and requestAnimationFrame; Chromium's virtual authenticator (resident keys,
 * user verification, PRF) stands in for Face ID.
 *
 *  1. Sign in with the local wallet; the local faucet sends it MON and USDC.
 *  2. /passkey: Mera makes a passkey, the wallet registers its P-256 key in
 *     PasskeyRegistry, the passkey signs the server's challenge, the registry
 *     checks it through the P-256 precompile, and the issuer admits the
 *     address to CorpusShares.
 *  3. "Prove it": the registry verifies a fresh assertion, as a read.
 *  4. The station: begin a run on task 0, drive the SO-101 with the keyboard
 *     to the payload, close the jaws, carry it to the goal, let go. The page
 *     measures it; "Submit and get paid" has the verifier score and sign it,
 *     and the wallet sends submitTrajectory, which pays the operator.
 *  5. The run's page replays it, and the chain has the TrajectoryAccepted
 *     event, the payment and the corpus shares.
 *
 * Every transaction is real and signed, on chain 31337. Nothing is mocked.
 */
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { createPublicClient, formatEther, http, parseAbi, parseAbiItem } from "viem";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";

// localhost, not 127.0.0.1: WebAuthn refuses an IP address as a passkey's site.
const BASE = process.env.BASE ?? "http://localhost:3336";
const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645";
const TASK = Number(process.env.TASK ?? 0);
const SHOTS = process.env.SHOTS;
const C = LOCAL_DEPLOYMENT.contracts;
const chain = createPublicClient({ transport: http(RPC) });
const log = (k, v) => console.log(k.padEnd(10), typeof v === "string" ? v : JSON.stringify(v));
const until = async (fn, ms = 30_000, what = "condition") => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timed out waiting for ${what}`);
};

const browser = await chromium.launch({ headless: false, args: ["--window-size=1500,1000"], executablePath: process.env.CHROMIUM });
const page = await browser.newPage({ viewport: { width: 1480, height: 900 } });
const errors = [], failed = [];
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
page.on("pageerror", (e) => errors.push(e.message));
// A prefetch the next navigation cancels is aborted by design, not a failure.
page.on("requestfailed", (r) => r.failure()?.errorText !== "net::ERR_ABORTED" && failed.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
page.on("response", (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.request().method()} ${r.url()}`));
const cdp = await page.context().newCDPSession(page);
await cdp.send("WebAuthn.enable");
await cdp.send("WebAuthn.addVirtualAuthenticator", {
  options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, hasPrf: true, automaticPresenceSimulation: true },
});
const text = () => page.evaluate(() => document.body.innerText);
const shot = async (name) => SHOTS && page.screenshot({ path: `${SHOTS}/${name}.png` });

try {
  // 1. The wallet.
  await page.goto(`${BASE}/localnet`);
  assert.ok(await page.getByTestId("localnet-banner").isVisible(), "a local build says it is not Monad");
  await page.getByRole("button", { name: "Sign in with the local wallet" }).click();
  const balances = await until(async () => {
    const t = await page.getByTestId("local-balances").textContent().catch(() => null);
    return t && /[1-9][\d.]* MON/.test(t) ? t : null;
  }, 30_000, "the faucet's MON");
  const address = (await page.locator("main a[href^='/explorer/address/0x']").nth(1).textContent()).trim();
  log("wallet", { address, balances });

  // 2. The passkey, registered on chain, and admission.
  await page.goto(`${BASE}/passkey`);
  await page.getByRole("button", { name: "Set up your passkey" }).click();
  await until(async () => /Passkey set · you can earn/i.test(await text()), 60_000, "admission");
  const st = await (await fetch(`${BASE}/api/operator?address=${address}`)).json();
  assert.deepEqual([st.passkey, st.operator], [true, true], "the chain has the passkey and the address may earn");
  const key = await chain.readContract({
    address: C.passkeyRegistry, abi: parseAbi(["function hasPasskey(address) view returns (bool)"]),
    functionName: "hasPasskey", args: [address],
  });
  const whitelisted = await chain.readContract({
    address: C.corpusShares, abi: parseAbi(["function isInControlList(address) view returns (bool)"]),
    functionName: "isInControlList", args: [address],
  }).catch((e) => `unreadable: ${e.shortMessage ?? e.message}`);
  log("passkey", { registered: key, operator: st.operator, whitelisted });
  await shot("localnet-passkey");

  // 3. The registry verifies a fresh assertion.
  await page.getByRole("button", { name: /Prove it on/ }).click();
  await until(async () => /Verified on|Rejected by the registry/.test(await text()), 30_000, "the proof");
  assert.match(await text(), /Verified on/, "PasskeyRegistry verified a fresh assertion through the P-256 precompile");

  // 4. A paid run at the station.
  await page.goto(`${BASE}/station/${TASK}`);
  const begin = page.getByRole("button", { name: /^Begin run$/ });
  await begin.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  await begin.click();
  await until(async () => /end run/i.test(await text()), 10_000, "the run to begin");
  await page.locator("canvas").first().hover();

  // The tool, as the page's own readout shows it (arm frame, metres).
  const tool = async () => {
    const m = (await text()).match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  await until(tool, 10_000, "the tool readout");
  const KEYS = [["w", "s"], ["a", "d"], ["e", "q"]];
  const SPEED = 0.42; // m/s, components/station/viewport.tsx
  const goTo = async (goal, tol = 0.004) => {
    for (let pass = 0; pass < 8; pass++) {
      const now = await tool();
      const e = goal.map((g, i) => g - now[i]);
      if (Math.hypot(...e) < tol) return now;
      for (let i = 0; i < 3; i++) {
        if (Math.abs(e[i]) < tol / 2) continue;
        const k = KEYS[i][e[i] > 0 ? 0 : 1];
        await page.keyboard.down(k);
        await page.waitForTimeout(Math.max(16, (Math.abs(e[i]) / SPEED) * 1000 * (pass ? 0.8 : 0.95)));
        await page.keyboard.up(k);
        await page.waitForTimeout(120);
      }
    }
    return tool();
  };
  const jaws = async () => { await page.keyboard.press(" "); await page.waitForTimeout(500); };

  const at0 = await tool();
  await goTo([0.22, 0.14, 0.12]);
  const over = await goTo([0.22, 0.14, 0.05]);
  await jaws();
  const held = /HELD|holding/i.test(await text());
  await goTo([0.22, 0.14, 0.16]);
  await goTo([0.16, -0.18, 0.16]);
  await goTo([0.16, -0.18, 0.07]);
  await jaws();
  await goTo([0.16, -0.18, 0.18], 0.01);
  log("drive", { start: at0, over, held });
  await until(async () => /IN TOLERANCE|OUT OF TOLERANCE/.test(await text()), 20_000, "the verdict");
  const verdict = (await text()).match(/(IN|OUT OF) TOLERANCE\s*([\d.]+)/);
  log("verdict", verdict?.[0]);
  await shot("localnet-verdict");
  assert.equal(verdict?.[1], "IN", "the run was placed within tolerance");

  const before = await chain.getBalance({ address });
  const head = await chain.getBlockNumber();
  await page.getByRole("button", { name: "Submit and get paid" }).click();
  // The panel's own confirmed state, or its alert: not a word match on the
  // station's copy, which says "paid" before anything is.
  await until(async () => {
    const alert = await page.getByRole("alert").textContent().catch(() => null);
    if (alert) throw new Error(`the submit failed: ${alert}`);
    return /Recorded and paid in one transaction/.test(await text());
  }, 90_000, "the submit to confirm");
  const shares = await until(async () => {
    const m = (await text()).match(/(.*issued on [^\n]*|No corpus shares for this run: [^\n]*)/);
    return m?.[1];
  }, 60_000, "the corpus shares line");
  log("shares", shares);
  assert.match(shares, /issued on/, "the run's corpus shares were issued");
  await shot("localnet-paid");

  // 5. What the chain says.
  const accepted = await chain.getLogs({
    address: C.axon, fromBlock: head, toBlock: "latest",
    event: parseAbiItem("event TrajectoryAccepted(uint256 indexed trajectoryId, uint256 indexed taskId, address indexed contributor, bytes32 trajHash, string cid, uint16 score, uint256 paid)"),
    args: { contributor: address },
  }).catch(async () => []);
  const after = await chain.getBalance({ address });
  log("chain", {
    accepted: accepted.map((l) => ({ id: String(l.args.trajectoryId), task: String(l.args.taskId), score: l.args.score, paid: formatEther(l.args.paid), tx: l.transactionHash })),
    balanceDelta: formatEther(after - before),
  });
  assert.equal(accepted.length, 1, "one TrajectoryAccepted for this operator");
  assert.ok(accepted[0].args.paid > 0n, "the run was paid");

  const hash = accepted[0].args.trajHash;
  await page.goto(`${BASE}/run/${hash}`);
  await until(async () => (await text()).length > 400, 30_000, "the run page");
  const runPage = await text();
  log("run page", runPage.split("\n").filter((l) => /score|paid|MON|block|frames|samples/i.test(l)).slice(0, 8));
  await page.goto(`${BASE}/explorer/tx/${accepted[0].transactionHash}`);
  assert.match(await text(), /Success/);
  assert.match(await text(), /TrajectoryAccepted/);

  log("errors", errors);
  log("failed", failed);
  assert.deepEqual(errors, [], "no console errors");
  assert.deepEqual(failed, [], "no failed requests");
  console.log("LIVE LOCALNET: PASS");
} catch (e) {
  const t = await text().catch(() => "");
  console.log("--- page at failure:", page.url());
  console.log(t.split("\n").filter(Boolean).slice(0, 60).join("\n"));
  log("errors", errors);
  log("failed", failed);
  await shot("localnet-failure");
  throw e;
} finally {
  await browser.close();
}
