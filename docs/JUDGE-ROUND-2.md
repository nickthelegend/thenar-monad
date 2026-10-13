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

## Fixes between the rounds

- `/run/<tx hash>` now redirects to the run it paid for, so the portal's paid-run link works.
- Claims corrected: the share is issued in a second transaction; the CRE audit came from `simulate --broadcast`; Envio is not hosted; Qwen and Kimi are not claimed; Privy's refusal is quoted verbatim.
- `/agents` typo, chart labels at 390 px, and the station's run counters.

## Round 2 (a fresh judge, same prompt)

I checked all 9 pages at both viewports with no console errors, no HTTP errors and no horizontal scroll. As a signed-out visitor I got into a practice run. Every on-chain claim I could check holds up, but the live usage behind it is a single run, a single sale and a single audit, all from today.

## Scores

**Main track: Trust, Identity & AI Infrastructure**

| Criterion (20% each) | Score | Reason |
|---|---|---|
| Product quality | 7 | Polished and consistent. The station works without a wallet, but the live data is one run, one operator and one sale. |
| Technical excellence | 8 | 13 contracts all match on Sourcify, a real x402 endpoint (unpaid request gets 402 with a correct `payment-required`), the run's hash is re-derived in the browser, and it exports LeRobot files. |
| Monad integration | 8 | Uses the P-256 precompile live, reads the staking and reserve precompiles, shows block and finality timing, and lists Monad's x402 facilitator. |
| Track fit | 7 | Passkey identity and AI agents that check data on chain fit the track, but the core product is a robotics data market. |
| Innovation | 7 | Paying for robot demonstrations, with corpus shares and agent buyers that can verify the file, is fresh. Most of the parts already exist. |
| **Weighted** | **7.4 / 10** | |

**Bounties (requirement 40 / technical 30 / Monad 20 / innovation 10)**

| Bounty | Req | Tech | Monad | Innov | Weighted | Reason |
|---|---|---|---|---|---|---|
| Privy | 6 | 7 | 7 | 6 | **6.5** | The policy wallet's 0.008 MON bounty tx is real (`0xed2f…` → AxonProtocolV2). The policy refusal is off chain and only quoted. I couldn't test the embedded wallets. |
| Mera | 6 | 8 | 9 | 8 | **7.4** | The PasskeyRegistry tx succeeded and /network checks P-256 through 0x0100 live. The "/passkey derives the arm key live" claim shows nothing until you sign in. |
| Chainlink CRE | 5 | 7 | 7 | 7 | **6.2** | The tx emitted an event from CorpusAudit, via forwarder `0xb9f7…` (not checked further). It came from `simulate --broadcast`, not a deployed DON. |
| Envio | 3 | 6 | 4 | 5 | **4.3** | The indexer isn't hosted. The live /leaderboard says "no indexer is configured", so Envio isn't in the live product. |

## Claims I couldn't verify

**Verified on chain:**
- The 13 contracts (12 in `lib/deployment.ts` plus CorpusAudit) all have code and are `exact_match` on Sourcify.
- Paid run `0x0ad7…` succeeded and emitted an event naming run `0x2cbb…`.
- The CorpusShares tx `0xccd1…` landed 4 blocks later, which matches "a moment later".
- The x402 sale `0xad0e…` is a USDC `transferWithAuthorization`. A SalesLog entry follows one block later (`0x39ff…`).
- The passkey and Privy txs both succeeded.

**Could not verify:**
- The "702 ms executed / 1,310 ms final" timing. Only the median the app shows (655 ms → 1.3 s) was visible.
- Privy's `policy_violation` refusal, which is off chain and only quoted.
- That the CRE workflow does consensus over episodes and an EVM read. I only confirmed the CorpusAudit event fired, not the workflow logic.
- Envio tests "9/9" and HyperSync reading Monad (I didn't run anything locally).
- That the paid run actually moved MON to the operator. The tx carries 0 value and I didn't trace internal transfers.

**Contradicted by the live app:**
- The portal says agents "sign their reasons". /agents says "No agent has published the reasons for a purchase yet", and the agent ranking shows Signed: none.
- `SUBMISSION.md` line 113 still says `simulate --broadcast` "needs `cre login`", which contradicts the portal's "runs today".

## Broken or confusing steps

- **/run/0x2cbb… (both viewports):** the run is scored 89.98 and paid, yet the "Where it went wrong" box says the payload was dropped 33 mm above the table. A judge will ask why a drop gets paid. The certificate also shows "not minted".
- **/station/0 (mobile):** the controls panel is the W/A/S/D/Space keyboard list on a phone. Drag is mentioned in one line only, and the 3D view is small.
- **/station/0 (desktop) practice run:** the arm responds to the keys, but after about 15 s of input the "Live placement" readout stayed at +325.6 mm. I never picked anything up, so the keyboard controls take a while to learn.
- **/ (both viewports):** a full-page screenshot without scrolling showed only black below the hero, so content appears only as you scroll. Real users who scroll are fine.
- **/ :** "13 funded tasks" sits above an "Open tasks" list with 5 cards.
- **/leaderboard:** "no indexer is configured" undercuts the Envio bounty claim on the page judges will open.
- **/passkey (signed out):** only a Sign in button, no demo of the key derivation.
- **Page titles:** /start and /network use the company-site title "ThenarLabs — we build physical AI".
- **/network:** the Thenar contracts table lists 12 contracts and leaves out CorpusAudit, the 13th.

## Dense or ugly screens

- **/network:** very long (3,555 px on desktop) and wall-to-wall tables, with a "Shared contracts" list (Permit2, CreateX…) the project marks as not needed.
- **/run desktop:** strong overall, but lots of small grey monospace text, plus a large empty tool-path panel.
- **/agents:** fine, but the "Run the buyer" section is CLI commands only.

The visual design is otherwise clean and consistent.

## First 60 seconds

A confident landing page with a live Monad block strip, real funded tasks, and a station that loads a convincing SO-101 scene with no wallet. The run page is the best screen: it re-checks the hash in the browser, splits the run into phases, replays it, offers a MuJoCo physics check and a LeRobot download. It feels like a real product, not a pitch deck.

## The reason I'd vote no

Behind the polish there is almost no use of the market. Corpus, leaderboard and agents each hold exactly one item: one paid run of 0.0018 MON, one operator and one 0.01 USDC sale, all made on 13 Oct, the deadline day. The single showcase run is labelled "dropped" yet was paid. Two of the four bounties lean on "pending": the CRE audit came from a local simulation, and the Envio indexer isn't in the live app at all. It is a well-built demo of one end-to-end run, not yet evidence that the trust loop works with real participants.

Screenshots and `report.json` are in `/private/tmp/claude-501/judge2/`.
