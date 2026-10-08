"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AGENT_CORPUS } from "@/lib/agent-corpus";
import { cn } from "@/lib/cn";

/**
 * The agents that buy the data, ranked: purchases from the Envio indexer
 * (SalesLog on chain), and beside each, how many of its purchases it signed
 * an account of and how many of those it checked against SalesLog.
 */

type Row = { id: string; purchases: number; tasks: number; spent: string; lastAt: string; lastTaskId: string; trails: number; verified: number };
type Answer = { source: "indexer" | "ledger"; note: string | null; agents: Row[] };

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
const usdc = (atomic: string) => (Number(atomic) / 10 ** AGENT_CORPUS.decimals).toFixed(2);
const ago = (unix: string) => {
  const s = Math.max(0, Date.now() / 1000 - Number(unix));
  return s < 3600 ? `${Math.round(s / 60)} min ago` : s < 86_400 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86_400)} d ago`;
};

export function AgentLeaderboard() {
  const [a, setA] = useState<Answer | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch("/api/agents/leaderboard")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Answer) => { if (live) setA(d); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, []);

  return (
    <section className="mt-12" data-testid="agent-leaderboard" data-source={a?.source}>
      <h2 className="font-display text-2xl font-600">Agents</h2>
      <p className="mt-2 max-w-[64ch] text-[14px] leading-relaxed text-scribe-2">
        Who buys the data, ranked by what they bought over x402.{" "}
        {a?.source === "indexer"
          ? "Read from the Envio indexer, which follows SalesLog's sales on chain."
          : a
            ? a.note
            : null}{" "}
        &ldquo;Signed&rdquo; is how many of those purchases the agent explained in a record signed with the key that paid,
        and how many of those it checked against SalesLog.
      </p>

      {failed ? (
        <p className="mt-4 text-[14px] text-reject">The ranking could not be read.</p>
      ) : !a ? (
        <div className="hatch mt-4 h-24" aria-busy="true" />
      ) : a.agents.length === 0 ? (
        <p className="mt-4 text-[14px] text-scribe-2">No agent has bought a corpus yet. <Link href="/agents" className="text-signal hover:text-signal-hi">How an agent buys &rarr;</Link></p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[620px] text-left text-[13px]">
            <thead>
              <tr className="text-[11px] text-scribe-3">
                <th className="py-2 pr-4 font-normal">#</th>
                <th className="py-2 pr-4 font-normal">Agent</th>
                <th className="py-2 pr-4 text-right font-normal">Purchases</th>
                <th className="py-2 pr-4 text-right font-normal">Tasks</th>
                <th className="py-2 pr-4 text-right font-normal">Spent ({AGENT_CORPUS.symbol})</th>
                <th className="py-2 pr-4 font-normal">Signed</th>
                <th className="py-2 font-normal">Last</th>
              </tr>
            </thead>
            <tbody>
              {a.agents.map((r, i) => (
                <tr key={r.id} className="border-t border-rule">
                  <td className="py-2 pr-4 font-mono tabular-nums text-scribe-3">{i + 1}</td>
                  <td className="py-2 pr-4 font-mono">
                    <Link href={`/agents?address=${r.id}`} className="text-signal hover:text-signal-hi" title={r.id}>{short(r.id)}</Link>
                  </td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-scribe">{r.purchases}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-scribe-2">{r.tasks}</td>
                  <td className="py-2 pr-4 text-right font-mono tabular-nums text-scribe-2">{usdc(r.spent)}</td>
                  <td className={cn("py-2 pr-4 font-mono text-[12px]", r.trails ? "text-go" : "text-scribe-3")}>
                    {r.trails ? `${r.trails} of ${r.purchases}, ${r.verified} checked` : "none"}
                  </td>
                  <td className="py-2 font-mono text-[12px] text-scribe-3">task #{r.lastTaskId}, {ago(r.lastAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
