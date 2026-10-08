/**
 * Monad beside Ethereum, from live reads of both.
 *
 * The judges' question is what Monad changes, and the honest answer is a
 * comparison of numbers read just now, not quoted from a slide: how long a
 * block takes to be final on each, and what the gas a Thenar run used would
 * cost on Ethereum at its gas price right now. The server reads Ethereum
 * mainnet (/api/compare); Monad's side comes from the live strip.
 */

/** Chainlink's ETH/USD feed on Ethereum mainnet; `latestRoundData()` answers with 8 decimals. */
export const ETH_USD_FEED = "0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419" as const;
export const LATEST_ROUND_DATA = "0xfeaf968c" as const;

/** The `answer` word of latestRoundData(), as dollars. */
export function chainlinkAnswer(result: string, decimals = 8): number {
  const hex = result.replace(/^0x/, "");
  if (hex.length < 128) throw new Error("latestRoundData returned too little");
  return Number(BigInt(`0x${hex.slice(64, 128)}`)) / 10 ** decimals;
}

/** What `gas` would cost at `gasPriceWei`, in ETH and dollars. */
export function costAt(gas: bigint, gasPriceWei: bigint, usdPerEth: number) {
  const wei = gas * gasPriceWei;
  const eth = Number(wei) / 1e18;
  return { wei, eth, usd: eth * usdPerEth };
}

/** "12 min 48 s", "580 ms", "1.4 s". */
export function duration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "…";
  if (seconds < 1) return `${Math.round(seconds * 1000)} ms`;
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s ? `${m} min ${s} s` : `${m} min`;
}

/** How many times longer one wait is than another, for a sentence: "about 1,300 times". */
export function times(slow: number, fast: number): string | null {
  if (!(fast > 0) || !(slow > 0)) return null;
  const n = slow / fast;
  const rounded = n >= 100 ? Math.round(n / 10) * 10 : Math.round(n);
  return `about ${rounded.toLocaleString("en-US")} times`;
}

export type Compare = {
  at: number;
  ethereum:
    | { source: string; gasPriceWei: string; usdPerEth: number; usdUpdatedAt: number; latest: number; finalized: number; finalizedLagBlocks: number; finalizedLagSeconds: number; blockSeconds: number }
    | { source: string | null; error: string };
};
