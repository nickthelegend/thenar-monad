# Thenar: what it takes to win

A judge's-eye review, written on 7 Oct 2026 after using the local build cold, the way a judge with five minutes would:
landing, a station, a paid run, the corpus, the agents page, the passkey page and the status page, at 1440 px and 390 px.
The "before" screens are in `docs/screens/wave/*-before-*.png`.

Main-track judging weighs product quality, technical excellence, Monad integration, track fit and innovation at 20%
each. Bounties weigh meeting the stated requirement at 40%.

## The 10 biggest weaknesses, ranked by what they cost with judges

| # | Weakness | Evidence | What it costs |
|---|---|---|---|
| 1 | **Monad's speed is claimed, not shown.** Nothing on screen moves at Monad's pace. The only timing is one "settled in 0.00s" line after a paid run, and on the local build that is anvil's instant mining with no label. There is no block or finality indicator, no commit states and no two-timer receipt. | `app/station/[taskId]/page.tsx:1009`; landing, run and corpus screens | The whole 20% "Monad integration" criterion. "Paid on Monad" reads like any EVM chain. |
| 2 | **Some Monad copy is wrong.** README says "single-slot finality". /agents says a sale is "final in the block it lands in". Monad finalises 2 slots later (about 600 ms), and a receipt arrives at Proposed. | `README.md:90`, `SUBMISSION.md:41,164`, `app/agents/page.tsx:79`, `lib/agent-corpus.ts:11` | A judge who knows MonadBFT stops trusting every other claim. |
| 3 | **The data product is a list of hashes.** /corpus shows `0x40d3…d211 paid 96.82 166 f`. A buyer can't see what an episode looks like without opening runs one by one. Per-task facts (root on chain, audit verdict, sales) are on other pages or nowhere. | `05-corpus-before-*.png` | The buy side of a two-sided market looks empty. Track fit is "provenance and ownership", and the provenance can't be seen. |
| 4 | **The buyer agent is a black box.** /agents lists settlements, but not what the agent saw, decided or checked. The Qwen and Kimi evidence lives in a terminal. The page also gives wrong facts on a local build: "through the Monad facilitator" for a local facilitator, and `localhost:3222` instead of the app's port. | `06-agents-before-*.png`, `app/agents/page.tsx` | Qwen and Kimi bounties (40% on the stated requirement: an agent that does real work) and the "agent trust" half of Track 4. |
| 5 | **Onboarding is a scavenger hunt.** A new operator has to: sign in, get gas, set up a passkey, practise, then run. The landing offers two unrelated buttons ("Find a task", "Set up your passkey"), and nothing says where you are in the sequence. | `01-landing-before-*.png`, `07-passkey-before-*.png` | Product quality. A judge who can't finish a paid run in 2 minutes scores the product, not the protocol. |
| 6 | **Passkeys on chain are invisible.** The registry verifies P-256 through `0x0100`, but the UI never shows the precompile working. It's one sentence of copy. | `07-passkey-before-*.png` | Mera bounty depth, and the most Monad-specific primitive Thenar uses. |
| 7 | **Nothing touches the live Monad network.** The Monad deployment has no runs yet (testnet hold), the local build is all anvil, and no surface reads Monad itself: no staking, no epochs, no canonical contracts, no facilitator check. | `08-status-before-*.png` | Judges look for Monad activity. Live reads are allowed and cost nothing. |
| 8 | **Gas is estimated, not set.** `lib/chain.ts` says the submit's limit is estimated. On Monad the fee is the limit × price, a wallet that falls back after a failed estimate can charge up to 30M gas, and the 10 MON reserve rule applies to delegated (7702) accounts. None of this shows in the cost line. | `lib/chain.ts:20`, `SubmitCostLine` | Technical excellence on Monad specifically. Judges who know the gas model check it. |
| 9 | **Contracts are unverified, and links go to one explorer** (fixed in W5: all twelve exact-match on Sourcify). Sourcify returns `match: null` for AxonProtocolV2, PasskeyRegistry, SalesLog and CorpusShares on 10143. Links go only to Monadscan. | `curl sourcify-api-monad.blockvision.org/v2/contract/10143/0x1773…5f38` | "Verified, linked and indexed" is a Monad-integration checkbox. |
| 10 | **Two front doors and 34 routes.** `/` is the ThenarLabs company page (six products, hardware). The product lives at `/thenar`. Archive, changelog, foundry, handheld, hub, inventory, lab, policies, portfolio, space and spec all compete for five minutes. | `02-home-before-*.png`, `app/**/page.tsx` | Focus. Judges spend their minute on a duck robot. |

**What already works and should lead:**
- driving a real SO-101 in the browser, on a Quest 3S or with a leader arm;
- a paid run you can replay and re-hash in the browser (`/run/[hash]`);
- an x402 corpus purchase checked against SalesLog;
- one passkey that gives many keys (Mera);
- a clean status page.

**Run replay is not a gap:** `/run/[hash]` already plays back the recorded joint angles with a scrubber, speed control, phase jumps and a LeRobot export. So the seed idea "run replay" gives way to weakness 1.

## The top 5, ranked by impact × effort

None needs MON or a user key. Each is real code on real data, with unit and e2e tests, before and after screens at 1440
px and 390 px, one commit, and CI green.

### W1. The Monad pipeline: live commit states, two-timer receipts, transaction status
Fixes weaknesses 1, 2 and 7.

- **What:** a block strip fed by `monadNewHeads` over `wss://testnet-rpc.monad.xyz`. Each block shows as a chip moving
  Proposed → Voted → Finalized → Verified, with the milliseconds measured in the browser.
- **Where:** the landing page, the station and the run page.
- **Thenar's own events:** `monadLogs` filtered to Thenar's Monad contracts.
- **Receipts:** after a submit, two timers ("executed in X ms" and "final in Y ms"), plus a "seen by the node" state
  from `txpool_statusByHash` on Monad.
- **Labels:** every element says where it runs: "Monad testnet, live", or "local chain: anvil mines instantly, these
  are not Monad timings".
- **Copy:** 300 ms blocks and about 600 ms finality everywhere.
- **Acceptance:**
  - On the local build, /thenar shows testnet blocks arriving about every 300 ms, and at least one block in each of the
    four states within 3 s of load.
  - The Proposed → Finalized time shown is measured in the browser, not hardcoded.
  - When the socket is closed (offline), the strip says it is disconnected instead of freezing.
  - A local paid run shows both timers, labelled as local-chain timings. Unit tests cover the commit-state reducer:
    - a skipped Voted state;
    - competing proposals at one height;
    - dropping the losing proposal when a block finalizes;
    - the cap on blocks kept.
  - e2e: the local journey sees the receipt panel.
  - No "single-slot" or "final in the block it lands in" copy remains.

### W2. Dataset explorer with previews
Fixes weakness 3.

- **What:** /corpus becomes a browsable dataset.
- **Per episode:** a card with a top-down preview of the tool path and the payload's path, drawn from the stored
  samples; a joint-angle sparkline; score, outcome, duration and frames; and links to its replay and LeRobot export.
- **Per task:** a summary with episodes, pass rate, the Merkle root committed on chain, and the sales logged.
- **Acceptance:**
  - Every preview is computed from the real samples, via one batched API call, with no N+1 fetches.
  - Previews match the replay: the start and end points equal the first and last samples.
  - At 390 px the cards stack, with no horizontal overflow.
  - The empty and error states are composed.
  - The unit test checks the downsampler keeps the endpoints and is bounded.
  - e2e: /corpus renders previews for the local episodes.

### W3. Buyer-agent transparency
Fixes weakness 4.

- **What:** the agent signs a decision record for each purchase and posts it. Each record holds:
  - the model and provider;
  - the tools it called, in order;
  - the 402 terms it accepted;
  - its stated reason;
  - its verification result (the sha256 of its copy compared with the SalesLog entry).
- **On /agents:** each sale expands into that trail, with the signature checked server-side and in the page.
- **Copy:** fix the facilitator and port copy, so the page names the facilitator actually in use.
- **Acceptance:**
  - A record is accepted only when signed by the sale's buyer and naming a settled sale.
  - A forged or mismatched record is rejected (unit test).
  - A real agent run (Qwen 3 on Ollama locally, or the scripted OpenAI-compatible double in CI) produces a trail on
    /agents.
  - Missing keys still say "not configured".

### W4. Operator onboarding
Fixes weaknesses 5 and 6.

- **What:** a `/start` checklist that reads real state and offers one action per step:
  1. signed in;
  2. gas: sponsored, or enough MON for a submit at its explicit limit;
  3. passkey registered on chain, with the P-256 check through `0x0100` shown, including the registration transaction;
  4. a practice run;
  5. the first paid run, linked.
- **Entry point:** the landing's primary button leads there for a new visitor.
- **Acceptance:**
  - Each step's state comes from the chain, the database or this browser, never from a stored "done" flag the server
    trusts.
  - A fresh local wallet goes from step 1 to step 5 in the e2e.
  - Each step has its own empty, loading and error state.
  - Works at 390 px.

### W5. Monad network panel and gas correctness
Fixes weaknesses 7, 8 and 9.

- **What:** a /network page of live testnet reads, each labelled "live read: Monad testnet":
  - `getEpoch` and `getProposerValId` from staking (`0x1000`), and the validator from `getValidator`;
  - the block cadence, measured;
  - `latest`, `safe` and `finalized` read in one batch (N, N−1, N−2);
  - `dippedIntoReserve()` on `0x1001`;
  - a P-256 vector checked by `0x0100`;
  - a code check of the canonical contracts (WMON, Multicall3, Permit2, EntryPoints, CreateX, the x402 Permit2 proxy);
  - the Monad x402 facilitator's `/supported`.
- **Gas:** every Thenar write gets an explicit, measured gas limit from the gas snapshot plus a margin. The cost line
  shows "limit × price, Monad charges the limit". A reserve-balance guard (pure functions, unit-tested) runs on MON
  value spends.
- **Explorers:** MonadVision links next to Monadscan.
- **Acceptance:**
  - Every number on /network comes from a request made by the page, with its timestamp.
  - A 429 backs off and says so.
  - Gas limits are covered by a test that fails when the snapshot outgrows the limit.
  - The reserve guard has unit tests for the delegated-account and emptying-transaction cases.

## Monad-native coverage

One line per item in the brief.

Status words:
- **built**: it runs in this repo;
- **live read**: it reads Monad testnet now;
- **fork only**: it works on the local chain only;
- **awaiting testnet go**: needs MON or a deploy;
- **not applicable**: with the reason.

| # | Item | Status | Where |
|---|---|---|---|
| 1 | Live commit-state strip (`monadNewHeads`, `monadLogs`) | **live read**: on /thenar and the station, on every build. On 7 Oct it measured 297 ms a block, 577 ms Proposed → Finalized and 1.49 s → Verified. `monadLogs` watches Thenar's 12 Monad contracts. | `lib/monad-commit.ts`, `lib/monad-stream.ts`, `components/monad-pipeline.tsx` |
| 2 | Two-timer receipts (`eth_sendRawTransactionSync` and the commit stream) | **built**: the local wallet sends with `eth_sendRawTransactionSync`. The station shows executed and final, labelled as local timings (anvil's finalized tag trails by 59 blocks). On Monad a run is credited at finality. Monad timings **await testnet go**. | `lib/receipt-timers.ts`, `components/receipt-timers.tsx`, `lib/local-wallet.ts` |
| 3 | Transaction status (`txpool_statusByHash` / `ByAddress`) | **built, awaiting testnet go**: polled on Monad builds while the receipt is outstanding and shown as "seen by the node". Anvil has no `txpool_status*`. | `lib/receipt-timers.ts` |
| 4 | Passkeys on chain (Mera, P-256 via `0x0100`) | **built** (PasskeyRegistry verifies through `0x0100` on Monad and on the local chain; Mera's PRF gives the SO-101 key) and **live read**: /network makes a P-256 key in the page and has Monad testnet's `0x0100` check its signature, and refuse a tampered one. /start shows the passkey step read from the registry. | `contracts/src/PasskeyRegistry.sol`, `components/passkey-keys.tsx`, `app/network/page.tsx` |
| 5 | Native staking reads (`0x1000`) | **live read**: /network reads `getEpoch`, `getProposerValId` and `getValidator`. Delegating is **not applicable**: a task's escrow must be payable to an operator in the block a run is recorded, and staked MON takes an epoch to come back. | `lib/monad-network.ts`, `app/network/page.tsx` |
| 6 | Gas correctness (limit pricing, reserve `0x1001`, 128 KB, storage layout) | **built**. Every write is estimated by the node under Monad's rules, refused if the simulation reverts, and sent with the estimate plus a tenth as its limit. The receipt shows limit, used and what was charged. A MON spend is checked against the 10 MON reserve, and a delegated (7702) account is refused a send Monad would revert. `dippedIntoReserve()` is read live. The sharded slot counter keeps operators off one storage slot. The 128 KB limit is **not applicable**: the largest contract is under 24 KB. | `lib/monad-gas.ts`, `lib/reserve.ts`, `lib/contract-write.ts`, `contracts/src/AxonProtocolV2.sol` |
| 7 | Monad-native payments (x402 through Monad's facilitator, or MPP) | **built**: x402 v2 on Monad's facilitator for 10143, whose `/supported` /network reads live. A local facilitator serves the local chain. Each agent purchase now carries a signed decision record. MPP is **not applicable**: it would be a second rail for the same one-cent pull. | `lib/agent-corpus.ts`, `app/api/network/route.ts`, `lib/agent-decision.ts` |
| 8 | Canonical contracts and verification | **built**: Multicall3 for every read, Circle USDC for x402, the deterministic CREATE2 deployer for SponsoredAccount. /network checks code at 10 canonical contracts and says what Thenar does with each (WMON, Permit2, CreateX and the EntryPoints are listed as not needed, with the reason). Links go to MonadVision as well as Monadscan. **All twelve of Thenar's Monad testnet contracts were verified on Sourcify on 7 Oct, every one an exact match** (the metadata hashes matched the build first); /network reads their status live. | `lib/monad-network.ts`, `lib/chain.ts` |

## What shipped (7–8 Oct)

| | Feature | Commit | Screens (`docs/screens/wave/`) |
|---|---|---|---|
| W1 | The live Monad pipeline on the landing and the station; two-timer receipts; `txpool_statusByHash`; 300 ms / 600 ms copy | `9ae7cb0` | `01-landing-*`, `03-station-*`, `09-receipt-after-*` |
| W2 | Dataset explorer: episode previews from the samples, one batched call, per-task root against the chain | `d91c403` | `05-corpus-*`, `05b-corpus-task-after-*` |
| W3 | Buyer-agent transparency: signed decision records, checked on the server and again in the page | `2e166e7`, `b148d14` | `06-agents-*` |
| W4 | Operator onboarding: `/start`, five steps read live, from the landing's one primary button | `4d76721` | `11-start-after-*`, `11b-start-done-after-*` |
| W5 | `/network` (Monad read live), Monad-correct gas and the reserve guard, MonadVision links; then Sourcify for all twelve contracts | `10c53a1` | `10-network-after-*` |

Weakness 10 (two front doors and 34 routes) is the one not addressed in this wave.

## The next five

1. **Go live on testnet** (the user's "go" and MON). This is what replaces the local timings with Monad's on the
   receipt, puts `txpool_statusByHash` and `monadLogs` events on Thenar's own transactions, and turns on Privy's
   sponsorship. Deploy CorpusAudit and verify it the same way.
2. **A real model's trail on /agents.** Qwen 3 on Ollama (once its 2.5 GB model is back on this machine) or Model
   Studio and Moonshot with their keys. Today's trails come from the scripted double and say so.
3. **One front door.** `/` on the app domain goes straight to the product; archive, changelog, handheld, inventory,
   space and lab leave the primary menus.
4. **A latency histogram from real receipts:** the last 20 actions' executed and final times on Monad, beside the
   live strip.
5. **Agents in the indexer.** Envio indexes SalesLog and the decision records, and /leaderboard ranks agents by what
   they bought and verified.
