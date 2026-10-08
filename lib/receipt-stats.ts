import { median } from "./monad-commit";

/**
 * The arithmetic behind the receipts chart: a log time axis, because a
 * receipt's two timers can be milliseconds apart (Monad) or a minute apart (a
 * local chain whose finalized tag trails by dozens of blocks), and both have
 * to read on one chart.
 */

export const AXIS_MIN_MS = 1;
export const AXIS_MAX_MS = 300_000;
/** Gridlines: 10 ms, 100 ms, 1 s, 10 s, 100 s. */
export const TICKS = [10, 100, 1_000, 10_000, 100_000];

/** Where `ms` sits on the axis, 0..1, clamped. */
export function logX(ms: number, min = AXIS_MIN_MS, max = AXIS_MAX_MS): number {
  const v = Math.max(min, Math.min(max, ms));
  return (Math.log10(v) - Math.log10(min)) / (Math.log10(max) - Math.log10(min));
}

export const tickLabel = (ms: number) => (ms >= 1000 ? `${ms / 1000} s` : `${ms} ms`);

export type Timed = { executedMs: number; finalMs: number | null };

export function summarize(rows: Timed[]) {
  return {
    count: rows.length,
    executed: median(rows.map((r) => r.executedMs)),
    final: median(rows.filter((r) => r.finalMs !== null).map((r) => r.finalMs as number)),
    pending: rows.filter((r) => r.finalMs === null).length,
  };
}
