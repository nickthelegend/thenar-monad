# Portal copy (hackathon.monad.xyz)

Paste-ready. Every claim has a link or a transaction in [SUBMISSION.md](../SUBMISSION.md) and
[docs/SPONSOR-COVERAGE.md](SPONSOR-COVERAGE.md).

**Project name:** Thenar

**Demo video:** `docs/demo/thenar-metropolis.mp4` (2:51; upload it with `thenar-metropolis.srt` as English captions). It contains no GitHub URL, because the portal carries the repo link.

**Tagline (≤ 80 chars):** Teach a robot, get paid on Monad, own the data, sell it to AI agents.

**Short description (≤ 280 chars):**
People drive a robot arm in the browser, on a Quest 3S or with a leader arm. A verifier scores the run; one Monad
transaction records it and pays them, and their share of the corpus follows. AI agents buy the data over x402 and check it
on chain.

**Full description:**
- **Problem:** robots learn from human demonstrations, and there are too few of them. The people who could record them
  are neither paid nor credited, and buyers can't check what they are buying.
- **Solution:** Thenar is a market for robot demonstrations.
  - A funder escrows MON for a task. An operator drives an SO-101 arm (browser, Meta Quest 3S on their own table, or
    a USB leader arm).
  - A verifier re-scores the recording from its samples and signs it. One transaction records the trajectory's hash
    and pays the operator. A second, a moment later, issues their share of the corpus in CorpusShares.
  - Operators are people: a passkey (Mera), checked on chain by Monad's P-256 precompile.
  - AI agents buy a task's corpus over x402 (one cent of USDC), and check the file against SalesLog. The language-model agent can also sign its reasons for a purchase; the live sale
    was made by the plain buyer, so none is published yet.
  - A Chainlink CRE workflow audits the corpus served against its on-chain commitment. It runs today through
    `cre workflow simulate --broadcast`, which writes the real report to CorpusAudit; a hosted DON needs CRE deploy access.
- **Why Monad:**
  - 300 ms blocks, final in about 600 ms, so the payout lands while the operator is still looking at the station.
    The app shows the live block pipeline and both timers.
  - The P-256 precompile (`0x0100`) makes passkeys native.
  - Gas billed on the limit, so writes are simulated and sent with tight explicit limits.
  - Staking and reserve precompiles read live on /network.
- **What's live:** https://app.thenar.io on Monad testnet. A paid run on 13 Oct executed in 702 ms and was final in
  1,310 ms; it was followed by an x402 sale and a CRE audit. All 13 contracts are verified on Sourcify.

**Track:** Track 4: Trust, Identity & AI Infrastructure.

**Bounties claimed** (portal fields as in SUBMISSION.md's "Per bounty" section):

| Bounty | One-line answer | Evidence |
|---|---|---|
| Privy (beyond authentication) | Embedded wallets for operators; a lab budget in a policy-bound server wallet that can only fund Thenar | Bounty tx `0xdfb15157…8d7c5` from the policy wallet. The same wallet's forbidden send was answered by Privy (off chain): `400 {"error":"RPC request denied due to policy violation","code":"policy_violation"}`. Reproduce: `scripts/privy-lab.mjs` |
| Mera (One Passkey, Many Keys) | One passkey is the operator's on-chain identity and, through PRF → HKDF, the Ed25519 key their robot arm obeys | Passkey tx `0x3d763ead…b408fe`; /passkey derives and verifies the arm key live |
| Chainlink CRE | A CRE workflow (consensus over the episodes, an EVM read of CorpusManifest) writes a verdict per task to CorpusAudit | Audit tx `0x2ac5873d…24a84` → CorpusAudit `0xC913…86Dd`, from `cre workflow simulate --broadcast`. A hosted DON deploy is pending CRE access |
| Envio | HyperIndex over five Thenar contracts, with an Agent entity for the ranking on /leaderboard | `indexer/`, tests 9/9; HyperSync on Monad testnet reads with the token. Hosting on Envio Cloud is pending, so the live /leaderboard says so and counts from the app's ledger |

**Not claimed:** Qwen and Kimi. The agent supports both, and has run on a real Qwen 3 locally, but there is no hosted
model key, so the live app shows no model-driven purchase.

**Links:**
- Repo: https://github.com/nickthelegend/thenar-monad
- Live: https://app.thenar.io (company: https://thenar.io)
- Contracts (MonadVision):
  - [AxonProtocolV2](https://testnet.monadvision.com/address/0x17731731c6652770CE630e29b62791DC2CED5f38)
  - [PasskeyRegistry](https://testnet.monadvision.com/address/0xE344179839c9cA2101Ad930BD49268103F3945a9)
  - [CorpusShares](https://testnet.monadvision.com/address/0xAE1F24fE0F759BEF941eA2Df2dcb23dc3e130fc7)
  - [SalesLog](https://testnet.monadvision.com/address/0xf34A45021B8006C141E8b9CFe4B8a509a9b1fE27)
  - [CorpusAudit](https://testnet.monadvision.com/address/0xC913C03FbE2F8901296FC69dF3b136f9889b86Dd)
  - the rest in `lib/deployment.ts`
- The 3 best transactions:
  1. Paid run: https://testnet.monadvision.com/tx/0x0ad7cfea8d51788264edad412d2b7296bdf66f5fbd854f59b9804d426d9a4c86
     (the run itself: https://app.thenar.io/run/0x2cbb297cc1a7409ad8b6bdf356d3e1bf56799949bf8c613d7af273a24f927ad8)
  2. x402 corpus sale: https://testnet.monadvision.com/tx/0xad0e30826dbdf8b249c5833f218e697ea5257676ddc5c96f925639a775c216b5
  3. Chainlink CRE audit: https://testnet.monadvision.com/tx/0x2ac5873da169f1e6915acb64d116ab1e1fa68a98d57935183e72e07923724a84

**Team and attribution:** ThenarLabs (nickthelegend). Thenar began at Monad Blitz Hyderabad V3 (3rd place). External
code and assets are listed in the README's Attribution section.

**AI tools:** the code was written with Claude Code (Anthropic), as disclosed in the README. The hero film was made with
Google Veo; the glass renders with ChatGPT.
