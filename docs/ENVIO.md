# How Thenar uses Envio: one index of everything that happened on Thenar

*Thenar · Monad Metropolis, Track 04 · live at https://app.thenar.io*

**Status, stated plainly:**
- **Built and tested:** the Envio HyperIndex indexer, and it reads Monad testnet through HyperSync.
- **Not hosted yet:** the live app at app.thenar.io still reads its leaderboard from the protocol's own ledger. It
  will switch once the indexer is deployed to Envio's hosted service.

## The problem Envio solves: history across five contracts

Thenar's state is spread over five contracts on Monad:

| Contract | What it holds |
|---|---|
| AxonProtocolV2 | Tasks, accepted runs, payouts, refunds and claims |
| SalesLog | Every corpus sale: x402 paid pulls and free pulls |
| CorpusShares | The whitelist, shares per run, transfers and dividends |
| PasskeyRegistry | Operators binding a P-256 passkey |
| CorpusAccess | Time-boxed read subscriptions |

The questions users ask cut across all five:
- "who earned the most?"
- "which agents buy the most data, and from which tasks?"
- "what did this operator do over time?"

Answering them with RPC calls means scanning logs per contract on every page view. An indexer turns the event
history into one queryable model.

## How it works

The indexer is `indexer/`, built on Envio HyperIndex v3:
- `config.yaml` lists the five contracts and their events, for two chains: Monad testnet (10143, via HyperSync) and
  the local anvil chain (31337, RPC).
- Handlers in `indexer/src/` build the entities: Task, Run, Operator, TaskContributor, Passkey, Sale, Agent, AgentTask,
  ShareIssue, ShareTransfer, Dividend, Subscription, and daily stats.
- Rows are keyed by `(id, chainId)`, so task 0 on Monad and task 0 on the local chain never merge.
- The **agents ranking** on /leaderboard ("who buys the data") comes from the `Agent` and `AgentTask` entities:
  purchases, spend and tasks per buyer.

Every address, URL and start block comes from an `ENVIO_`-prefixed variable, because Envio only passes that prefix
through. The defaults are the deployments in `lib/deployment.ts`.

## Engineering notes

- **Two chains, one schema.** The same handlers index the local chain the tests run on and Monad testnet, each
  switched on by a flag. Monad needs a HyperSync token (`ENVIO_API_TOKEN`).
- **Tests run against real events.** The indexer's tests (`indexer/test/`) pass 9/9. They run handlers over events
  emitted by the real contracts.
- **HyperSync on Monad testnet** was read with the shared token, up to height 70,453,982.

## What Envio brought to Thenar

- **One model for the whole market.** Operators, runs, sales, agents and shares become entities that can be joined,
  instead of five separate log scans.
- **The agents ranking.** "Which agents buy which data" is a join over SalesLog and tasks, which is exactly what an
  indexer is for.
- **It scales with Monad's pace.** With 300 ms blocks, per-request log scanning doesn't keep up. HyperSync does.

## Where to see it

- **Code:** `indexer/config.yaml`, `indexer/schema.graphql`, `indexer/src/`, `indexer/test/`.
- **The leaderboard it is built for:** https://app.thenar.io/leaderboard. Today that page reads the protocol's own
  ledger: the Envio-backed version runs locally until hosting is set up.
- **The events it indexes** are all on Monad testnet: for example the paid run
  [0x909f2c23…0d59](https://testnet.monadvision.com/tx/0x909f2c23ccae46476bbf18f55fb0a7e85d56a0cf23a642f47ea2375f0eda0d59)
  and the agent sale
  [0x16eedac1…86281](https://testnet.monadvision.com/tx/0x16eedac1431a7533415cfa6866abe764ef5d1d22aa1cfffb5b8fb1ad1f686281).
