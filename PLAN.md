# Thenar × Metropolis: plan

Opened 6 Oct 2026 and updated in place as each task lands. Repo: `nickthelegend/thenar-monad`, branch `main`.

**Standing constraints, from the user via the Metropolis coordinator:**
- No deploys, and no Monad testnet transactions until the user says go. Everything on chain runs on a local anvil, with real
  contracts and real signed transactions.
- No mocks in the product path. Where a key is missing, the feature says "not configured" and its test item is UNTESTED.
- Stop processes by PID only, and stop servers between rounds.

## Goals

**Done** means three things:
- A judge can run Thenar locally with one command.
- Every flow works on real contracts and a real database, with a clean console.
- Every sponsor bounty is either met against its stated requirement or recorded as blocked with the exact reason.

The judge package is complete: README, SUBMISSION.md, a deploy runbook and a demo script. Going live after "go" takes
under an hour.

**Winning** means a top-3 place in **Track 4 (Trust, Identity & AI Infrastructure)** plus sponsor bounties. Judging weights:
- bounties: 40% stated requirements, 30% technical, 20% Monad integration, 10% innovation;
- track: identity, provenance, ownership and agent trust, each enforced by a contract.

Bounty targets:
- Privy ($5k)
- Mera Many Keys ($2.5k)
- Qwen ($5k credits, T4)
- Envio ($1k)
- Chainlink CRE ($3k)
- Kimi (credits)
- Cleanverse ($2k, T4; blocked on their onboarding)

## Phases (critical path marked ★)

1. ★ **Sponsor integrations**: built and tested locally (done 5–6 Oct; see docs/SPONSOR-GAP.md).
2. ★ **Zero-mock product path**: no fixture or mock reachable from the product.
3. ★ **Completeness audit**: every screen at 375 px and on desktop, console clean, committed as a walk spec.
4. **Zero-mock verification**: docs/TEST-PLAN-ZERO-MOCK.md executed item by item in Claude in Chrome, with the
   exceptions below.
5. **Quality gate**: typecheck, lint, unit, contract, e2e, slither, secret scan.
6. ★ **Judge package**: README, SUBMISSION.md, docs/DEPLOY-LATER.md, the demo script.
7. **Go-live (user)**: testnet funding, keys, deploy per DEPLOY-LATER.md, real Monad runs, the video.

## Tasks

| ID | Task | Acceptance | Verify | Status |
|---|---|---|---|---|
| T1 | Mera keys panel on /passkey | The SO-101 key is derived and verified in page and by the relay's check, and is the same with nothing stored | `pnpm test:localnet` | DONE |
| T2 | Privy gas sponsorship (flagged) and an in-page x402 purchase | Operator writes go through `sponsor: true`. The local sponsored journey takes a 0-MON operator through passkey, run, payout and purchase | `pnpm test:localnet:sponsored` | DONE (real Privy: BLOCKED, dashboard toggle) |
| T3 | Envio consumer | `/api/indexer` and the /leaderboard history read the real indexer | `pnpm test:localnet` (step 8) | DONE (hosting: BLOCKED, Envio token) |
| T4 | Qwen / Kimi buyer agent | It lists tasks, pays over x402 and verifies against SalesLog, driven by a real model | A real Qwen 3 on Ollama locally | DONE with a real local model; Model Studio and Moonshot are BLOCKED on keys |
| T5 | Chainlink CRE corpus audit | Compiles to WASM; the receiver is tested; the local e2e passes | `pnpm test:cre`, `forge test` | DONE (simulate: BLOCKED, `cre login`) |
| T6 | Cleanverse | Docs checked, contracts mapped, the blocker written down | docs/CLEANVERSE.md | BLOCKED (Cleanverse onboarding) |
| T7 | Remove the LLM fixture from the product path (G1) | `scripts/qwen-agent.mjs` has no fixture mode. A missing key gives an honest "not configured" exit. The test double lives under `test/` | grep; `pnpm test:agent` | DONE: the fixture mode is gone; the double lives in `test/llm-double.mjs`; a real Qwen 3 on Ollama bought and verified a corpus on 6 Oct (SalesLog entry 9) |
| T8 | Completeness walk | Every route at 375 px and 1280 px: 200 or the intended 404, no console errors, no horizontal overflow, an h1 present | `pnpm test:walk` | DONE: `pnpm test:walk`, 74/74 screens clean on 6 Oct. It found that "not configured" surfaces answered 503, which the browser logs as a console error; they now answer 200 with `configured: false` (/api/lab, /api/indexer) |
| T9 | Zero-mock test plan, executed | Every item PASS or UNTESTED with the dependency named; no FAIL left | docs/TEST-PLAN-ZERO-MOCK.md | DONE: 76 items, 63 PASS, 11 UNTESTED (dependency named), 2 PASS locally with the hosted half UNTESTED, 0 FAIL; 7 fixed at the root and re-run (docs/TEST-PLAN-ZERO-MOCK.md) |
| T10 | Quality gate | All suites green; slither reviewed; secret scan clean; no tracked secrets | commands listed in the doc | DONE: tsc clean; eslint 0 errors (36 warnings); unit 124/124 (1 skipped); forge 133/133; e2e:local 68/68; walk 74/74; slither triaged (docs/STATIC-ANALYSIS.md); secret scan clean; MIT LICENSE added |
| T11 | One-command local demo | `pnpm demo` starts the chain, app, facilitator and indexer, and stops them all on Ctrl-C | run it | DONE: `scripts/demo.mjs`; checked on 6 Oct (chain, x402, indexer and app up) |
| T12 | Judge package | README (demo, what's new, AI disclosure, why Monad, diagram, sponsors); SUBMISSION.md (portal fields per bounty, evidence, 3-minute script); docs/DEPLOY-LATER.md | read-through | DONE: README (one command, the window, attribution, AI disclosure, why Monad, diagram, sponsors), SUBMISSION.md (portal fields, evidence, 3-minute script, pitch outline), docs/DEPLOY-LATER.md |
| T13 | Go live on Monad testnet | Per DEPLOY-LATER.md | its smoke test | BLOCKED (user: "go" plus MON) |
| T14 | Demo video ≤ 3 min | The shot list in DEPLOY-LATER.md | — | BLOCKED (user) |
| T15 | Portal registration | Team and project registered | — | BLOCKED (user; it closed 6 Oct 23:59 UTC) |
| T16 | W1 Monad pipeline: live commit-state strip, two-timer receipts, txpool status, 300 ms / 600 ms copy | Testnet blocks every ~300 ms in four states within 3 s; times measured in the browser; local timings labelled; reducer unit tests; no "single-slot" copy (docs/ROADMAP-WIN.md) | `pnpm test:unit`, `pnpm test:e2e:local` | DONE: live on testnet at 297 ms a block, 577 ms to Finalized and 1.49 s to Verified, measured in the browser (`docs/screens/wave/01-landing-after-*.png`); a local paid run read executed 8 ms (from `eth_sendRawTransactionSync`) and final 72 s, because anvil's finalized tag trails by 59 blocks, and the card says so (`09-receipt-after-desktop.png`); unit 138/138; e2e:local 70/70 |
| T17 | W2 Dataset explorer with previews | Per-episode path and joint previews from real samples in one batched call; per-task summary; 390 px clean | `pnpm test:unit`, `pnpm test:e2e:local` | DONE: /corpus is a grid of episode cards: the payload's path from above with the goal ring and the carried stretch, the six joints, score, time, frames and lift, with replay and LeRobot links. 48 points a run, both ends kept, from one `/api/corpus/previews` call per page. A task's summary gives episodes, pass rate, median score, the Merkle root against CorpusManifest ("grown since the last commitment" is not shown as a mismatch) and agent sales (`docs/screens/wave/05*-after-*.png`); e2e:local 73/73 |
| T18 | W3 Buyer-agent transparency | Signed decision records per sale; forged ones rejected; a real agent run shows its trail on /agents; facilitator and port copy fixed | `pnpm test:unit`, `pnpm test:agent` | DONE: after each purchase the agent signs a decision record with the key that paid: model and endpoint, every tool call and what came back, its report, and its check against SalesLog. `/api/agent/decision` keeps it only when the signer is the sale's buyer, and never replaces it (409); an edited record gets 401. /agents shows each trail with the signature checked again in the page, and flags a hosted provider reached through an overridden endpoint. The facilitator and command copy now name what is really in use. `test/live-agent.mjs` passes for Qwen and Kimi (scripted double); unit 4/4 for the record format |
| T19 | W4 Operator onboarding | `/start` reads real state for each step; a fresh local wallet goes from step 1 to 5 in e2e | `pnpm test:e2e:local` | DONE: `/start` walks a newcomer through five steps, each read live: the wallet and gas (or a sponsor) from the session, the passkey from PasskeyRegistry through `/api/operator`, the station from this browser, and the first paid run from the ledger. Only the next step offers its action. The landing's one primary button and the Earn menu lead there. `test/live-localnet.mjs` takes a fresh wallet from 0/5 to 5/5 (`docs/screens/wave/11*-after-*.png`) |
| T20 | W5 Monad network panel and gas correctness | Live testnet reads (staking, tags, reserve, P-256, canonical contracts, facilitator); explicit gas limits under test; reserve guard tested; MonadVision links | `pnpm test:unit`, `pnpm test:e2e:local` | DONE: /network reads Monad testnet live from the page: `latest`, `safe` and `finalized` in one batch (N, N−1, N−2); staking `0x1000` (epoch 1382, the proposing validator, its stake and commission); a P-256 key made in the page and checked by `0x0100`, with a tampered copy refused; `dippedIntoReserve()` on `0x1001`; code at 10 canonical contracts and all 12 of Thenar's; `txpool_statusByAddress`. The server reads Monad's x402 facilitator and Sourcify. Every browser write is simulated first, refused if it reverts, and sent with the estimate plus a tenth as an explicit limit; a MON spend is checked against the reserve rule (unit-tested, including the delegated case). The receipt shows limit, used and charged. MonadVision links. Unit 158/158; e2e:local 78/78 |

## Gaps (from the code, 6 Oct)

Grep: `git grep -n -i -E "mock|stub|fake|dummy|placeholder|TODO|FIXME|hardcod|fixture"` over app, components, lib,
scripts, contracts/src, contracts/script, cre and indexer/src. 42 hits; every one was read.

| # | Evidence | Impact | Sev | Fix | Blocks |
|---|---|---|---|---|---|
| G1 | `scripts/qwen-agent.mjs:46-70` and `scripts/llm-fixture.mjs`: `AGENT_LLM_FIXTURE=1` swaps the model for scripted replies | A mock reachable from the product's agent | P1 | Move the double to `test/`; drop the mode; the agent takes a base URL and a key like any client — FIXED (`b107d85`) | T7 |
| G2 | Copy hits ("Nothing here is a fixture", "What stops fake runs?", `MockKeystoneForwarder`, "hardcoded" in comments) | None: these are copy, comments and Chainlink's own contract name | — | none | — |
| G3 | Copy naming Avalanche Fuji or Blitz (`lib/chain.ts`, `lib/registry.ts`, `/leaderboard`) | None: it is the archive of earlier deployments, by design | — | none | — |
| G4 | The real Privy sponsorship and Privy login can't run locally | The local build uses its own wallet and sponsor | P2 | Covered by the local stand-in with the same on-chain shape; real Privy is UNTESTED until testnet go | T13 |
| G5 | Paths that need a key: Model Studio, Moonshot, `ETHERSCAN_API_KEY` (call history), Envio hosting, `cre login` | Those surfaces must say "not configured" | P2 | Checked in T9 | T9 |
| G6 | No run on the Monad deployment yet | Judges look for live activity | P1 | User: testnet go and real runs | T13 |
| G7 | The local DB held runs from a reset chain | Stale episodes on new tasks | P2 | Pruned 6 Oct (backup kept) — FIXED | — |
| G8 | `components/station/arm-link.tsx`: the relay URL was hardcoded to :8787, and the CSP allowed only that port | With 8787 taken, no arm could connect | P1 | `?relay=` (loopback only, remembered), any loopback port in the CSP, the relay prints the URL — FIXED | F16 |
| G9 | `lib/index-config.ts`, `lib/monadscan.ts`: blamed a missing Etherscan key on a local chain | Misleading copy | P3 | Says Monadscan does not index a local chain — FIXED | P14 |
| G10 | `/api/lab`, `/api/indexer` answered 503 when not configured | A console error on load, including on production /leaderboard | P2 | 200 with `configured:false` — FIXED | P11 |
| G11 | `components/session.tsx`: balances after sign-in waited for a poll | A background tab showed 0 USDC | P3 | Invalidate every query once the faucet has sent — FIXED | F02 |
| G12 | The local DB held sales and token events from the reset chain | /api/agent/sales disagreed with SalesLog | P3 | Pruned (backup kept) — FIXED | A20 |
| G13 | `scripts/demo.mjs` left processes running when startup failed | Orphans on a shared machine | P2 | Stops whole process trees by PID on any failure — FIXED | T11 |
| G14 | No LICENSE file | Rules require an OSI licence | P1 | MIT, matching the contracts' SPDX headers — FIXED (the user can choose another) | T12 |
| G15 | Lint failed on build output and on React-compiler rules | No clean lint | P3 | Build dirs ignored; `useLeader` on `useSyncExternalStore`; per-frame ref writes annotated — FIXED | T10 |
| G16 | `.github/workflows/verify.yml`: CI had failed on every run since the move to pnpm. It ran `npm ci` with no package-lock, forge tests without forge-std (`contracts/lib` is ignored), and the live job before installing | No CI signal at all | P2 | pnpm; forge-std pinned and installed; a `localnet` job that deploys to anvil, builds the app and runs the E2E against it; the production check on the schedule; the qa-* suite on demand until the testnet go — FIXED | — |
| G17 | `contracts/.gas-snapshot` dated from 12 Sep (the Avalanche build) | The snapshot check could never pass | P3 | Re-snapshotted on purpose; `forge snapshot --check` passes — FIXED | — |
| G18 | `scripts/localnet.mjs`: forge's deploy ran under spawnSync while the same process read anvil's stdout | On Linux every fresh local chain deadlocked mid-deploy (found by the new CI job) | P2 | Deploy and build run asynchronously — FIXED (`bbabfb4`); CI's localnet job deploys, builds and passes the E2E (56/56 on a fresh chain) | — |

## Completion

The 100% checklist has 30 items in six groups.

| Group | Items | Done at start of 6 Oct | Done now |
|---|---|---|---|
| Features and flows: sign-in, passkey, run (keyboard, leader, Quest), post, corpus subscription, x402 purchase, agent, certificate, licence, foundry, referrals, dividends | 12 | 12 | 12 |
| Data and auth: real DB, passkey gate, sponsored gas | 3 | 2 | 3 |
| Integrations and bounties: Privy, Mera, Qwen, Kimi, Envio, CRE, Cleanverse | 7 | 4 | 6 (Cleanverse blocked on Cleanverse) |
| Tests and quality: unit, contract, e2e, live suites, walk spec, zero-mock plan (lint, typecheck, slither and the secret scan fold in here) | 6 | 4 | 6 |
| Deploy and submission: runbook, README with SUBMISSION and demo script | 2* | 0 | 2 |

\* Two of the six submission items can be finished in code: the runbook, and the README with SUBMISSION. The other four
(testnet live, real runs, video, registration) are the user's, and are counted separately below.

- **Initial (6 Oct, before this plan): 22 / 30 = 73%.**
- **Final: 29 / 30 = 97%** of what can be done without the user. The one item missing is Cleanverse, blocked on
  Cleanverse's onboarding.
- **Overall, counting the user's go-live items (testnet live, real Monad runs, the video, the portal profile):**
  29 / 34 = **85%**.
