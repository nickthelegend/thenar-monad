"use client";

import { useEffect, useState } from "react";
import { cadence, median } from "@/lib/monad-commit";
import { useMonadStream } from "@/lib/monad-stream";
import { costAt, duration, times, type Compare } from "@/lib/compare";
import { cn } from "@/lib/cn";

/**
 * Monad beside Ethereum mainnet, both read just now.
 *
 * Ethereum's side comes from /api/compare (gas price, how far its finalized
 * tag trails the head, ETH/USD from Chainlink). Monad's comes from the live
 * strip in this page. Nothing is quoted from a slide.
 */

let shared: Promise<Compare> | null = null;
let sharedAt = 0;
function readCompare(): Promise<Compare> {
  if (!shared || Date.now() - sharedAt > 60_000) {
    sharedAt = Date.now();
    shared = fetch("/api/compare").then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))));
    shared.catch(() => { shared = null; });
  }
  return shared;
}

export function useCompare() {
  const [c, setC] = useState<Compare | null>(null);
  useEffect(() => {
    let live = true;
    const read = () => readCompare().then((x) => { if (live) setC(x); }).catch(() => {});
    void read();
    const t = setInterval(read, 60_000);
    return () => { live = false; clearInterval(t); };
  }, []);
  return c;
}

type Eth = Extract<Compare["ethereum"], { gasPriceWei: string }>;
const eth = (c: Compare | null): Eth | null => (c && "gasPriceWei" in c.ethereum ? c.ethereum : null);
const gwei = (wei: string) => {
  const g = Number(wei) / 1e9;
  return `${g < 1 ? g.toFixed(3) : g.toFixed(1)} gwei`;
};

/** One sentence under the live strip: Ethereum's finality now, against Monad's. */
export function EthereumFinalityLine({ className }: { className?: string }) {
  const c = useCompare();
  const s = useMonadStream();
  const e = eth(c);
  const monadFinal = median(s.pipeline.latencies.Finalized);
  if (!e) return null;
  const ratio = monadFinal ? times(e.finalizedLagSeconds, monadFinal / 1000) : null;
  return (
    <p className={cn("text-xs text-scribe-3", className)} data-testid="ethereum-finality">
      Ethereum mainnet, read just now: a block is final <span className="text-scribe-2">{duration(e.finalizedLagSeconds)}</span> after it is made
      (its finalized tag trails the head by {e.finalizedLagBlocks} blocks){ratio ? <>, {ratio} longer than Monad here</> : null}.
    </p>
  );
}

/** The station receipt's line: this run's gas, priced and finalized on Ethereum now. */
export function EthereumReceiptLine({ gasUsed }: { gasUsed?: bigint }) {
  const c = useCompare();
  const s = useMonadStream();
  const e = eth(c);
  if (!e || gasUsed === undefined) return null;
  const cost = costAt(gasUsed, BigInt(e.gasPriceWei), e.usdPerEth);
  const monadFinal = median(s.pipeline.latencies.Finalized);
  return (
    <span data-testid="ethereum-receipt" className="text-scribe-3">
      On Ethereum right now this run&rsquo;s {gasUsed.toLocaleString("en-US")} gas would cost {cost.eth.toPrecision(2)} ETH
      (${cost.usd.toFixed(2)} at {gwei(e.gasPriceWei)} and ${Math.round(e.usdPerEth).toLocaleString("en-US")} an ETH), and it would be final
      about {duration(e.finalizedLagSeconds)} later{monadFinal ? <>, against {duration(monadFinal / 1000)} on Monad testnet now</> : null}.
    </span>
  );
}

/** /network's side-by-side. */
export function CompareCard({ monadBaseFeeWei }: { monadBaseFeeWei: bigint | null }) {
  const c = useCompare();
  const s = useMonadStream();
  const e = eth(c);
  const block = cadence(s.pipeline);
  const final = median(s.pipeline.latencies.Finalized);
  const RUN = 400_000n;
  const rows: [string, string, string][] = [
    ["A block", block ? duration(block / 1000) : "…", e && Number.isFinite(e.blockSeconds) ? duration(e.blockSeconds) : "…"],
    ["Final after", final ? duration(final / 1000) : "…", e ? `${duration(e.finalizedLagSeconds)} (${e.finalizedLagBlocks} blocks)` : "…"],
    ["Gas price", monadBaseFeeWei !== null ? gwei(monadBaseFeeWei.toString()) : "…", e ? gwei(e.gasPriceWei) : "…"],
    ["Gas is charged on", "the limit", "the gas used"],
    [
      "A 400,000-gas run",
      monadBaseFeeWei !== null ? `${(Number(RUN * monadBaseFeeWei) / 1e18).toFixed(3)} MON (testnet MON has no market price)` : "…",
      e ? (() => { const x = costAt(RUN, BigInt(e.gasPriceWei), e.usdPerEth); return `${x.eth.toPrecision(2)} ETH ($${x.usd.toFixed(2)})`; })() : "…",
    ],
  ];
  return (
    <section className="rounded-2xl border border-white/10 bg-ink-1 p-5" data-testid="network-compare">
      <h2 className="text-lg font-medium text-scribe">Monad beside Ethereum, read live</h2>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead><tr className="text-xs text-scribe-3"><th className="py-2 pr-4 font-normal" /><th className="py-2 pr-4 font-normal">Monad testnet</th><th className="py-2 font-normal">Ethereum mainnet</th></tr></thead>
          <tbody>
            {rows.map(([k, m, x]) => (
              <tr key={k} className="border-t border-white/10">
                <td className="py-2 pr-4 text-scribe-3">{k}</td>
                <td className="py-2 pr-4 font-mono text-xs text-scribe">{m}</td>
                <td className="py-2 font-mono text-xs text-scribe-2">{x}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-scribe-3">
        Monad&rsquo;s block time and finality are measured by the strip above in this browser; its gas price is the latest
        block&rsquo;s base fee. Ethereum&rsquo;s are read by this server{e ? <> from {e.source}</> : null}: the gas price, the head
        and the finalized tag, and ETH/USD from Chainlink&rsquo;s feed{e ? <> (${e.usdPerEth.toLocaleString("en-US")})</> : null}.
        {c && !e ? <span className="text-reject"> Ethereum could not be read just now: {"error" in c.ethereum ? c.ethereum.error : ""}.</span> : null}
        {" "}Gas is priced differently on each chain; the last row is the same amount of gas at each one&rsquo;s price.
      </p>
    </section>
  );
}
