# Thenar × Metropolis sponsor bounties: gap check

Checked 5 Oct 2026 against `/Volumes/Extreme SSD/Projects/METROPOLIS-SPONSORS.md` (sponsor research of the same day).
Bounty scoring is **40% meeting the bounty's stated requirements**, 30% technical, 20% Monad integration and 10%
innovation, so the "gap" column is measured against each bounty's own wording.

## Submission branch

`main` on `nickthelegend/thenar-monad` (the `quest-web` line, deployed at app.thenar.io and thenar.io) is the submission.

- **`monad`** (`Projects/thenar-monad-migration`, last commit 30 Sep) has **no commits that are not already in `main`**.
  Nothing to merge; that checkout is simply behind.
- **`quest-teleop`** (`Projects/thenar-monad`, 23 Sep) is the first, standalone Vite Quest prototype (`apps/quest`).
  - Its committed work is on `origin/quest-teleop`.
  - Its 37 uncommitted files (scan, teach, corpus and station pages for the standalone app) are now committed on `origin/quest-teleop-wip` so nothing is lost.
  - Every one of those features was rebuilt inside the Next app on `main`: the station, Quest 3S placement, `/post` table scan, teach and repeat, and the corpus. So the standalone app is not merged into `main`.

## Track

Thenar is entered in **Track 4: Trust, Identity & AI Infrastructure**, its natural fit:
- passkey identity verified on chain through the P-256 precompile;
- provenance of every run;
- data owned by the people who recorded it;
- agents that pay for and verify what they buy.

T4 locks **Qwen 3.8 Max** and **Cleanverse**. Every other relevant bounty is "All tracks".

**Portfolio note.** Xorv is also T4, and one track per project means the two compete for the same three T4 prizes.
- Thenar's fallback would be **T2 (Consumer Products & Payments)**: people paid per run. But Mempire is T2.
- KOMA is T3. Thenar has no T1 fit.
- Recommendation: keep Thenar in T4 (it loses Qwen otherwise), and move Xorv if it fits another track.

## Bounties

Status: ✅ meets the stated requirement · 🟡 partly · ❌ not built · ⛔ blocked on something only the user can do.

| Bounty | Prize | Lock | Thenar today | Gap against the stated requirement | Effort | Value | Plan |
|---|---|---|---|---|---|---|---|
| **Privy — beyond authentication** | $5k | All | ✅ Login + embedded wallet signs every run, passkey registration and task post. ✅ **Server wallet + policy engine**: the lab budget can only fund Thenar bounties, and the refusal is shown live on /lab. | "Multiple Privy features" earns a bonus. Gas sponsorship and Privy's x402 client are unused, and operators must find MON for gas before their first paid run. | M | **High** | Build `sponsor: true` for operator writes, behind a flag (needs gas sponsorship enabled for Monad Testnet in the Privy dashboard). Build an in-browser x402 corpus purchase with `useX402Fetch`. |
| **Mera: One Passkey, Many Keys** | $2.5k | All | 🟡 A PRF namespace does non-account work: the salt "so101-commands" → HKDF → an Ed25519 key that the arm relay requires on every command. Nothing derived is stored, and the session zeroes it. | Judges need a **live** demo and a **cross-device test**. Today the key is only exercised with the physical arm and relay. No screen shows it, so there's nothing to compare across devices. | S | **High** | Add a "Keys from this passkey" panel on /passkey: namespaces listed, robot key fingerprint shown, a signed command verified in the page, the same fingerprint on any device. |
| **Envio — Best use** | $1k + hosting | All | 🟡 HyperIndex V3 indexer (`indexer/`) over Axon, SalesLog, CorpusShares, CorpusAccess and PasskeyRegistry. Derived and aggregate entities (`Stats`, `DailyStat`, `DailyOperator`, `TaskContributor`, `@derivedFrom` relations). Runs against the local chain. | "Real on-chain data driving a core feature" plus "a consumer": **no screen reads the indexer**. Not deployed against Monad testnet (needs an Envio token or Envio Cloud). | S–M | Medium | Build an API route and a panel that read the indexer's aggregates. ⛔ Deploy to Envio Cloud or self-host with `ENVIO_API_TOKEN`. |
| **Alibaba Qwen 3.8 Max** | $5k credits (top 3 T4) | T4 | ✅ `scripts/qwen-agent.mjs`: Qwen picks a corpus with tool calls, pays 0.01 USDC over x402 on Monad, and verifies the bytes against SalesLog on chain. Verified end to end on the local chain with qwen3:4b. | ⛔ Needs a DashScope / Model Studio key to run on `qwen3.8-max`, and the agent wallet needs Monad testnet USDC. Credits go only to the top 3 T4 projects. | S | Medium (tied to placing) | User: key + 1 USDC to `0x9a6C…63aA`. |
| **Kimi** | $3k credits (10 teams) | All | ❌ | The same agent loop can run on Kimi; Kimi must be load-bearing, not a chat widget. | S | Low–Medium | Add Kimi as a model provider for the buyer agent. ⛔ Needs `MOONSHOT_API_KEY`. |
| **Chainlink CRE** | $3k | All | ❌ | Needs a CRE workflow used as an **orchestration layer**, with a correct on-chain receiver. Simulation is accepted. | M | Medium | A cron workflow that reads `/api/task/{id}/manifest` with consensus and writes the corpus Merkle root to a `ReceiverTemplate` contract on monad-testnet. ⛔ `cre login` (user account) and MON for the receiver deploy. |
| **Cleanverse CVI/CVA** | $2k cash | T4 | ❌ | Requires gating CVA movement behind CVI. Docs are invite-gated. | M + access | Low–Medium | ⛔ Ask Cleanverse for docs first (Telegram / support@cleanverse.com). A natural fit is CorpusShares or dividend transfers gated by A-Pass as well as the passkey. |
| **Alchemy** | $1k credits | All | ❌ | "Meaningful" needs more than an RPC URL (Gas Manager, `monadLogs`). | S | Low | ⛔ Needs an Alchemy key. Overlaps Privy sponsorship, so skip unless the key appears. |
| **Mera UX** | $2.5k | All | ❌ by design | Requires Mera as the *entire* account layer; Thenar's account layer is Privy. | L | Low | Skip: it conflicts with the Privy bounty. |
| **Dynamic** | $5k | All | ❌ | Another account layer beside Privy. | M | Low | Skip. |
| **Aurora Intents** | $5k | All | ❌ | Mainnet only; needs real funds. | S–M | Low | Skip. |
| **Nansen** | $5k | All | ❌ | Mainnet data only; nothing in Thenar consumes wallet intelligence. | M | Low | Skip. |
| **Perpl API** | $5k | All | ❌ | A trading bot; no product fit. | — | — | Skip. |
| **Agora AUSD** | $10k ×2 | T1 / T2 | ❌ | Mobile trading or cross-border apps in other tracks. | — | — | Not eligible in T4. |
| **Community Team** | $5k | All | ? | Depends on registering under a Metropolis community supporter. | none | ? | User: check the portal profile field. |

## Shipped from this list

See the commits after this file; each section of the gap table above is updated as items land.

## Left for the user

1. **Register the team and project on the portal before 6 Oct 23:59 UTC** (registration and team formation close then, per a participant's capture).
2. Privy dashboard:
   - enable **gas sponsorship for Monad Testnet** (testnet subsidy: email monad@privy.io);
   - then set `NEXT_PUBLIC_PRIVY_GAS_SPONSORSHIP=1` on Vercel.
3. Envio: create an account and an API token (or deploy `indexer/` to Envio Cloud) so the indexer runs against Monad testnet.
4. A DashScope key (Qwen 3.8 Max), and optionally a Moonshot key (Kimi).
5. Monad testnet USDC (1 USDC) for the demo agent `0x9a6C46E7115CfB5FF5a2265E5a1B955038cb63aA`, and some for your own Privy wallet if you demo the in-browser purchase.
6. `cre login` if the CRE workflow is to be simulated with `--broadcast`, plus MON for one receiver deploy from a key that is not the protocol deployer.
7. Real runs on Monad from your own Privy login (the deployment had none on 2 Oct): judges look for live activity.
