import { NextResponse } from "next/server";
import { logged } from "@/lib/server/log";
import { ETH_USD_FEED, LATEST_ROUND_DATA, chainlinkAnswer, type Compare } from "@/lib/compare";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Public Ethereum mainnet endpoints, tried in order. Read-only: nothing is ever sent but reads. */
const ETHEREUM_RPC = [process.env.ETHEREUM_RPC_URL, "https://ethereum-rpc.publicnode.com", "https://1rpc.io/eth"].filter(Boolean) as string[];

let cached: Compare | null = null;

type Block = { number: string; timestamp: string };

/**
 * Ethereum mainnet, read now, for the side-by-side on /network and the
 * station's receipt: its gas price, how far its `finalized` tag trails the
 * head (in blocks and seconds), its block time over the last ten blocks, and
 * ETH/USD from Chainlink's feed. One JSON-RPC batch, kept for a minute.
 */
async function handleGET() {
  if (cached && Date.now() - cached.at < 60_000) return NextResponse.json(cached);
  let lastError = "no endpoint answered";
  for (const url of ETHEREUM_RPC) {
    try {
      const call = (id: number, method: string, params: unknown[]) => ({ jsonrpc: "2.0", id, method, params });
      const r = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify([
          call(0, "eth_gasPrice", []),
          call(1, "eth_getBlockByNumber", ["latest", false]),
          call(2, "eth_getBlockByNumber", ["finalized", false]),
          call(3, "eth_call", [{ to: ETH_USD_FEED, data: LATEST_ROUND_DATA }, "latest"]),
        ]),
        signal: AbortSignal.timeout(8_000),
      });
      if (!r.ok) throw new Error(`answered ${r.status}`);
      const out = (await r.json()) as { id: number; result?: unknown; error?: { message: string } }[];
      const by = (id: number) => {
        const x = out.find((o) => o.id === id);
        if (!x || x.error || x.result == null) throw new Error(x?.error?.message ?? `no answer to call ${id}`);
        return x.result;
      };
      const latest = by(1) as Block;
      const finalized = by(2) as Block;
      const round = by(3) as string;
      const n = (h: string) => Number.parseInt(h, 16);
      // Block time from ten blocks back, one more read.
      const back = await fetch(url, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(call(4, "eth_getBlockByNumber", [`0x${(n(latest.number) - 10).toString(16)}`, false])),
        signal: AbortSignal.timeout(8_000),
      }).then((x) => x.json() as Promise<{ result?: Block }>);
      const tenBack = back.result;
      cached = {
        at: Date.now(),
        ethereum: {
          source: new URL(url).host,
          gasPriceWei: BigInt(by(0) as string).toString(),
          usdPerEth: chainlinkAnswer(round),
          usdUpdatedAt: n(`0x${round.slice(2 + 64 * 3, 2 + 64 * 4)}`),
          latest: n(latest.number),
          finalized: n(finalized.number),
          finalizedLagBlocks: n(latest.number) - n(finalized.number),
          finalizedLagSeconds: n(latest.timestamp) - n(finalized.timestamp),
          blockSeconds: tenBack ? (n(latest.timestamp) - n(tenBack.timestamp)) / 10 : NaN,
        },
      };
      return NextResponse.json(cached);
    } catch (e) {
      lastError = `${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`;
    }
  }
  // A state, not a failure: the comparison says Ethereum could not be read.
  return NextResponse.json({ at: Date.now(), ethereum: { source: null, error: lastError } } satisfies Compare);
}

export const GET = logged("/api/compare", handleGET);
