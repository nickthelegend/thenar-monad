import { test } from "node:test";
import assert from "node:assert/strict";
import { logX, summarize, tickLabel, TICKS } from "../lib/receipt-stats.ts";

test("the log axis puts each decade an equal step apart, and clamps", () => {
  const steps = TICKS.map((t) => logX(t));
  const gaps = steps.slice(1).map((v, i) => v - steps[i]);
  for (const g of gaps) assert.ok(Math.abs(g - gaps[0]) < 1e-9);
  assert.equal(logX(0), 0);
  assert.equal(logX(10_000_000), 1);
  assert.ok(logX(600) > logX(400));
});

test("tick labels read as a person would say them", () => {
  assert.equal(tickLabel(10), "10 ms");
  assert.equal(tickLabel(1000), "1 s");
  assert.equal(tickLabel(100_000), "100 s");
});

test("medians ignore a receipt that is not final yet, and count it", () => {
  const s = summarize([
    { executedMs: 300, finalMs: 600 },
    { executedMs: 500, finalMs: 900 },
    { executedMs: 400, finalMs: null },
  ]);
  assert.deepEqual(s, { count: 3, executed: 400, final: 750, pending: 1 });
  assert.deepEqual(summarize([]), { count: 0, executed: null, final: null, pending: 0 });
});
