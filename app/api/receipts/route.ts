import { NextResponse } from "next/server";
import { isAddress } from "viem";
import { logged } from "@/lib/server/log";
import { query, run } from "@/lib/server/sql";
import { chainClient } from "@/lib/rpc";
import { ACTIVE_DEPLOYMENT, LOCALNET, USDC } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The longest a timer may read: ten minutes. A local chain's finality is about a minute. */
const MAX_MS = 600_000;
const ACTIONS = /^[a-zA-Z][a-zA-Z0-9]{0,39}$/;
const THIS_CHAIN = LOCALNET ? "local" : "monad";

/** Every address this deployment's own transactions touch. */
const OURS = new Set(
  [...Object.values(ACTIVE_DEPLOYMENT.contracts as Record<string, string>), USDC]
    .filter((a) => typeof a === "string" && isAddress(a))
    .map((a) => a.toLowerCase()),
);

const client = chainClient();

type Row = { tx: string; chain: string; action: string; via: string; executed_ms: number; final_ms: number | null; created_at: number };

/**
 * How long Thenar's transactions take, as measured by the browsers that sent
 * them: executed (the receipt is in) and final (the block is at the
 * `finalized` tag). /thenar and /network draw the last twenty.
 *
 *   POST { tx, action, chain, via, executedMs, finalMs }
 *   GET  ?limit=20
 *
 * A timing is kept only for a transaction this chain has, that succeeded and
 * touched one of this deployment's contracts, from a build on this same
 * chain: nobody can fill the chart with another app's transactions, or pass a
 * local timing off as a Monad one. A transaction's final time may be added
 * once, after its executed time; nothing is overwritten.
 */
async function handlePOST(req: Request) {
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "the body is not JSON" }, { status: 400 }); }
  const tx = String(b.tx ?? "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(tx)) return NextResponse.json({ error: "tx must be a transaction hash" }, { status: 400 });
  if (b.chain !== THIS_CHAIN) return NextResponse.json({ error: `this deployment records ${THIS_CHAIN} timings only` }, { status: 400 });
  if (typeof b.action !== "string" || !ACTIONS.test(b.action)) return NextResponse.json({ error: "action must be a function name" }, { status: 400 });
  if (b.via !== "eth_sendRawTransactionSync" && b.via !== "eth_getTransactionReceipt") return NextResponse.json({ error: "via must name how the receipt came back" }, { status: 400 });
  const executed = Number(b.executedMs);
  const final = b.finalMs === null || b.finalMs === undefined ? null : Number(b.finalMs);
  if (!Number.isInteger(executed) || executed < 0 || executed > MAX_MS) return NextResponse.json({ error: "executedMs must be whole milliseconds, at most ten minutes" }, { status: 400 });
  if (final !== null && (!Number.isInteger(final) || final < executed || final > MAX_MS)) return NextResponse.json({ error: "finalMs must be at least executedMs and at most ten minutes" }, { status: 400 });

  const known = (await query<Row>(`SELECT * FROM receipt_timing WHERE tx = ?`, [tx]))[0];
  if (known) {
    if (final === null || known.final_ms !== null) return NextResponse.json({ error: "this transaction's timings are already recorded" }, { status: 409 });
    await run(`UPDATE receipt_timing SET final_ms = ? WHERE tx = ? AND final_ms IS NULL`, [final, tx]);
    return NextResponse.json({ saved: "final" });
  }

  const receipt = await client.getTransactionReceipt({ hash: tx as `0x${string}` }).catch(() => null);
  if (!receipt) return NextResponse.json({ error: "this chain has no such transaction" }, { status: 404 });
  if (receipt.status !== "success") return NextResponse.json({ error: "the transaction reverted" }, { status: 400 });
  const touched = [receipt.to, ...receipt.logs.map((l) => l.address)].some((a) => a && OURS.has(a.toLowerCase()));
  if (!touched) return NextResponse.json({ error: "the transaction touched none of this deployment's contracts" }, { status: 400 });

  await run(
    `INSERT INTO receipt_timing (tx, chain, action, via, executed_ms, final_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (tx) DO NOTHING`,
    [tx, THIS_CHAIN, b.action, b.via, executed, final, Date.now()],
  );
  return NextResponse.json({ saved: final === null ? "executed" : "both" }, { status: 201 });
}

async function handleGET(req: Request) {
  const n = Math.min(50, Math.max(1, Number(new URL(req.url).searchParams.get("limit") ?? 20) || 20));
  const rows = await query<Row>(`SELECT * FROM receipt_timing WHERE chain = ? ORDER BY created_at DESC LIMIT ?`, [THIS_CHAIN, n]);
  return NextResponse.json({
    chain: THIS_CHAIN,
    receipts: rows.map((r) => ({ tx: r.tx, action: r.action, via: r.via, executedMs: r.executed_ms, finalMs: r.final_ms, at: Number(r.created_at) })),
  });
}

export const POST = logged("/api/receipts", handlePOST);
export const GET = logged("/api/receipts", handleGET);
