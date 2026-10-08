"use client";

import { useEffect, useState } from "react";
import { LOCALNET } from "@/lib/chain";
import { median } from "@/lib/monad-commit";
import { useMonadStream } from "@/lib/monad-stream";
import { TICKS, logX, summarize, tickLabel } from "@/lib/receipt-stats";
import { cn } from "@/lib/cn";

/**
 * Thenar's last twenty transactions, each as the browser that sent it timed
 * it: a dot when it executed and a dot when it was final, on one log axis.
 *
 * Beside it, Monad testnet's finality right now, from the live strip. On a
 * local build the receipts are the local chain's, whose finalized tag trails
 * by about a minute, and the chart says so; the reference line is the real
 * network. After the testnet go both are Monad's.
 */

type Receipt = { tx: string; action: string; via: string; executedMs: number; finalMs: number | null; at: number };

const W = 600;
const ROW = 16;
const ms = (v: number | null) => (v === null ? "…" : v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)} s` : `${Math.round(v)} ms`);
const shortAction = (a: string) => a.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();

export function ReceiptHistogram({ className }: { className?: string }) {
  const [rows, setRows] = useState<Receipt[] | null>(null);
  const [failed, setFailed] = useState(false);
  const stream = useMonadStream();
  const monadFinal = median(stream.pipeline.latencies.Finalized);

  useEffect(() => {
    let live = true;
    const read = () =>
      fetch("/api/receipts?limit=20")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d: { receipts: Receipt[] }) => { if (live) { setRows(d.receipts); setFailed(false); } })
        .catch(() => { if (live) setFailed(true); });
    void read();
    const t = setInterval(read, 15_000);
    return () => { live = false; clearInterval(t); };
  }, []);

  const s = summarize(rows ?? []);
  const H = Math.max(1, rows?.length ?? 0) * ROW + 22;

  return (
    <section className={cn("w-full rounded-2xl border border-white/10 bg-ink-1 p-4 text-left sm:p-6", className)} data-testid="receipt-histogram" aria-label="Recent receipts, executed and final">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm text-scribe">
          Thenar&rsquo;s last {s.count || ""} transactions, executed <span className="text-probe">●</span> and final <span className="text-go">●</span>
        </p>
        <p className="font-mono text-xs tabular-nums text-scribe-3">
          median {ms(s.executed)} → {ms(s.final)}{s.pending ? ` · ${s.pending} not final yet` : ""}
        </p>
      </div>

      {failed ? (
        <p className="mt-4 text-sm text-reject">The receipts could not be read.</p>
      ) : !rows ? (
        <div className="hatch mt-4 h-24" aria-busy="true" />
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-scribe-2">No transactions timed yet. Each one sent from this app adds a row: a paid run, a passkey, a mint.</p>
      ) : (
        <div className="mt-3 grid grid-cols-[7.5rem_1fr] gap-x-3 sm:grid-cols-[10rem_1fr]">
          <ol className="flex flex-col pt-[22px] text-right font-mono text-xs leading-4 text-scribe-3">
            {rows.map((r) => <li key={r.tx} className="h-4 truncate" title={r.tx}>{shortAction(r.action)}</li>)}
          </ol>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-auto w-full overflow-visible" role="img"
               aria-label={`Executed and final times for ${rows.length} transactions, on a log scale from 1 ms to 300 s`}>
            {TICKS.map((t) => (
              <g key={t}>
                <line x1={logX(t) * W} x2={logX(t) * W} y1={14} y2={H} stroke="var(--color-rule)" />
                <text x={logX(t) * W} y={10} textAnchor="middle" fontSize="10" fill="var(--color-scribe-3)" fontFamily="var(--font-mono)">{tickLabel(t)}</text>
              </g>
            ))}
            {monadFinal !== null ? (
              <g data-testid="monad-final-line">
                <rect x={logX(monadFinal) * W - 1} y={14} width={2} height={H - 14} fill="var(--color-go)" opacity={0.35} />
              </g>
            ) : null}
            {rows.map((r, i) => {
              const y = 22 + i * ROW + ROW / 2 - 4;
              const x1 = logX(r.executedMs) * W;
              const x2 = r.finalMs === null ? null : logX(r.finalMs) * W;
              return (
                <g key={r.tx}>
                  {x2 !== null ? <line x1={x1} x2={x2} y1={y} y2={y} stroke="var(--color-rule-strong)" strokeWidth="2" /> : null}
                  <circle cx={x1} cy={y} r="4" fill="var(--color-probe)" />
                  {x2 !== null ? <circle cx={x2} cy={y} r="4" fill="var(--color-go)" /> : null}
                </g>
              );
            })}
          </svg>
        </div>
      )}

      <p className="mt-3 text-xs leading-relaxed text-scribe-3">
        Each row is timed by the browser that sent it, from the send: the signing prompt is in neither number.
        {monadFinal !== null ? <> The green band is Monad testnet&rsquo;s finality right now, {ms(monadFinal)}, measured live by the strip.</> : null}
        {LOCALNET
          ? " These receipts are the local chain's: anvil executes at once, and its finalized tag trails the head by about sixty blocks, so 'final' here is about a minute. After the testnet go they are Monad's."
          : " These receipts are Monad testnet's."}
      </p>
    </section>
  );
}
