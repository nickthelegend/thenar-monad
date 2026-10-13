/**
 * A browser wallet for the recorded demo: an EIP-1193 provider, announced over
 * EIP-6963, whose reads go to Monad's public RPC and whose signatures are made
 * in Node by viem with the recorder's key. The key never enters the page.
 */
import { readFileSync } from "node:fs";
import { createWalletClient, http, hexToString, isHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { monadTestnet } from "viem/chains";

export async function installWallet(context, keyFile, onTx = () => {}) {
  const account = privateKeyToAccount(readFileSync(keyFile, "utf8").trim());
  const wallet = createWalletClient({ account, chain: monadTestnet, transport: http("https://testnet-rpc.monad.xyz") });
  await context.exposeBinding("__recorderSign", async (_src, method, params) => {
    if (method === "personal_sign") {
      const [msg] = params;
      return account.signMessage({ message: isHex(msg) ? { raw: msg } : msg });
    }
    if (method === "eth_signTypedData_v4") {
      const td = typeof params[1] === "string" ? JSON.parse(params[1]) : params[1];
      const { EIP712Domain, ...types } = td.types;
      return account.signTypedData({ domain: td.domain, types, primaryType: td.primaryType, message: td.message });
    }
    if (method === "eth_sendTransaction") {
      const t = params[0];
      const big = (v) => (v === undefined || v === null ? undefined : BigInt(v));
      const hash = await wallet.sendTransaction({ to: t.to, data: t.data, value: big(t.value), gas: big(t.gas) });
      onTx(hash);
      return hash;
    }
    throw new Error(`unsupported ${method}`);
  });
  await context.addInitScript(({ address }) => {
    const RPC = "https://testnet-rpc.monad.xyz";
    const listeners = {};
    let id = 1;
    const provider = {
      isMetaMask: false,
      request: async ({ method, params = [] }) => {
        switch (method) {
          case "eth_requestAccounts": case "eth_accounts": return [address];
          case "eth_chainId": return "0x279f";
          case "net_version": return "10143";
          case "wallet_switchEthereumChain": case "wallet_addEthereumChain": return null;
          case "wallet_requestPermissions": return [{ parentCapability: "eth_accounts" }];
          case "wallet_getPermissions": return [{ parentCapability: "eth_accounts" }];
          case "personal_sign": case "eth_signTypedData_v4": case "eth_sendTransaction":
            return window.__recorderSign(method, params);
        }
        const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: id++, method, params }) }).then((x) => x.json());
        if (r.error) { const e = new Error(r.error.message); e.code = r.error.code; throw e; }
        return r.result;
      },
      on: (ev, fn) => { (listeners[ev] ??= []).push(fn); return provider; },
      removeListener: (ev, fn) => { listeners[ev] = (listeners[ev] ?? []).filter((f) => f !== fn); return provider; },
    };
    window.ethereum = provider;
    const icon = "data:image/svg+xml;base64," + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#8B7CF6"/><circle cx="16" cy="16" r="7" fill="#fff"/></svg>');
    const info = { uuid: "5a1d6c1e-7c1a-4c55-9a0e-7d1b5e0c0a01", name: "Recorder wallet", icon, rdns: "io.thenar.recorder" };
    const announce = () => window.dispatchEvent(new CustomEvent("eip6963:announceProvider", { detail: Object.freeze({ info, provider }) }));
    window.addEventListener("eip6963:requestProvider", announce);
    announce();
  }, { address: account.address });
  return account.address;
}
