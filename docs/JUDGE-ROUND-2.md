# Judge round 2

An independent subagent, given only the live URL, the public repo, `docs/PORTAL-COPY.md` and the official rubric, judged Thenar on 13 Oct 2026 (about 20:00 IST). Its verdict, verbatim:

## Round 1

# Thenar: judge's verdict (Monad Metropolis, Track 4)

I tested the live app signed out at 1440x900 and 390x844 with one headless browser, which I closed at the end. I checked the claims read-only against the Monad testnet RPC and Sourcify. Screenshots are in `/private/tmp/claude-501/judge/`.

## Scores

| Criterion | Score | Reason |
|---|---|---|
| Product quality | 7 | Polished dark UI and a working 3D SO-101 station. Real usage is one paid run by one operator, and the paid run in the portal copy 404s. |
| Technical excellence | 8 | 13 contracts, all exact match on Sourcify. The run page re-hashes the samples in the browser against the on-chain value. x402, a P-256 passkey and a CRE receiver are wired up. |
| Monad integration | 8 | Live block pipeline, finality timers, reserve and staking precompile reads, and gas limits set with Monad's billing on the limit in mind. |
| Track fit (Trust, Identity, AI) | 6 | Passkey identity and agents that buy data fit. The "AI" side is a single agent purchase, with no signed reasons published. |
| Innovation | 7 | Robot demonstrations as a paid, auditable corpus is fresh. Each piece on its own is a known pattern. |
| **Main track (20% each)** | **7.2** | |

| Bounty | Req (40) | Tech (30) | Monad (20) | Innov (10) | **Weighted** | Reason |
|---|---|---|---|---|---|---|
| Privy | 6 | 6 | 7 | 6 | **6.2** | The bounty tx succeeded on AxonProtocolV2. The claim that a policy-bound server wallet refused a forbidden send has no evidence I could check. Gas sponsorship "needs the dashboard toggle", so it isn't on. |
| Mera | 7 | 8 | 8 | 8 | **7.6** | The passkey tx to PasskeyRegistry succeeded. Deriving the arm key through PRF → HKDF is a real step past login. I couldn't test /passkey signed out. |
| Chainlink CRE | 5 | 7 | 6 | 7 | **6.0** | The audit tx succeeded and logged from CorpusAudit. The repo's own docs say it came from `cre workflow simulate --broadcast`, not a deployed DON, so "a DON audits" overstates it. |
| Envio | 4 | 6 | 5 | 4 | **4.8** | Production /leaderboard says "no indexer is configured" and counts from the app's own ledger. The HyperIndex exists only in the repo. |
| Qwen | 3 | 6 | 5 | 6 | **4.6** | The portal copy itself says "Model Studio key pending". The only Qwen run was a local Ollama model. Live /agents shows no agent's reasons published. |

## Claims I couldn't verify (or that don't hold)

- **The paid run's /run link is broken.** `/run/0x0ad7cfea…` (the tx hash given as the best paid run) returns 404. The working run page uses the trajectory hash `0x2cbb297c…`, which is linked only from /corpus.
- **"One transaction records it and pays them, issuing their share": partly false.**
  - The run tx `0x0ad7…` logs only from AxonProtocolV2.
  - The shares were issued in a separate tx (`0xccd1…`), four blocks later, from a different sender.
- **x402 sale `0xad0e…`: verified, but it's only the payment.** It is a USDC `transferWithAuthorization` of 0.01 USDC to the deployer, and it does not touch SalesLog. The UI shows a separate SalesLog entry #1, whose tx I didn't trace.
- **"Executed in 702 ms, final in 1,310 ms": unverified.** Block timestamps are whole seconds. The app's own median (655 ms → 1.3 s) is consistent with it.
- **"Checked on chain by Monad's P-256 precompile (`0x0100`)": not traced.** The tx succeeded, but I didn't confirm the precompile call.
- **Privy `policy_violation` refusal: unverifiable.** It is off-chain.
- **"A DON audits": overstated.** It was a simulated broadcast, per the repo's own docs.
- **Envio HyperIndex on Monad and "tests 9/9": not live.** I didn't run the tests.
- **Qwen "decides through tool calls": not shown on testnet.**
- **Verified as claimed:** all 13 contracts are exact match on Sourcify, the five headline addresses have code, and all three "best" txs plus the passkey and Privy txs have status 1, in the order run → sale → audit.

## Broken or confusing steps

- **Desktop and mobile:** the /run page for the portal's paid run returns 404.
- **/station/0, both viewports:** the page never goes network-idle (30 s timeout). One request returned 429.
- **/station/0, desktop:**
  - The title says "Put the toothpaste into the upper drawer" but the goal says "set it down inside the ring".
  - During practice the header shows "Your runs 0 / 5" while the side panel shows "5 of 6 runs left".
  - After "Practise first", it's unclear whether the run is practice or paid.
- **/run/0x2cbb…, desktop:** a payout was made for a run labelled "dropped — let go 33 mm above the table" with "Grasp 0.0s", yet it scored 89.98. That undercuts the "verifier" trust story.
- **/leaderboard, both viewports:** the page says "no indexer is configured", which is exactly what an Envio judge will read.
- **/passkey and /start, both viewports:** a signed-out visitor sees nothing past "Sign in first".
- **/agents, desktop:** typo "onMonad".

## Dense or ugly screens

- **/network, mobile (4,530 px tall):** the transaction-timeline axis labels overlap ("10 s100 s") and the row labels are truncated ("submit trajec…").
- **Home, mobile (5,564 px tall):** a very long scroll.
- **/run, both viewports:** a large amount of monospace explanation text.
- **/corpus, desktop:** a 13-chip task filter bar over a single episode looks empty.
- The station itself is clean and looks good.

## First 60 seconds

It's a confident, good-looking landing page: "Teach a robot. Get paid on Monad.", with a live Monad block pipeline right there. "Start earning" leads to a five-step checklist I can't get past without signing in. The station is the best part: a real 3D SO-101 that I could drive with the keyboard, no wallet needed. Then I look for evidence of a market and find one episode, one operator, one agent purchase, and a 404 on the flagship run link.

## The reason I'd vote no

It's a breadth-first build that claims five bounties, and three of them (CRE, Envio, Qwen) are simulated, run only locally, or explicitly pending. Meanwhile the core trust promise, "a verifier scores the run and pays the operator", is shown with a single paid run the app itself labels a drop. For a track about trust, that matters more than the polish does.
