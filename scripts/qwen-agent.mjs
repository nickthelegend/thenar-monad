/**
 * A Qwen agent that shops for robot training data, and pays for it itself.
 *
 *   node --import ./test/register.mjs scripts/qwen-agent.mjs [baseUrl] ["what to buy"]
 *
 * Qwen reads the task list and each task's datasheet, asks what a corpus
 * costs, decides what is worth buying within its budget, pays for it over
 * x402 (an EIP-3009 USDC authorisation its own key signs), checks what it
 * received against SalesLog on chain, and explains its choice. The model
 * decides; the code only carries its decisions out, and holds the budget
 * where the model cannot talk its way past it.
 *
 * The model, through any OpenAI-compatible endpoint with tool calling:
 *   DASHSCOPE_API_KEY set  Qwen on Alibaba Cloud Model Studio (QWEN_MODEL, default qwen3.8-max)
 *   otherwise              Qwen 3 on this machine through Ollama (QWEN_MODEL, default qwen3:4b)
 * QWEN_BASE_URL overrides either.
 *
 * AGENT_PRIVATE_KEY is the agent's wallet. AGENT_BUDGET_USDC caps what it
 * may spend in one session (default 0.05).
 */
import { createHash } from "node:crypto";
import { createPublicClient, formatUnits, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { decodePaymentResponseHeader, wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { AGENT_CORPUS } from "../lib/agent-corpus.ts";
import { SALES_LOG_ABI } from "../lib/registry-abi.ts";
import { AXON_ABI } from "../lib/abi.ts";
import { armOf } from "../lib/scan.ts";
import { ADDR, appChain, env, need, transport, txUrl } from "./monad.mjs";

const BASE = process.argv[2] ?? "http://localhost:3336";
const GOAL = process.argv[3] ??
  "Find the robot manipulation corpus with the most accepted episodes and buy it, then check on chain that what you received is what was sold.";

const cloud = Boolean(env("DASHSCOPE_API_KEY"));
const LLM = {
  url: (env("QWEN_BASE_URL") ?? (cloud ? "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" : "http://127.0.0.1:11434/v1")).replace(/\/$/, ""),
  model: env("QWEN_MODEL") ?? (cloud ? "qwen3.8-max" : "qwen3:4b"),
  key: env("DASHSCOPE_API_KEY") ?? "ollama",
};
const BUDGET = BigInt(Math.round(Number(env("AGENT_BUDGET_USDC") ?? "0.05") * 10 ** AGENT_CORPUS.decimals));
const MAX_STEPS = 12;

const wallet = privateKeyToAccount(need(env("AGENT_PRIVATE_KEY"), "AGENT_PRIVATE_KEY"));
const chain = createPublicClient({ chain: appChain, transport: transport() });
const payer = x402Client.fromConfig({
  schemes: [{ network: AGENT_CORPUS.network, client: new ExactEvmScheme(toClientEvmSigner(wallet, chain)) }],
  spendControls: {
    allowedAssets: [{ network: AGENT_CORPUS.network, asset: AGENT_CORPUS.asset, maxAmountPerPayment: String(BUDGET) }],
  },
});
const fetchPaid = wrapFetchWithPayment(fetch, payer);

let spent = 0n;
/** The task ids list_tasks returned; any other id is refused before it costs a request. */
let taskIds = null;
const unknownTask = (id) =>
  !taskIds ? "call list_tasks first" : !taskIds.has(id) ? `there is no task ${id}; the tasks are ${[...taskIds].join(", ")}` : null;
/** What the agent bought this session, by task: the bytes and what the server said of them. */
const bought = new Map();
const usdc = (a) => `${formatUnits(BigInt(a), AGENT_CORPUS.decimals)} ${AGENT_CORPUS.symbol}`;
const getJson = async (path) => {
  const r = await fetch(`${BASE}${path}`, { headers: { accept: "application/json" } });
  return { status: r.status, body: await r.json().catch(() => null) };
};

// ---------------------------------------------------------------------------
// The tools, as the model sees them and as they run.

const TOOLS = {
  list_tasks: {
    description: "List every task on Thenar: its instruction, which robot arm it is recorded on, how many accepted episodes and contributors its corpus has, and how many labelled failures.",
    parameters: { type: "object", properties: {}, required: [] },
    run: async () => {
      const count = Number(await chain.readContract({ address: ADDR.axon, abi: AXON_ABI, functionName: "taskCount" }));
      const rows = [];
      for (let id = 0; id < count; id++) {
        // The chain names every task; a datasheet exists once a task has runs.
        const t = await chain.readContract({ address: ADDR.axon, abi: AXON_ABI, functionName: "getTask", args: [BigInt(id)] });
        const { body } = await getJson(`/api/task/${id}/datasheet`);
        const c = body?.composition;
        rows.push({
          task_id: id, instruction: c?.instruction ?? t.name.replace(/\s*\[[^\]]*\]/g, "").trim(), arm: c?.arm ?? armOf(t.name),
          episodes: c?.episodes ?? 0, contributors: c?.contributors ?? 0, labelled_failures: c?.negatives ?? 0,
        });
      }
      taskIds = new Set(rows.map((r) => r.task_id));
      return { tasks: rows };
    },
  },
  read_datasheet: {
    description: "Read one task's full datasheet: how the data was collected and scored, its quality figures, provenance and limitations.",
    parameters: { type: "object", properties: { task_id: { type: "integer" } }, required: ["task_id"] },
    run: async ({ task_id }) => {
      if (unknownTask(task_id)) return { error: unknownTask(task_id) };
      const { status, body } = await getJson(`/api/task/${task_id}/datasheet`);
      if (status !== 200) return { error: body?.error ?? `HTTP ${status}` };
      return { quality: body.quality, collection: body.collection, provenance: body.provenance, limitations: body.limitations };
    },
  },
  get_price: {
    description: "Ask what one task's corpus costs, without paying: the x402 offer the server makes.",
    parameters: { type: "object", properties: { task_id: { type: "integer" } }, required: ["task_id"] },
    run: async ({ task_id }) => {
      if (unknownTask(task_id)) return { error: unknownTask(task_id) };
      const r = await fetch(`${BASE}${AGENT_CORPUS.path}?taskId=${task_id}`, { headers: { accept: "application/json" } });
      const b = await r.json().catch(() => null);
      if (r.status !== 402) return { error: `expected an offer (402), got ${r.status}`, body: b };
      const a = b.accepts?.[0];
      return { price: usdc(a.amount), network: a.network, pay_to: a.payTo, scheme: a.scheme, budget_left: usdc(BUDGET - spent) };
    },
  },
  buy_corpus: {
    description: "Pay for and download one task's corpus over x402. Spends USDC from the agent's wallet; refused if it would exceed the session budget.",
    parameters: { type: "object", properties: { task_id: { type: "integer" } }, required: ["task_id"] },
    run: async ({ task_id }) => {
      if (unknownTask(task_id)) return { error: unknownTask(task_id) };
      if (bought.has(task_id)) return { error: "already bought this session", ...bought.get(task_id).summary };
      const price = BigInt(AGENT_CORPUS.amount);
      if (spent + price > BUDGET) return { error: `refused: ${usdc(price)} would exceed the budget (${usdc(BUDGET - spent)} left)` };
      const res = await fetchPaid(`${BASE}${AGENT_CORPUS.path}?taskId=${task_id}`, { headers: { accept: "application/json" } });
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!res.ok) return { error: `HTTP ${res.status}: ${bytes.toString("utf8").slice(0, 300)}` };
      const receipt = res.headers.get("PAYMENT-RESPONSE");
      const settled = receipt ? decodePaymentResponseHeader(receipt) : null;
      if (settled?.success) spent += price;
      const body = JSON.parse(bytes.toString("utf8"));
      const sha256 = createHash("sha256").update(bytes).digest("hex");
      const summary = {
        dataset: body.dataset, episodes: body.episodes, frames: body.total_frames, labelled_failures: body.negatives?.length ?? 0,
        sha256, server_sha256_agrees: res.headers.get("x-thenar-sha256") === sha256,
        paid: settled?.success ? usdc(price) : "nothing", payment_tx: settled?.transaction ?? null,
        audit: res.headers.get("x-thenar-audit"),
      };
      bought.set(task_id, { body, sha256, audit: summary.audit, summary });
      return summary;
    },
  },
  verify_on_chain: {
    description: "Check a bought corpus against SalesLog on chain: whether the sale the server says it logged records exactly the sha256 of the bytes received.",
    parameters: { type: "object", properties: { task_id: { type: "integer" } }, required: ["task_id"] },
    run: async ({ task_id }) => {
      const b = bought.get(task_id);
      if (!b) return { error: "not bought this session" };
      const m = b.audit?.match(/^(0x[0-9a-fA-F]{40})#(\d+)$/);
      if (!m) return { verified: false, reason: `the server did not log the sale: ${b.audit}` };
      const [served, sale] = await Promise.all([
        chain.readContract({ address: m[1], abi: SALES_LOG_ABI, functionName: "servedCount", args: [`0x${b.sha256}`] }),
        chain.readContract({ address: m[1], abi: SALES_LOG_ABI, functionName: "getSale", args: [BigInt(m[2])] }),
      ]);
      return {
        verified: sale.sha256 === `0x${b.sha256}`, sales_log: m[1], entry: Number(m[2]),
        logged_sha256: sale.sha256, received_sha256: `0x${b.sha256}`, sales_serving_these_bytes: Number(served),
      };
    },
  },
  inspect_corpus: {
    description: "Summarise a bought corpus: per-episode scores, durations and frame counts, so the purchase can be judged.",
    parameters: { type: "object", properties: { task_id: { type: "integer" } }, required: ["task_id"] },
    run: async ({ task_id }) => {
      const b = bought.get(task_id);
      if (!b) return { error: "not bought this session" };
      return {
        dataset: b.body.dataset, embodiment: b.body.embodiment, control_hz: b.body.control_frequency_hz,
        splits: b.body.splits?.counts,
        episodes: (b.body.data ?? []).slice(0, 20).map((e) => ({
          score: e.quality_score, deviation_mm: e.deviation_mm, seconds: e.duration_s, frames: e.length, split: e.split,
        })),
        labelled_failures: (b.body.negatives ?? []).map((f) => f.failure?.kind ?? f.failure ?? "unlabelled").slice(0, 10),
      };
    },
  },
};

// ---------------------------------------------------------------------------
// The loop.

const SYSTEM = `You are a purchasing agent for a robotics lab. You buy robot manipulation training data from Thenar, a marketplace where people teleoperate robot arms and every recording is paid for on chain.
Your wallet is ${wallet.address}. Your budget this session is ${usdc(BUDGET)}; the tools enforce it.
Use the tools to look before you buy, buy only what the goal asks for, and verify every purchase on chain before you report.
Call one tool at a time and wait for its answer. Use only task ids that list_tasks returned.
Finish with a short report: what you bought and why, what it cost, the payment transaction, and whether the chain confirmed it. Do not invent figures: quote only what the tools returned. If nothing was bought, say so.`;

const messages = [{ role: "system", content: SYSTEM }, { role: "user", content: GOAL }];
const tools = Object.entries(TOOLS).map(([name, t]) => ({ type: "function", function: { name, description: t.description, parameters: t.parameters } }));
let report = "";
const strip = (s) => (s ?? "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();

console.log(`agent     ${wallet.address} on ${appChain.name}, budget ${usdc(BUDGET)}`);
console.log(`model     ${LLM.model} at ${LLM.url}${cloud ? " (Alibaba Cloud Model Studio)" : " (Ollama, this machine)"}`);
console.log(`goal      ${GOAL}\n`);

for (let step = 1; step <= MAX_STEPS; step++) {
  const r = await fetch(`${LLM.url}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${LLM.key}` },
    body: JSON.stringify({ model: LLM.model, messages, tools, tool_choice: "auto", temperature: 0.2 }),
  });
  if (!r.ok) throw new Error(`the model answered ${r.status}: ${(await r.text()).slice(0, 400)}`);
  const msg = (await r.json()).choices[0].message;
  messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: msg.tool_calls });
  // One tool per turn, so every call is made knowing the last one's answer. A
  // small model asked to plan will otherwise buy and verify in one breath,
  // before it has seen whether the purchase happened.
  const calls = (msg.tool_calls ?? []).slice(0, 1);
  if (msg.tool_calls?.length > 1) msg.tool_calls = calls;
  if (!calls.length) {
    report = strip(msg.content);
    console.log(`\nreport    ${report.replace(/\n/g, "\n          ")}`);
    break;
  }
  for (const c of calls) {
    c.id ??= `call_${step}`;
    const args = typeof c.function.arguments === "string" ? JSON.parse(c.function.arguments || "{}") : c.function.arguments ?? {};
    const tool = TOOLS[c.function.name];
    const out = tool ? await tool.run(args).catch((e) => ({ error: e instanceof Error ? e.message.split("\n")[0] : String(e) })) : { error: `no tool ${c.function.name}` };
    console.log(`step ${String(step).padEnd(4)} ${c.function.name}(${JSON.stringify(args)})`);
    console.log(`          → ${JSON.stringify(out).slice(0, 400)}`);
    messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(out) });
  }
}

// The ledger, from what actually happened rather than from what the model said.
console.log(`\nledger    spent ${usdc(spent)} of ${usdc(BUDGET)} on ${bought.size} corpus purchase(s)`);
for (const [id, b] of bought) {
  console.log(`          task ${id}: ${b.summary.episodes} episodes, sha256 ${b.sha256.slice(0, 16)}…, paid ${b.summary.paid}`);
  if (b.summary.payment_tx) console.log(`          ${txUrl(b.summary.payment_tx)}`);
}
if (!bought.size && /\bbought\b|\bpurchased\b/i.test(report) && !/not|nothing|no /i.test(report.slice(0, 80))) {
  console.log("warning   the model's report claims a purchase the ledger does not have");
  process.exitCode = 2;
}
