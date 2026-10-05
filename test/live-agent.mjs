/**
 * Live, on the local chain: the buyer agent, on Qwen and on Kimi.
 *
 *   BASE=http://localhost:3336 NEXT_PUBLIC_CHAIN=local node --import ./test/register.mjs test/live-agent.mjs
 *
 * Needs the local chain, the local build, the local x402 facilitator and a
 * task with paid episodes (test/live-localnet.mjs leaves one).
 *
 * With no DashScope or Moonshot key on this machine, each provider runs on
 * its fixture (AGENT_LLM_FIXTURE=1). The fixture scripts the choices and
 * holds every request to that provider's rules. Everything else is the real
 * agent:
 * - it lists the tasks from the chain and the app;
 * - it pays a cent of USDC over x402 with its own key;
 * - the facilitator settles that on the local chain;
 * - it checks the bytes against SalesLog.
 * With a real key set (and no fixture), the same command runs the real model.
 *
 * Then, with neither a key nor the fixture, the agent must refuse to start
 * and name the key it needs.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createPublicClient, erc20Abi, http } from "viem";
import { LOCAL_DEPLOYMENT } from "../lib/deployment-local.ts";
import { readEnvFile } from "../scripts/monad.mjs";

const BASE = process.env.BASE ?? "http://localhost:3336";
const RPC = process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8645";
const agent = readEnvFile(".env.localnet").AGENT_ADDRESS;
const chain = createPublicClient({ transport: http(RPC) });
const usdc = () => chain.readContract({ address: LOCAL_DEPLOYMENT.usdc, abi: erc20Abi, functionName: "balanceOf", args: [agent] });

/** Run the agent once; resolve with its exit code and output. */
function runAgent(env) {
  return new Promise((done) => {
    const p = spawn(process.execPath, ["--import", "./test/register.mjs", "scripts/qwen-agent.mjs", BASE], {
      // Keys a developer has exported would turn the fixture run into a real one; this test is about the fixture.
      env: { ...process.env, NEXT_PUBLIC_CHAIN: "local", DASHSCOPE_API_KEY: "", MOONSHOT_API_KEY: "", ...env },
    });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("exit", (code) => done({ code, out }));
  });
}

for (const provider of ["qwen", "kimi"]) {
  const before = await usdc();
  const { code, out } = await runAgent({ AGENT_LLM: provider, AGENT_LLM_FIXTURE: "1" });
  const steps = [...out.matchAll(/^step \d+\s+(\w+)\(/gm)].map((m) => m[1]);
  const verify = out.match(/verify_on_chain[^\n]*\n\s+→ (\{[^\n]*\})/);
  const report = out.match(/^report\s+([^\n]+)/m)?.[1] ?? "";
  console.log(`${provider.padEnd(9)} ${out.match(/^model\s+([^\n]+)/m)?.[1]}`);
  console.log(`          steps ${steps.join(" → ")}`);
  console.log(`          report ${report.slice(0, 160)}…`);
  assert.equal(code, 0, `${provider}: the agent finished cleanly\n${out.slice(-1500)}`);
  assert.match(out, /FIXTURE: scripted replies/, "the run says it is a fixture");
  assert.deepEqual(steps, ["list_tasks", "read_datasheet", "get_price", "buy_corpus", "verify_on_chain"]);
  assert.ok(verify, "the agent checked its purchase on chain");
  assert.equal(JSON.parse(verify[1]).verified, true, "SalesLog records the sha256 of the bytes it received");
  assert.match(out, /ledger\s+spent 0\.01 USDC/);
  assert.equal(before - (await usdc()), 10_000n, "one cent of USDC left the agent's wallet");
  assert.match(report, /matches the bytes received/);
}

// Neither a key nor the fixture: it must not start, and must say what it needs.
for (const [provider, key] of [["qwen", "DASHSCOPE_API_KEY"], ["kimi", "MOONSHOT_API_KEY"]]) {
  const { code, out } = await runAgent({ AGENT_LLM: provider, AGENT_LLM_FIXTURE: "" });
  assert.equal(code, 1, `${provider} without a key exits`);
  assert.match(out, new RegExp(`${key} \\(or AGENT_LLM_FIXTURE=1`), `${provider} names ${key}`);
}
console.log("no key    each provider refuses to start and names its key");
console.log("LIVE AGENT: PASS");
