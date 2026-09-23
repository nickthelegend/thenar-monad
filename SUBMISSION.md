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
| **Identity** | A paid run needs a live human behind the address: a World ID Selfie Check, one person per nullifier. Operators can also authorise runs with a passkey. | `/api/world/verify`; `PasskeyRegistry` through Monad's P-256 precompile |
| **Provenance** | Every accepted run's hash is on chain with its score, contributor and block; each task's corpus has a committed Merkle root. | `AxonProtocolV2`, `CorpusManifest` |
| **Data ownership** | The corpus is shares that only verified humans can hold, issued per run by score, with dividends from sales snapshotted at a record date set in advance. | `CorpusShares` |
| **Agent trust** | An agent pays per pull over x402 in USDC, or shows through AgentBook that a human stands behind it; every sale is logged with the sha256 of the bytes served, so the agent can check its copy against the chain. | `/api/agent/corpus`, `SalesLog` |

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
  reads, the World ID gate on the share whitelist, the Privy lab on Monad, and
  the Monad deployment itself.

## Checklist

- [ ] Contracts deployed to Monad testnet (`lib/deployment.ts` filled by `scripts/apply-deploy.mjs`)
- [ ] Contracts source-verified
- [ ] A paid run on the deployment, and its shares issued
- [ ] A paid agent pull, logged in SalesLog, checked by the agent
- [ ] Demo video
- [ ] Public profile on the Metropolis site, with the demo, this write-up and the repo link
