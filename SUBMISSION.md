# Metropolis submission: Thenar

**Track 4 — Trust, Identity & AI Infrastructure.** Build window 1 September to
13 October 2026; judging 14–27 October.

| | |
|---|---|
| **Live** | https://app.thenar.io (Monad testnet). ThenarLabs, the company, and its hardware: https://thenar.io |
| **Repo** | https://github.com/nickthelegend/thenar-monad (MIT) |
| **Run it locally** | `pnpm install && pnpm demo`, then http://localhost:3336/localnet ([README](README.md#try-it-in-one-command)) |
| **Judge logins** | No test account is needed. Sign in on app.thenar.io with any email: Privy makes a wallet on Monad testnet. Locally, press *Sign in with the local wallet* on /localnet, and the faucet funds it. |
| **Contracts** | [lib/deployment.ts](lib/deployment.ts); AxonProtocolV2 at `0x17731731c6652770CE630e29b62791DC2CED5f38` on chain 10143 |

**Drive a task three ways:** from the keyboard, from a real SO-101 leader arm
plugged in over USB, or from a Meta Quest 3S with the arm standing on your own
table in mixed reality (`app.thenar.io/q/0` in the headset's browser). Every
way records the same trajectory, scored and paid the same way.

## The one-line pitch

Robot training data where the people who recorded it provably own it, and the
agents that buy it provably paid for exactly what they got — on Monad, where a
run is paid, a share is issued and a sale is logged before the page has
finished saying so.

## Why it is Track 4

The track asks for identity, provenance, data ownership and agent trust. Thenar
is all four, each enforced by a contract rather than a promise:

| The track asks about | Thenar's answer | Enforced by |
| --- | --- | --- |
| **Identity** | A paid run needs a person behind the address: a passkey (Face ID, fingerprint, PIN) made with Mera, whose P-256 key is registered in PasskeyRegistry and whose signature Monad checks with the P-256 precompile before the address joins the share whitelist. | `/api/operator`; `PasskeyRegistry` through Monad's P-256 precompile; `CorpusShares` whitelist |
| **Provenance** | Every accepted run's hash is on chain with its score, contributor and block; each task's corpus has a committed Merkle root. | `AxonProtocolV2`, `CorpusManifest` |
| **Data ownership** | The corpus is shares that only verified humans can hold, issued per run by score, with dividends from sales snapshotted at a record date set in advance. | `CorpusShares` |
| **Agent trust** | An agent pays per pull over x402 in USDC on Monad; every sale is logged with the sha256 of the bytes served, so the agent can check its copy against the chain. | `/api/agent/corpus`, `SalesLog` |

## Why Monad

See the table in the [README](README.md#what-monad-does-here-that-another-chain-would-not).
In short: 300 ms blocks that are final about 600 ms after they are proposed make the
payout, the share and the sales record visible in the same interaction; parallel execution is why the slot counter is
sharded; the P-256 precompile is what lets a passkey sign a run; and Monad's
100-block log cap is why every history this app shows is read from storage.

## What existed before, and what was built for Metropolis

Every commit is inside the window (1 Sep – 13 Oct 2026):

1. **Monad Blitz Hyderabad V3, 5–6 Sep:** the first 56 commits; the project took 3rd place. Pre-existing for
   Metropolis purposes: `AxonProtocol` v1, the station, passkeys through the P-256 precompile, and sharded slots.
2. **Built out on Avalanche Fuji:** one squashed commit, "Build the product on Avalanche Fuji" (12 Sep).
3. **Back on Monad for Metropolis:** every commit after that. The full list is in the
   [README](README.md#built-for-metropolis-1-sep--13-oct-2026). In short:
   - CorpusShares, SalesLog, and x402 in USDC;
   - the passkey gate and the SO-101 key from the passkey;
   - Privy wallets, the lab policy, and gas sponsorship;
   - the Quest 3S in mixed reality, the leader arm, the table scan, and teach and repeat;
   - the Envio indexer, the Chainlink CRE corpus audit, and the Qwen/Kimi buyer agent;
   - `pnpm demo`.

External code and assets are named in the README's [Attribution](README.md#attribution). AI tools: the code was
written with **Claude Code**, as disclosed in the [README](README.md#how-this-was-built-ai-tools).

## Sponsor bounties entered

Details, evidence and the live steps left are in [docs/SPONSOR-GAP.md](docs/SPONSOR-GAP.md). Each line below is real
code exercised end to end on the local chain. Where a key or an account is missing, the integration runs behind its
env var. Without that key, the feature says it is not configured. No mock is reachable from the product.

| Bounty | What in Thenar meets the stated requirement | State |
| --- | --- | --- |
| **Privy** ($5k): "beyond authentication" | Several Privy features working together. **Embedded wallets** sign every run and passkey registration. A **server wallet under a policy** holds the lab budget and can only fund Thenar tasks (`/lab`). **Gas sponsorship** pays operators' writes (`lib/contract-write.ts`). The embedded wallet **pays for a corpus over x402** on /corpus. | Built. Sponsorship needs the Privy dashboard toggle. The sponsored path is checked on anvil through a stand-in with the same EIP-7702 shape: a 0-MON operator records, is paid and buys a corpus. |
| **Mera: One Passkey, Many Keys** ($2.5k) | One Mera passkey, three jobs. **Identity:** a P-256 key registered in PasskeyRegistry, which Monad's precompile checks. **Robot ownership:** a PRF salt, "so101-commands", derives through HKDF the Ed25519 key the arm relay obeys (`--owner`). **No storage:** nothing derived is stored, and any synced device derives the same key. /passkey derives it live and verifies a signed command. | Built. The cross-device check needs two devices with a synced passkey. |
| **Qwen 3.8 Max** ($5k credits, Track 4) | The buyer agent (`AGENT_LLM=qwen`). Qwen reads tasks and datasheets, prices a corpus, pays over x402 with its own key, and checks the bytes against SalesLog, all as tool calls. | Built. Verified end to end with a real Qwen 3 model on Ollama (`AGENT_LLM=ollama`). Model Studio\'s `qwen3.8-max` needs `DASHSCOPE_API_KEY`. |
| **Kimi** ($3k credits) | The same agent on `kimi-k2.6` (`AGENT_LLM=kimi`), with Kimi's reasoning carried across turns. | Built; the loop is tested with a test double of Moonshot's API. The real model needs `MOONSHOT_API_KEY`. |
| **Envio** ($1k) | A HyperIndex V3 indexer over five contracts, with aggregate entities (`indexer/`). Its consumer is `/api/indexer` plus the history on /leaderboard: totals, 14 days of runs and recent operators. Monad's RPC can't serve that history. | Built. Indexing Monad needs Envio Cloud or an API token. |
| **Chainlink CRE** ($3k) | `cre/corpus-audit`: a DON audits the corpus Thenar sells against the verifier's Merkle commitment. Each node computes the roots, the nodes reach consensus, and the DON reads the commitment and writes a verdict per task to `CorpusAudit`, a `ReceiverTemplate`. | Built and compiled to WASM, tested locally. `cre workflow simulate --broadcast` needs `cre login`. |
| **Cleanverse CVI/CVA** ($2k, Track 4) | Planned: an aUSDC task bounty that pays only operators the validator clears (`complianceVerify`). The deployed contracts are mapped in [docs/CLEANVERSE.md](docs/CLEANVERSE.md). | Blocked: the docs are invite-only, and no app can move aUSDC on testnet until Cleanverse registers it. |

## Per bounty: the portal's fields

**Privy: "beyond authentication"**
- *Primitives used*:
  - embedded wallets (email → wallet on Monad);
  - a **server wallet under a policy** (`lib/server/privy-lab.ts`, `/lab`): a lab's budget can only escrow Thenar
    bounties, and the refusal is shown live;
  - **native gas sponsorship**, `sendTransaction(…, { sponsor: true })` for every operator write
    (`lib/contract-write.ts`);
  - the embedded wallet **paying over x402** for a corpus (`components/corpus-pull.tsx`).
- *Evidence*:
  - live since 5 Oct, sponsorship behind its flag;
  - on a local chain, `pnpm test:localnet:sponsored` takes an operator who never holds MON through passkey
    registration, a paid run and an x402 purchase, all through an EIP-7702 delegated account whose gas a sponsor pays.

**Mera: One Passkey, Many Keys**
- *Non-account work*: the PRF salt `thenar:so101-commands:v1` → HKDF → an Ed25519 key that the operator's own robot
  arm obeys. The relay (`scripts/arm-relay.mjs --owner`) moves the arm only for commands signed by it.
- *Nothing stored*: the key is derived on demand and zeroed when its session ends.
- *Cross-device*: /passkey shows the key and verifies a signed command live. The same passkey on a synced device
  shows the same key.
- *Evidence*:
  - `components/passkey-keys.tsx`, `lib/robot-key.ts`;
  - `pnpm test:localnet` checks the key with the relay's own Ed25519 check, and that it is the same with nothing
    stored.

**Qwen 3.8 Max (Track 4)**
- *Load-bearing use*: the buyer agent. The model decides through tool calls, step by step:
  1. list tasks;
  2. read datasheets;
  3. price;
  4. buy over x402;
  5. verify the sha256 against SalesLog on chain.
- *Evidence*:
  - `scripts/qwen-agent.mjs` (`AGENT_LLM=qwen`);
  - verified end to end with a real Qwen 3 on Ollama on 6 Oct (SalesLog entry 9 on the local chain);
  - Model Studio needs `DASHSCOPE_API_KEY`.

**Kimi**
- *Use*: the same agent with `AGENT_LLM=kimi` (`kimi-k2.6`), carrying Kimi's reasoning across turns.
- *Evidence*: `pnpm test:agent` exercises the loop through a test double of Moonshot's API. The real run needs
  `MOONSHOT_API_KEY`.

**Envio**
- *Indexer*: HyperIndex V3 over AxonProtocolV2, SalesLog, CorpusShares, CorpusAccess and PasskeyRegistry, with
  aggregate and derived entities (`Stats`, `DailyStat`, `DailyOperator`, `TaskContributor`).
- *Consumer*: `/api/indexer`, plus the history on /leaderboard.
- *Evidence*:
  - `indexer/` (`config.yaml`, `schema.graphql`, `src/EventHandlers.ts`);
  - `pnpm test:localnet` step 8;
  - hosting on Envio Cloud is a deploy step ([docs/DEPLOY-LATER.md](docs/DEPLOY-LATER.md)).

**Chainlink CRE**
- *Orchestration*: `cre/corpus-audit`.
  1. Cron triggers it.
  2. Each node fetches the episodes Thenar sells and builds the Merkle roots itself, and the nodes reach consensus.
  3. An EVM read of CorpusManifest through Multicall3.
  4. A verdict per task.
  5. `writeReport` to `CorpusAudit`, a `ReceiverTemplate` that trusts only the forwarder.
- *Evidence*:
  - `forge test --match-contract CorpusAuditTest`;
  - `pnpm test:cre`;
  - the WASM build;
  - `cre workflow simulate --broadcast` after `cre login`.

**Cleanverse CVI/CVA (Track 4)**: blocked. The docs need an invite, and no outside app can move aUSDC on testnet yet.
The findings and the planned gate are in [docs/CLEANVERSE.md](docs/CLEANVERSE.md).

## Demo script (3 minutes)

| Time | Shot | Say |
|---|---|---|
| 0:00–0:15 | app.thenar.io home, then /hub | "Robot data, recorded by people who own it, bought by agents that verify it. On Monad." |
| 0:15–0:40 | Sign in with email (Privy). /passkey: Face ID makes the passkey; *Prove it on Monad* turns green; *Derive my SO-101 key*, then the same key on a phone | "One passkey: who I am, checked by Monad's P-256 precompile, and the key my robot arm obeys. Nothing stored." |
| 0:40–1:25 | /station/0: drive with the keyboard; switch to the leader arm in hand; then the Quest 3S with the arm on the real table | "Three ways to drive, one recording format." |
| 1:25–1:50 | Submit: IN TOLERANCE, then "Recorded and paid in one transaction". The station says the sponsor pays the gas. The explorer shows TrajectoryAccepted and the shares | "Scored, signed, paid and owned in the same second. No MON needed." |
| 1:50–2:25 | A terminal: `scripts/qwen-agent.mjs` lists, prices, pays 0.01 USDC over x402, verifies the sha256 on SalesLog | "An agent buys the data, and checks on chain that it got exactly what was sold." |
| 2:25–2:50 | /leaderboard history (Envio); `/api/task/0/manifest` with the Chainlink DON's verdict | "History from Envio; a Chainlink DON audits the corpus against its on-chain commitment." |
| 2:50–3:00 | /contracts | "Identity, provenance, ownership and agent trust, each enforced by a contract. Thenar." |

**Pitch video (2 minutes):**
1. 0:00–0:20: the problem. Robots need demonstrations; the people who record them are not paid and do not own them.
2. 0:20–1:20: the product, using shots 2, 4 and 5 above.
3. 1:20–1:45: why Monad. 300 ms blocks, final about 600 ms later, pay in the same interaction; the P-256 precompile makes passkeys
   native; parallel execution handles the sharded slots.
4. 1:45–2:00: what's next. Real labs posting tasks, and trained policies sold back.

## Checklist

- [x] Public repo with an OSI licence (MIT)
- [x] README: setup (one command), external code attributed, pre-existing work named, AI tools disclosed
- [x] Commit history across the window
- [x] Contracts deployed to Monad testnet and source-verified (`lib/deployment.ts`)
- [x] Every flow run end to end on a local chain with real transactions ([docs/TEST-PLAN-ZERO-MOCK.md](docs/TEST-PLAN-ZERO-MOCK.md))
- [ ] Go live with the post-5-Oct work: [docs/DEPLOY-LATER.md](docs/DEPLOY-LATER.md) (waits for the user's "go")
- [ ] A paid run on the Monad deployment, its shares issued, and a paid agent pull logged in SalesLog (after "go")
- [ ] Demo video, 3 minutes or less, and pitch video, 2 minutes or less (shot list above)
- [ ] Portal: project profile with the links above (registration closed 6 Oct 23:59 UTC)
