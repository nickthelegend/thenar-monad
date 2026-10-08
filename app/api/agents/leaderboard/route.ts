import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { query } from "@/lib/server/sql";
import { INDEXER_URL, IndexerError, indexerQuery } from "@/lib/server/indexer";
import { appChain } from "@/lib/chain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Agent = { id: string; purchases: number; tasks: number; spent: string; firstAt: string; lastAt: string; lastTaskId: string };
type Row = Agent & { trails: number; verified: number };

const QUERY = `query Agents($chain: Int!) {
  Agent(where: { chainId: { _eq: $chain } }, order_by: [{ purchases: desc }, { lastAt: desc }], limit: 20) {
    id purchases tasks spent firstAt lastAt lastTaskId
  }
}`;

/**
 * The agents that buy Thenar's data, ranked by what they bought.
 *
 * The purchases come from the Envio indexer, which reads SalesLog's
 * CorpusSold events from the chain: how many pulls, across how many tasks,
 * for how much USDC. The indexer cannot see an agent's reasons, which live off
 * chain, so each row is joined with the decision records the agent signed
 * (lib/agent-decision.ts): how many of its purchases it explained, and how
 * many of those it checked against SalesLog and found to match.
 *
 * With no indexer running (a local build without Docker), the same ranking is
 * counted from this app's own sales ledger instead, and `source` says which.
 */
async function handleGET() {
  let agents: Agent[];
  let source: "indexer" | "ledger";
  let note: string | null = null;
  try {
    if (!INDEXER_URL) throw new IndexerError("no indexer is configured");
    agents = (await indexerQuery<{ Agent: Agent[] }>(QUERY, { chain: appChain.id })).Agent;
    source = "indexer";
  } catch (e) {
    source = "ledger";
    note = `The indexer is not available here (${e instanceof Error ? e.message : String(e)}), so this ranking is counted from the app's own sales ledger.`;
    const rows = await query<{ buyer: string; purchases: number; tasks: number; spent: string; first_at: number; last_at: number; last_task: number }>(
      `SELECT s.buyer AS buyer, COUNT(*) AS purchases, COUNT(DISTINCT s.task_id) AS tasks,
              CAST(SUM(CAST(COALESCE(s.amount, '0') AS BIGINT)) AS TEXT) AS spent,
              MIN(s.created_at) AS first_at, MAX(s.created_at) AS last_at,
              (SELECT task_id FROM corpus_sale x WHERE x.buyer = s.buyer ORDER BY x.created_at DESC LIMIT 1) AS last_task
         FROM corpus_sale s WHERE s.buyer IS NOT NULL AND s.method = 'x402'
        GROUP BY s.buyer ORDER BY purchases DESC, last_at DESC LIMIT 20`,
    );
    agents = rows.map((r) => ({
      id: r.buyer, purchases: Number(r.purchases), tasks: Number(r.tasks), spent: String(r.spent ?? "0"),
      firstAt: String(Math.floor(Number(r.first_at) / 1000)), lastAt: String(Math.floor(Number(r.last_at) / 1000)), lastTaskId: String(r.last_task),
    }));
  }

  // The off-chain half: each agent's signed accounts of its purchases.
  const decisions = await query<{ buyer: string; record: string }>(`SELECT buyer, record FROM agent_decision`);
  const trails = new Map<string, { trails: number; verified: number }>();
  for (const d of decisions) {
    const k = d.buyer.toLowerCase();
    const t = trails.get(k) ?? { trails: 0, verified: 0 };
    t.trails += 1;
    try { if ((JSON.parse(d.record) as { verified?: { matches?: boolean } | null }).verified?.matches) t.verified += 1; } catch { /* a record that does not parse counts as unverified */ }
    trails.set(k, t);
  }

  const rows: Row[] = agents.map((a) => ({ ...a, ...(trails.get(a.id.toLowerCase()) ?? { trails: 0, verified: 0 }) }));
  return NextResponse.json({ source, note, chainId: appChain.id, agents: rows }, { headers: { "cache-control": "public, max-age=10" } });
}

export const GET = logged("/api/agents/leaderboard", handleGET);
