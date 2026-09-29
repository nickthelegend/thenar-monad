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
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";
import { So101Chain, solveSo101, SO101 } from "../lib/so101.ts";

// localhost, not 127.0.0.1: WebAuthn refuses an IP address as a passkey's site.
const BASE = process.env.BASE ?? "http://localhost:3336";
const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645";
const TASK = Number(process.env.TASK ?? 0);
const SHOTS = process.env.SHOTS;
/** "keyboard" drives the arm from the keys; "leader" from a physical-leader stand-in through the relay. */
const DRIVE = process.env.DRIVE ?? "keyboard";
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
  let leaderPoses = null, fakeLeader = null, relay = null;
  if (DRIVE === "leader") ({ leaderPoses, fakeLeader, relay } = await startLeader());
  await page.goto(`${BASE}/station/${TASK}`);
  const begin = page.getByRole("button", { name: /^Begin run$/ });
  await begin.waitFor({ timeout: 90_000 });
  await page.waitForTimeout(1500);
  if (DRIVE === "leader") {
    await page.getByRole("button", { name: "My leader is on the arm relay" }).click();
    await until(async () => /Your leader is driving the arm/.test(await text()), 15_000, "the leader to drive the arm");
  }
  await begin.click();
  await until(async () => /end run/i.test(await text()), 10_000, "the run to begin");
  await page.locator("canvas").first().hover();

  // The tool, as the page's own readout shows it (arm frame, metres).
  const tool = async () => {
    const m = (await text()).match(/X\s+(-?\d+\.\d+)\s+Y\s+(-?\d+\.\d+)\s+Z\s+(-?\d+\.\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  };
  await until(tool, 10_000, "the tool readout");
  const at0 = await tool();
  let over, held = false;
  if (DRIVE === "leader") {
    // The hand on the leader does the task; the page only watches.
    fakeLeader.stdin.write("GO\n");
    const end = Date.now() + (leaderPoses.length / 50) * 1000 + 1500;
    while (Date.now() < end) {
      if (/HELD|holding/i.test(await text())) held = true;
      await page.waitForTimeout(100);
    }
    over = await tool();
  } else {
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
    await goTo([0.22, 0.14, 0.12]);
    over = await goTo([0.22, 0.14, 0.05]);
    await jaws();
    held = /HELD|holding/i.test(await text());
    await goTo([0.22, 0.14, 0.16]);
    await goTo([0.16, -0.18, 0.16]);
    await goTo([0.16, -0.18, 0.07]);
    await jaws();
    await goTo([0.16, -0.18, 0.18], 0.01);
  }
  log("drive", { by: DRIVE, start: at0, end: over, held });
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

  if (leaderPoses) {
    // The recording is the leader's motion: every sample's joints are a pose
    // the leader sent, to within the rounding of the wire format.
    const traj = await (await fetch(`${BASE}/api/trajectory/${hash}`)).json();
    const samples = traj.samples ?? traj.trajectory?.samples ?? [];
    const D = 180 / Math.PI;
    const worst = samples.map((smp) => Math.min(...leaderPoses.map((p) =>
      Math.max(...[0, 1, 2, 3, 4].map((j) => Math.abs(smp.q[j] * D - p[j])))))).reduce((a, b) => Math.max(a, b), 0);
    log("leader", { samples: samples.length, poses: leaderPoses.length, worstJointDegFromALeaderPose: +worst.toFixed(3) });
    assert.ok(samples.length > 50, "the run was recorded");
    assert.ok(worst < 0.05, `every recorded pose is one the leader sent (worst ${worst}°)`);
  }

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
  stopLeader?.();
}

/**
 * A hand on a physical leader, played back: a pick-and-place from the task's
 * start to its goal, solved into SO-101 joint angles with the station's own
 * chain, sent as the AS5600 firmware sends them (test/fake-leader.py, on a
 * pseudo-terminal) and read by the real arm relay with --leader.
 */
var stopLeader;
async function startLeader() {
  const c = new So101Chain();
  const fk = () => { const p = new THREE.Vector3().setFromMatrixPosition(c.tcpPose()); return [p.x / 1000, p.y / 1000, p.z / 1000]; };
  const home = fk();
  const OPEN = 46, SHUT = 7;
  const legs = [
    [[0.22, 0.14, 0.12], 2.0, OPEN], [[0.22, 0.14, 0.05], 1.0, OPEN], [[0.22, 0.14, 0.05], 0.6, SHUT],
    [[0.22, 0.14, 0.16], 1.0, SHUT], [[0.16, -0.18, 0.16], 2.0, SHUT], [[0.16, -0.18, 0.07], 1.0, SHUT],
    [[0.16, -0.18, 0.07], 0.6, OPEN], [[0.16, -0.18, 0.18], 0.8, OPEN],
  ];
  const poses = [[...SO101.homeDeg]];
  let from = home, jaw = SO101.homeDeg[5];
  for (const [to, secs, toJaw] of legs) {
    const n = Math.round(secs * 50);
    for (let i = 1; i <= n; i++) {
      const u = i / n, e = u * u * (3 - 2 * u);
      solveSo101(c, from.map((f, k) => f + (to[k] - f) * e));
      poses.push([...c.q.slice(0, 5).map((v) => +v.toFixed(3)), +(jaw + (toJaw - jaw) * e).toFixed(3)]);
    }
    from = to; jaw = toJaw;
  }
  const file = join(tmpdir(), `thenar-leader-${process.pid}.json`);
  writeFileSync(file, JSON.stringify(poses));
  const fakeLeader = spawn("python3", [fileURLToPath(new URL("./fake-leader.py", import.meta.url)), file, "--calibrated"]);
  let err = "";
  fakeLeader.stderr.on("data", (d) => (err += d));
  const pty = await Promise.race([
    new Promise((ok) => fakeLeader.stdout.once("data", (d) => ok(String(d).split("\n")[0].trim()))),
    new Promise((_, no) => setTimeout(() => no(new Error(`the fake leader did not start: ${err}`)), 5000)),
  ]);
  const relay = spawn(process.execPath, ["scripts/arm-relay.mjs", "--leader", pty]);
  let out = "";
  relay.stdout.on("data", (d) => (out += d));
  relay.stderr.on("data", (d) => (out += d));
  await until(async () => out.includes("THENAR arm relay on"), 10_000, "the relay");
  stopLeader = () => { relay.kill(); fakeLeader.kill(); };
  log("leader", { pty, poses: poses.length, seconds: poses.length / 50 });
  return { leaderPoses: poses, fakeLeader, relay };
}
