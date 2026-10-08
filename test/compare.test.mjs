import { test } from "node:test";
import assert from "node:assert/strict";
import { chainlinkAnswer, costAt, duration, times } from "../lib/compare.ts";

test("Chainlink's answer is the second word, with 8 decimals", () => {
  // roundId, answer = 2569.95 * 1e8, startedAt, updatedAt, answeredInRound
  const w = (n) => BigInt(n).toString(16).padStart(64, "0");
  const result = "0x" + w(110680464442257320000n) + w(256995000000n) + w(1) + w(2) + w(3);
  assert.equal(chainlinkAnswer(result), 2569.95);
  assert.throws(() => chainlinkAnswer("0x1234"), /too little/);
});

test("the same gas, priced on Ethereum", () => {
  const c = costAt(411_464n, 206_000_000n, 2569.95);
  assert.equal(c.wei, 84_761_584_000_000n);
  assert.ok(Math.abs(c.eth - 0.000084761584) < 1e-15);
  assert.ok(Math.abs(c.usd - 0.21783) < 1e-4);
});

test("durations read as a person would say them", () => {
  assert.equal(duration(0.58), "580 ms");
  assert.equal(duration(1.4), "1.4 s");
  assert.equal(duration(768), "12 min 48 s");
  assert.equal(duration(720), "12 min");
  assert.equal(duration(-1), "…");
});

test("a ratio is rounded the way a sentence would", () => {
  assert.equal(times(768, 0.58), "about 1,320 times");
  assert.equal(times(12, 0.3), "about 40 times");
  assert.equal(times(1, 0), null);
});
