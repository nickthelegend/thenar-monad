# How Thenar uses Privy: a lab's robot-data budget that can only fund robot data

*Thenar · Monad Metropolis, Track 04 · live at https://app.thenar.io*

Thenar is a market for robot demonstrations on Monad:
- **operators** drive a robot arm (in a browser, a Quest headset or with a leader arm);
- a verifier scores the run, and **one Monad transaction records it and pays them**;
- **AI agents** buy the resulting corpus over x402.

Privy does two jobs in Thenar: signing in the people who drive the arm, and holding the money of the labs that fund
them. This article is mostly about the second.

## The problem Privy solves: a lab's budget without a key on a laptop

A robotics lab posts a task: "put the toothpaste in the upper drawer, 6 runs, 0.002 MON each". It escrows the reward
on Monad, and operators earn it run by run. The lab wants to post tasks from a script or a dashboard. It does **not**
want a hot private key that can send its whole budget anywhere sitting on an engineer's laptop or in a CI secret.
One leaked key and the budget is gone.

What the lab needs is a wallet that can do exactly one thing: fund Thenar tasks. It should be capped per
transaction, and enforced somewhere that holds even when the calling code is compromised.

Privy's server wallets with **policies** give exactly that. The rule is checked when Privy signs, before a signature
exists. A signature is all anyone needs to spend, so that is the only place the rule can hold.

## How it works

### 1. One policy, one allowed action

`scripts/privy-lab.mjs` creates the policy once through Privy's API. It allows a transaction only if it goes to
Thenar's contract (AxonProtocolV2), on Monad testnet, worth no more than 0.1 MON:

```js
const allowFunding = (method) => ({
  name: `Fund Thenar tasks on Monad (${method})`,
  method,
  action: "ALLOW",
  conditions: [
    { field_source: "ethereum_transaction", field: "to", operator: "eq", value: AXON },
    { field_source: "ethereum_transaction", field: "chain_id", operator: "eq", value: String(monad.id) },
    { field_source: "ethereum_transaction", field: "value", operator: "lte", value: LIMIT.toString() },
  ],
});
// rules: [allowFunding("eth_sendTransaction"), allowFunding("eth_signTransaction")]
```

Anything not allowed is denied. The lab's wallet is a Privy server wallet created **with** that policy attached
(`policy_ids: [policyId]`).

### 2. Privy signs, Monad executes

To post a bounty, the script prices and nonces an EIP-1559 transaction from Monad (`createTaskUntil(...)`, with the
escrow as its value). It asks Privy to sign it (`eth_signTransaction` on the wallet's RPC), then sends the signed
bytes with Monad's `eth_sendRawTransactionSync`. The receipt comes back in the send's own response. The same timers
the station uses measure executed and final.

### 3. The policy refuses everything else

Then the script asks the same wallet to sign a plain 0.01 MON transfer to another address. Privy answers
`400 {"code":"policy_violation"}`, and no signature is produced. The demo shows this refusal on screen, right after
the bounty lands.

### 4. Operators sign in with Privy

On the app, operators sign in with email (or an external wallet) through Privy and get an embedded wallet on Monad.
Every onboarding step on `/start` is then read from the chain or the wallet. This uses `components/providers.tsx`
(`loginMethods: ["email", "wallet"]`).

## Engineering notes

- **Monad charges the gas limit, not the gas used,** so the transaction Privy signs carries a thin margin
  (estimate × 1.1) instead of a generous default. The lab pays for every unit of the limit.
- **Privy signs and Monad's RPC broadcasts.** Thenar never holds the lab's key. Only the app secret is held, and it
  can only ask Privy for what the policy allows.
- **The policy name has a length limit:** Privy refuses names of 50 characters or more. That is why the policy is
  called "Thenar lab: fund Monad tasks, 0.1 MON max".
- **Idempotent setup.** The policy and wallet IDs are recorded once in `.env.local`. `--setup-only` creates them
  without touching the chain.

## What Privy brought to Thenar

- **A safe way for labs to pay.** A lab can automate bounties with a wallet whose worst case is "it funded Thenar
  tasks", not "it lost the budget". That is the difference between a demo and something a lab would run.
- **Enforcement where it matters.** The rule holds even if the script calling Privy is compromised, because Privy
  refuses at signing time.
- **No-crypto sign-in for operators.** An email is enough to start driving, and the embedded wallet receives the
  pay.

## See it live (Monad testnet)

- **Bounty task #13, signed by Privy:**
  [0x8dc67558…2138c](https://testnet.monadvision.com/tx/0x8dc67558b4a17ccbd2d3c85f13b723082ac2ba2e19e5922ddf78289c5ca2138c).
  It escrows 0.008 MON for 2 runs. The policy then refused a 0.01 MON send to another address
  (`policy_violation`).
- **Bounty task #12, signed by Privy:**
  [0xdfb15157…8d7c5](https://testnet.monadvision.com/tx/0xdfb15157ca93b73dcd66c23cb0572a7ceffa999c2ccbdb3bd896346f4ec8d7c5).
- **The lab wallet:** `0xeD2f5E810D24970E83ADac83CEec5A9BC7DE0454`.
- **A paid run on that lab's task #13:**
  [0x909f2c23…0d59](https://testnet.monadvision.com/tx/0x909f2c23ccae46476bbf18f55fb0a7e85d56a0cf23a642f47ea2375f0eda0d59).
- **The demo video at 0:16** shows the bounty and the refusal (`docs/demo/thenar-demo.mp4`).
- **Code:** `scripts/privy-lab.mjs`, `components/providers.tsx`.

*These bounties were posted by our team (team-seeded) to show the flow. Each one is a real Monad testnet
transaction.*
