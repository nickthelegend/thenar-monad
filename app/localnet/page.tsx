"use client";

import { useState } from "react";
import Link from "next/link";
import { useBlockNumber, useReadContract } from "wagmi";
import { erc20Abi, formatUnits } from "viem";
import { Button } from "@/components/primitives";
import { useSession } from "@/components/session";
import { ACTIVE_DEPLOYMENT, CURRENCY, LOCALNET, LOCAL_RPC, USDC, appChain } from "@/lib/chain";

/**
 * The local chain, and the wallet this browser holds on it.
 *
 * Where FAUCET_URL points on a local build: the one place to see which chain
 * the site is on, what is deployed there, and to top up a wallet.
 */
export default function LocalnetPage() {
  const s = useSession();
  const { data: block } = useBlockNumber({ watch: true });
  const { data: usdc, refetch } = useReadContract({
    address: USDC, abi: erc20Abi, functionName: "balanceOf",
    args: s.address ? [s.address] : undefined, query: { enabled: Boolean(s.address && USDC), refetchInterval: 4_000 },
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  if (!LOCALNET) {
    return (
      <div className="mx-auto max-w-[760px] px-5 py-8">
        <h1 className="font-display text-4xl font-600">Local chain</h1>
        <p className="mt-3 text-[15px] text-scribe-2">This build runs on {appChain.name}, not on a local chain.</p>
      </div>
    );
  }

  const fund = async () => {
    if (!s.address) return;
    setBusy(true); setNote(null);
    try {
      const r = await fetch("/api/localnet/fund", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: s.address }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "The faucet refused.");
      setNote(b.funded ? `Sent 5 ${CURRENCY} and 20 USDC.` : "This wallet already has more than 1 MON.");
      void s.refetchBalance(); void refetch();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "The faucet did not answer.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-[760px] px-5 py-8">
      <h1 className="font-display text-4xl font-600 leading-none tracking-[-0.01em]">Local chain</h1>
      <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-scribe-2">
        This build of Thenar runs on a chain on this machine: anvil with the Osaka hardfork, which has the
        P-256 precompile Monad has, and the same contracts DeployMonad.s.sol deploys. Transactions here are
        real and signed; they are not on Monad.
      </p>
      <dl className="mt-6 grid grid-cols-[140px_1fr] gap-x-4 gap-y-2 border-y border-rule py-4 font-mono text-[13px] max-sm:grid-cols-1">
        <dt className="label">Chain</dt><dd>{appChain.name} · {appChain.id}</dd>
        <dt className="label">RPC</dt><dd className="break-all">{LOCAL_RPC}</dd>
        <dt className="label">Block</dt><dd data-testid="local-block">{block?.toString() ?? "…"}</dd>
        <dt className="label">Protocol</dt>
        <dd className="break-all"><Link className="text-probe hover:underline" href={`/explorer/address/${ACTIVE_DEPLOYMENT.contracts.axon}`}>{ACTIVE_DEPLOYMENT.contracts.axon}</Link></dd>
      </dl>

      {!s.connected ? (
        <>
          <Button variant="primary" className="mt-6" onClick={s.connect} disabled={s.connecting}>
            {s.connecting ? "Connecting…" : "Sign in with the local wallet"}
          </Button>
          {s.connectError ? <p className="mt-3 text-[13px] text-reject">{s.connectError.message.split("\n")[0]}</p> : null}
        </>
      ) : (
        <div className="mt-6 flex flex-col gap-3">
          <p className="font-mono text-[13px]">
            <span className="label mr-2">Wallet</span>
            <Link className="break-all text-probe hover:underline" href={`/explorer/address/${s.address}`}>{s.address}</Link>
          </p>
          <p className="font-mono text-[13px]" data-testid="local-balances">
            <span className="label mr-2">Holds</span>
            {s.balance.toFixed(4)} {CURRENCY} · {usdc !== undefined ? formatUnits(usdc, 6) : "…"} USDC
          </p>
          <Button className="self-start" onClick={fund} disabled={busy}>{busy ? "Sending…" : "Top up from the faucet"}</Button>
          {note ? <p className="text-[13px] text-scribe-2">{note}</p> : null}
        </div>
      )}
    </div>
  );
}
