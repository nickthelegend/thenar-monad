# Metropolis submission: Thenar

**Track 4 — Trust, Identity & AI Infrastructure.** Build window 1 September to
13 October 2026; judging 14–27 October.

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

| Bounty | What in Thenar qualifies | State |
| --- | --- | --- |
| **Privy** ($5k): "beyond authentication" | Operators' embedded wallets sign every run and passkey registration on Monad; a lab's budget is a Privy server wallet whose policy lets it do nothing but fund Thenar tasks (`/lab`, `lib/server/privy-lab.ts`) | Built and live |
| **Mera: One Passkey, Many Keys** ($2.5k) | One passkey, made with Mera, does three jobs. (1) **Identity:** its P-256 key is registered in PasskeyRegistry and Monad's precompile checks it before the operator can earn. (2) **Robot ownership:** a PRF salt that means "SO-101 commands" derives, through HKDF, an Ed25519 key in a Mera signing session; the relay in front of the operator's physical arm (`--owner`) moves it only for frames signed by that key, so the passkey is the key to their robot (`lib/robot-key.ts`, `scripts/arm-relay.mjs`). (3) The same passkey on any synced device reproduces the same arm key; nothing derived is ever stored. | Built; tested with a WebAuthn authenticator in Chromium and against Monad |
| **Qwen 3.8 Max** ($5k credits, Track 4) | The buyer agent: Qwen reads the tasks and dataset summaries, decides what to buy, pays over x402 and checks the file against SalesLog, all as tool calls | Needs a Model Studio API key |
| **Envio** ($1k) | A HyperIndex indexer over Axon, SalesLog and CorpusShares drives the activity feed and the leaderboard | Needs an Envio API token |

## Checklist

- [ ] Contracts deployed to Monad testnet (`lib/deployment.ts` filled by `scripts/apply-deploy.mjs`)
- [ ] Contracts source-verified
- [ ] A paid run on the deployment, and its shares issued
- [ ] A paid agent pull, logged in SalesLog, checked by the agent
- [ ] Demo video
- [ ] Public profile on the Metropolis site, with the demo, this write-up and the repo link
