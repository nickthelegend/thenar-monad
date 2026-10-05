"use client";

import { useCallback } from "react";
import { encodeFunctionData, type Abi } from "viem";
import { useAccount, useWriteContract } from "wagmi";
import { useSendTransaction, useWallets } from "@privy-io/react-auth";
import { LOCALNET, appChain } from "./chain";

/**
 * Whether Privy pays the gas for operators' writes.
 *
 * Off unless NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP=1, which is set only once gas
 * sponsorship for Monad Testnet is enabled in the Privy dashboard: without it,
 * Privy refuses a sponsored send. Fixed at build time, like the session, so a
 * local-chain build never calls a Privy hook.
 */
export const GAS_SPONSORED = !LOCALNET && process.env.NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP === "1";

export type ContractWrite = {
  address: `0x${string}`;
  abi: Abi | readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
  value?: bigint;
};

/** The wallet pays its own gas: wagmi, as every write always did. */
function useWalletWrite() {
  const { writeContractAsync: write } = useWriteContract();
  const writeContractAsync = useCallback(
    (req: ContractWrite) => write(req as Parameters<typeof write>[0]),
    [write],
  );
  return { writeContractAsync };
}

/**
 * Privy pays the gas when the operator signed in with email.
 *
 * Only the embedded wallet Privy made can be sponsored. An operator who brought
 * their own wallet still pays for themselves, through wagmi, exactly as before.
 * The transaction is the same call either way, so the contract cannot tell.
 */
function useSponsoredWrite() {
  const { writeContractAsync: write } = useWriteContract();
  const { sendTransaction } = useSendTransaction();
  const { wallets } = useWallets();
  const { address } = useAccount();
  const embedded = wallets.find(
    (w) => w.walletClientType === "privy" && w.address.toLowerCase() === address?.toLowerCase(),
  );

  const writeContractAsync = useCallback(
    async (req: ContractWrite): Promise<`0x${string}`> => {
      if (!embedded) return write(req as Parameters<typeof write>[0]);
      const data = encodeFunctionData({ abi: req.abi as Abi, functionName: req.functionName, args: req.args });
      const { hash } = await sendTransaction(
        { to: req.address, data, chainId: appChain.id, ...(req.value !== undefined ? { value: req.value } : {}) },
        { sponsor: true, address: embedded.address },
      );
      return hash;
    },
    [embedded, write, sendTransaction],
  );
  return { writeContractAsync };
}

/** Chosen once, at build time, so every render calls the same hooks. */
export const useContractWrite = GAS_SPONSORED ? useSponsoredWrite : useWalletWrite;

/** Whether this session's writes are paid for by Privy: email sign-in, sponsorship on. */
function useSponsoredGas() {
  const { wallets } = useWallets();
  const { address } = useAccount();
  return wallets.some((w) => w.walletClientType === "privy" && w.address.toLowerCase() === address?.toLowerCase());
}
export const useGasSponsored: () => boolean = GAS_SPONSORED ? useSponsoredGas : () => false;
