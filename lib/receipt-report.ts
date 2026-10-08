import type { Hash } from "viem";
import type { Timers } from "./receipt-timers";

/**
 * Send a transaction's measured timers to the server, for the histogram of
 * recent receipts (/api/receipts). Fire and forget: a timing that does not
 * arrive is a missing row in a chart, never a failed transaction. Sent once
 * when the transaction executes and again when it is final.
 */
export function reportTimers(tx: Hash, action: string, t: Timers) {
  if (t.executedMs === undefined) return;
  void fetch("/api/receipts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      tx, action, chain: t.where, via: t.via,
      executedMs: Math.max(0, Math.round(t.executedMs)),
      finalMs: t.finalMs === undefined ? null : Math.max(0, Math.round(t.finalMs)),
    }),
    keepalive: true,
  }).catch(() => {});
}
