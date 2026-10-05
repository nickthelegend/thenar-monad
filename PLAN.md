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
| T7 | Remove the LLM fixture from the product path (G1) | `scripts/qwen-agent.mjs` has no fixture mode. A missing key gives an honest "not configured" exit. The test double lives under `test/` | grep; `pnpm test:agent` | NOT STARTED |
| T8 | Completeness walk | Every route at 375 px and 1280 px: 200 or the intended 404, no console errors, no horizontal overflow, an h1 present | `pnpm test:walk` | NOT STARTED |
| T9 | Zero-mock test plan, executed | Every item PASS or UNTESTED with the dependency named; no FAIL left | docs/TEST-PLAN-ZERO-MOCK.md | NOT STARTED |
| T10 | Quality gate | All suites green; slither reviewed; secret scan clean; no tracked secrets | commands listed in the doc | NOT STARTED |
| T11 | One-command local demo | `pnpm demo` starts the chain, app, facilitator and indexer, and stops them all on Ctrl-C | run it | NOT STARTED |
| T12 | Judge package | README (demo, what's new, AI disclosure, why Monad, diagram, sponsors); SUBMISSION.md (portal fields per bounty, evidence, 3-minute script); docs/DEPLOY-LATER.md | read-through | NOT STARTED |
| T13 | Go live on Monad testnet | Per DEPLOY-LATER.md | its smoke test | BLOCKED (user: "go" plus MON) |
| T14 | Demo video ≤ 3 min | The shot list in DEPLOY-LATER.md | — | BLOCKED (user) |
| T15 | Portal registration | Team and project registered | — | BLOCKED (user; it closed 6 Oct 23:59 UTC) |

## Gaps (from the code, 6 Oct)

Grep: `git grep -n -i -E "mock|stub|fake|dummy|placeholder|TODO|FIXME|hardcod|fixture"` over app, components, lib,
scripts, contracts/src, contracts/script, cre and indexer/src. 42 hits; every one was read.

| # | Evidence | Impact | Sev | Fix | Blocks |
|---|---|---|---|---|---|
| G1 | `scripts/qwen-agent.mjs:46-70` and `scripts/llm-fixture.mjs`: `AGENT_LLM_FIXTURE=1` swaps the model for scripted replies | A mock reachable from the product's agent | P1 | Move the double to `test/`; drop the mode; the agent takes a base URL and a key like any client | T7 |
| G2 | Copy hits ("Nothing here is a fixture", "What stops fake runs?", `MockKeystoneForwarder`, "hardcoded" in comments) | None: these are copy, comments and Chainlink's own contract name | — | none | — |
| G3 | Copy naming Avalanche Fuji or Blitz (`lib/chain.ts`, `lib/registry.ts`, `/leaderboard`) | None: it is the archive of earlier deployments, by design | — | none | — |
| G4 | The real Privy sponsorship and Privy login can't run locally | The local build uses its own wallet and sponsor | P2 | Covered by the local stand-in with the same on-chain shape; real Privy is UNTESTED until testnet go | T13 |
| G5 | Paths that need a key: Model Studio, Moonshot, `ETHERSCAN_API_KEY` (call history), Envio hosting, `cre login` | Those surfaces must say "not configured" | P2 | Checked in T9 | T9 |
| G6 | No run on the Monad deployment yet | Judges look for live activity | P1 | User: testnet go and real runs | T13 |
| G7 | The local DB held runs from a reset chain | Stale episodes on new tasks | P2 | Pruned 6 Oct (backup kept) | — |

## Completion

The 100% checklist has 30 items in six groups.

| Group | Items | Done at start of 6 Oct | Done now |
|---|---|---|---|
| Features and flows: sign-in, passkey, run (keyboard, leader, Quest), post, corpus subscription, x402 purchase, agent, certificate, licence, foundry, referrals, dividends | 12 | 12 | _pending_ |
| Data and auth: real DB, passkey gate, sponsored gas | 3 | 2 | _pending_ |
| Integrations and bounties: Privy, Mera, Qwen, Kimi, Envio, CRE, Cleanverse | 7 | 4 | _pending_ |
| Tests and quality: unit, contract, e2e, live suites, walk spec, zero-mock plan (lint, typecheck, slither and the secret scan fold in here) | 6 | 4 | _pending_ |
| Deploy and submission: runbook, README with SUBMISSION and demo script | 2* | 0 | _pending_ |

\* Two of the six submission items can be finished in code: the runbook, and the README with SUBMISSION. The other four
(testnet live, real runs, video, registration) are the user's, and are counted separately below.

- **Initial (6 Oct, before this plan): 22 / 30 = 73%.**
- **Final:** _filled in when T7–T12 are done._
