# Metropolis submission: Thenar

**Track 4 — Trust, Identity & AI Infrastructure.** Build window 1 September to
13 October 2026; judging 14–27 October.

**Try it:** https://app.thenar.io (on Monad testnet). The team behind it,
ThenarLabs, and its hardware: https://thenar.io.

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
In short: sub-second finality makes the payout, the share and the sales record
visible in the same interaction; parallel execution is why the slot counter is
sharded; the P-256 precompile is what lets a passkey sign a run; and Monad's
100-block log cap is why every history this app shows is read from storage.

## What existed before, and what was built for Metropolis

Thenar was built at Monad Blitz Hyderabad V3 (3rd place), and the organisers
asked us to continue it. The repository's history is laid out so this is
checkable:

- **Before Metropolis** — the Blitz commits on Monad, then one squashed commit,
  "Build the product on Avalanche Fuji", for the build-out that followed.
- **Built for Metropolis** — every commit after it: the move back to Monad,
  `CorpusShares` and `SalesLog`, x402 in USDC on Monad, storage-based history
  reads, the passkey gate on the share whitelist, the Privy lab on Monad, the Monad deployment itself, the Quest 3S
  teleop, the camera table scan, teach-and-repeat, and the SO-101 arm.

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

## Checklist

- [ ] Contracts deployed to Monad testnet (`lib/deployment.ts` filled by `scripts/apply-deploy.mjs`)
- [ ] Contracts source-verified
- [ ] A paid run on the deployment, and its shares issued
- [ ] A paid agent pull, logged in SalesLog, checked by the agent
- [ ] Demo video
- [ ] Public profile on the Metropolis site, with the demo, this write-up and the repo link
