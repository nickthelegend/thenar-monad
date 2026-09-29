# Thenar indexer

An [Envio HyperIndex](https://docs.envio.dev/docs/HyperIndex/overview) (v3, `envio` 3.12.1) indexer for the Thenar protocol. It indexes five contracts (tasks, accepted runs, operators, corpus sales, shares, dividends, passkeys and subscriptions) and serves them over GraphQL.

Its production target is **Monad testnet (10143)**. A local anvil chain (31337) from `scripts/localnet.mjs` proves it end to end without a HyperSync token.

The app needs an indexer because Monad's public RPC answers `eth_getLogs` over at most 100 blocks. Without one, a page can only see the last few seconds of history, or has to walk storage one view call at a time. With this indexer, leaderboards, per-task run lists, sale history, cap tables and a daily chart are each one GraphQL query.

- `config.yaml`: contracts, events, and both chains. Every address, URL, start block and on/off flag comes from an `ENVIO_*` variable.
- `schema.graphql`: the entities.
- `src/EventHandlers.ts`: the handlers. `src/entities.ts` holds the defaults and small helpers.
- `test/indexer.test.ts`: handler tests on simulated events. They need no network, database or Docker.
- `scripts/verify.mjs`: cross-checks the running indexer against contract state, field by field.
- `db.compose.yaml` and `scripts/*.sh`: this indexer's own Postgres and Hasura, plus start/stop.

## What it indexes

| Contract | Events |
| --- | --- |
| `AxonProtocolV2` | `TaskCreated`, `TaskFunded`, `TrajectoryAccepted`, `PasskeyRun`, `TaskFilled`, `TaskExpired`, `Claimed`, `PaymentDeferred` |
| `SalesLog` | `CorpusSold` (`terms` is the `Terms` enum, uint8 on the wire) |
| `CorpusShares` | `Admitted`, `Issued`, `Transfer`, `DividendDeclared`, `DividendClaimed`, `DividendReclaimed` |
| `PasskeyRegistry` | `PasskeyRegistered`, `PasskeyRevoked` |
| `CorpusAccess` | `Subscribed` |

### Entities

| Entity | id | What it holds |
| --- | --- | --- |
| `Task` | task id | Name, funder, slots, `rewardPerTrajectory`, scenario, difficulty. Also `runCount`, `contributorCount`, `paidTotal`, `scoreTotal`, `bestScore` and `bestRun`, and top-ups (`toppedUp`, `fundings`). Lifecycle: `filled`, `expired` and `refunded`, each with a timestamp and tx. Sales: `saleCount`, `salesVolume`. Creation block, time and tx. Relations: `runs`, `contributors`, `sales`. |
| `Run` | trajectory id | One accepted run: `task`, `contributor` (an `Operator`), `trajHash`, `cid`, `score` (0–10000), `paid` (wei), `viaPasskey`, `sharesIssued`, block, timestamp, `txHash`, `logIndex`. |
| `Operator` | address | Run stats: `runCount`, `passkeyRunCount`, `tasksContributed`, `paidTotal`, `scoreTotal`, `bestScore`, `firstRunAt`, `lastRunAt`. Identity: `hasPasskey`, `passkey`, `admitted` (with time and tx). Shares: `shareBalance`, `sharesIssued`, `dividendsClaimed`. MON the contract could not push: `deferredTotal`, `claimedTotal`, `owed`. Relations: `runs`, `taskContributions`, `shareIssues`, `dividendClaims`. |
| `TaskContributor` | `${taskId}-${operator}` | One operator on one task. `scoreTotal` is the on-chain `weightOnTask`, so these rows are the cap table. |
| `Passkey` | owner | `x`, `y`, `active`, `registrations`, and registration and revocation block, time and tx. |
| `Sale` | sale seq | `task`, `buyer`, `asset`, `amount`, `sha256`, `saleId`, `terms` (`X402` or `AgentKit`), block, timestamp, `txHash`. |
| `SaleAsset` | asset address | Sale count and volume per payment asset. |
| `ShareIssue` | `${txHash}-${logIndex}` | One `Issued`: holder, value, `trajHash`, and the `run` it was for. |
| `ShareTransfer` | `${txHash}-${logIndex}` | Every share `Transfer`, mints included (`isMint`). |
| `Dividend` | dividend id | Record and execution dates, `amount`, `claimed`, `claimCount`, `reclaimed`, supply when declared, and the declaring tx. Relation: `claims`. |
| `DividendClaim` | `${dividendId}-${holder}` | One holder's claim: amount and tx. |
| `Subscription` | `${txHash}-${logIndex}` | One `CorpusAccess` purchase: `days`, `paid`, `until`, tx. |
| `Subscriber` | address | Latest `until`, `totalPaid`, `totalDays`, `subscriptionCount`. |
| `Stats` | chain id (`"10143"`, `"31337"`) | The per-chain singleton. Counts: tasks (plus filled and expired), runs, passkey runs, operators, admitted, passkeys, passkey registrations, subscriptions, subscribers. Money: paid total, score total, funded, refunded, deferred, claimed, subscription revenue. Sales: count, paid and free, volume. Shares: supply, holders. Dividends: count, declared, claimed. Also the last block and time indexed. |
| `DailyStat` | UTC date `YYYY-MM-DD` | One day for a chart: runs, paid, score total, best score, active and new operators, tasks created, sales, sales volume. |
| `DailyOperator` | `${date}-${operator}` | Backs `DailyStat.activeOperators`. |

**Units.** Amounts are the contracts' own integers, stored as `BigInt`. Anything in MON (payouts, top-ups, refunds, dividends, subscriptions) is in wei. A sale's `amount` is in atomic units of its `asset`: USDC has 6 decimals, and a free pull has zero. Shares are whole units, because `decimals()` is 0. Timestamps are unix seconds. Hasura returns `BigInt` as a string and `Int` as a number.

**Addresses** are stored EIP-55 checksummed. Filter with checksummed values, for example `contributor_id: {_eq: "0xB9CA…13fd"}`.

**Chains never collide.** `disable_default_cross_chain: true` keys every row by `(id, chainId)`: task 0 on Monad and task 0 locally are two rows. Every entity has a `chainId`. When both chains are on, add `chainId: {_eq: 10143}` to a `where`.

**Notes**
- `Run.paid` is what the run was credited. If the contract could not push the MON (the recipient reverted), the same amount also shows up in `PaymentDeferred`, so `Operator.owed` is what `claim()` would pay now.
- `Task.toppedUp` counts only `TaskFunded`. The escrow a task is created with is not in `TaskCreated`, and tasks created through `Foundry` are paid for by a contract, so the transaction value would be wrong.
- `Stats.salesVolume` adds up raw amounts across assets. That is correct while every paid sale is USDC. Use `SaleAsset` for per-asset volume.
- `Operator` has a row for every address that ran, holds shares, was admitted, has a passkey, or is owed MON. `Stats.operators` counts only addresses with at least one run.
- `Issued` is matched to its run by `trajHash`, which links `ShareIssue.run` and `Run.sharesIssued`.

## Chains

| Chain | Flag | Default | Source |
| --- | --- | --- | --- |
| Monad testnet `10143` | `ENVIO_THENAR_SKIP_MONAD` | `true` (skipped) | HyperSync `https://monad-testnet.hypersync.xyz`, with the RPC `https://testnet-rpc.monad.xyz` as fallback. Start block `64987386`. |
| Local anvil `31337` | `ENVIO_THENAR_SKIP_LOCAL` | `false` (on) | RPC only (`for: sync`), `http://127.0.0.1:8645`. Start block `0`. |

Each chain's addresses default to `lib/deployment.ts` and `lib/deployment-local.ts`. All of them can be overridden. See `.env.example` for every variable: `ENVIO_THENAR_MONAD_*`, `ENVIO_THENAR_LOCAL_*`, `ENVIO_MONAD_TESTNET_RPC_URL`, `ENVIO_THENAR_MONAD_RPC_FOR` and `ENVIO_THENAR_MONAD_HYPERSYNC_URL`. Envio only passes through variables prefixed with `ENVIO_`.

## Run it locally, without touching anything else

> **Never run `envio dev` or `envio stop` in this directory on this machine.** The Envio CLI's own local stack uses fixed global names: `envio-postgres` (port 5433), `envio-hasura` (8080), `envio-network` and `envio-postgres-data`. On this machine those belong to another project (juno-monad). `envio dev` would reuse or recreate them, and `envio stop` deletes them.
>
> This indexer brings its own containers and runs `envio start` against them. `ENVIO_PG_HOST` makes the CLI use our Postgres. `HASURA_EXTERNAL_PORT=8089` has our Hasura already answering, so the CLI starts no container of its own. `scripts/start.sh` refuses to run unless both of our containers are healthy on the expected ports. `pnpm stop` only stops the indexer process.

| | |
| --- | --- |
| Postgres | container `thenar-envio-pg`, `127.0.0.1:55441`, database `envio-dev`, user `postgres`, password `thenar-envio` |
| Hasura | container `thenar-envio-hasura`, **GraphQL `http://localhost:8089/v1/graphql`**, console `http://localhost:8089/console`, **admin secret `thenar-admin`** |
| Docker | compose project `thenar-envio`, network `thenar-envio-net`, volume `thenar-envio-pg-data` |
| Indexer | `envio start`, HTTP/metrics port `9941`, logs in `.run/indexer.log`, pid in `.run/indexer.pid` |

Reads need no secret, because Hasura's unauthenticated role is `public`, as in Envio's own stack. The admin secret is only needed for the console and metadata.

Prerequisites: Node 22 or later, pnpm, and Docker. The two images, `postgres:18.3` and `hasura/graphql-engine:v2.43.0`, are the ones Envio uses.

```bash
cd indexer
pnpm install --ignore-workspace   # the repo root is a pnpm workspace; keep this install separate
pnpm db:up          # start thenar-envio-pg + thenar-envio-hasura and wait until both are healthy
pnpm start:bg       # envio start in the background (or `pnpm start` in the foreground)
pnpm logs           # follow .run/indexer.log
pnpm verify:local   # compare GraphQL with contract state on the local chain
```

| Script | What it does |
| --- | --- |
| `pnpm db:up` / `pnpm db:down` / `pnpm db:status` | Start, stop or list this project's two containers. `db:down` keeps the data volume. To wipe it: `docker compose -f db.compose.yaml down -v`. |
| `pnpm start` | `envio start` in the foreground, after the preflight checks. |
| `pnpm start:bg` | The same in the background. |
| `pnpm stop` | Stops the background indexer. Never runs `envio stop`. |
| `pnpm reindex` | Stop, then `envio start -r` in the background: drops this indexer's tables and re-indexes from the start blocks. Needed after changing `config.yaml` or `schema.graphql`, or after enabling a chain. |
| `pnpm codegen` | Validates `config.yaml` and `schema.graphql` and regenerates `.envio/types.d.ts`. |
| `pnpm typecheck` | `tsc` over handlers and tests. |
| `pnpm test` | vitest: simulated events through the real handlers. |
| `pnpm verify:local` | Reads every task, run, sale, passkey, balance and total from the contracts and compares it with GraphQL. Exits 1 on any mismatch. |

If the local chain is restarted from nothing (`scripts/localnet.mjs`), the addresses stay the same but history is gone. Run `pnpm reindex`.

## Turn Monad testnet on

Monad is skipped by default because backfilling it takes HyperSync, and HyperSync queries need an API token. From block 64,987,386 to a head near 66.8M is about 1.8M blocks. Without a token, `POST https://monad-testnet.hypersync.xyz/query` answers `401 Your token is malformed`.

1. **Get a token.** Sign in at <https://envio.dev/app/api-tokens> (GitHub login), create an API token and copy it. It is free for development use.
2. **Put it in `indexer/.env`** (gitignored), and switch the chain on:
   ```bash
   ENVIO_API_TOKEN=<your-token>
   ENVIO_THENAR_SKIP_MONAD=false
   # optional: stop indexing the local chain
   # ENVIO_THENAR_SKIP_LOCAL=true
   ```
3. **Re-index**, since the chain set changed: `pnpm reindex`. HyperSync skips empty ranges, so a backfill of five low-traffic contracts should be quick. After that the indexer follows the head.
4. Check it: `{ _meta { chainId progressBlock sourceBlock isReady } Stats(where: {chainId: {_eq: 10143}}) { tasks runs operators } }`.

No token at all? Set `ENVIO_THENAR_MONAD_RPC_FOR=sync` as well, which makes the public RPC the only source. It works, because the config caps RPC log queries at 100 blocks to match the endpoint, but the backfill is about 18,000 requests.

### Host it on Envio Cloud (the Envio bounty route)

1. Sign in at <https://envio.dev/app> with GitHub and install the Envio Deployments app on this repository.
2. **Add indexer**: set the root directory to `indexer`, the config file to `config.yaml`, and pick a deployment branch.
3. Under **Environment Variables**, set `ENVIO_THENAR_SKIP_MONAD=false` and `ENVIO_THENAR_SKIP_LOCAL=true`. The cloud cannot reach a local anvil. Envio Cloud indexers get HyperSync without an `ENVIO_API_TOKEN`.
4. Push to the deployment branch and copy the GraphQL endpoint from the dashboard.

`envio` is pinned to `3.12.1` in `package.json` and `pnpm-lock.yaml` is committed, which is what Envio Cloud needs.

## Example queries

Operator leaderboard:

```graphql
{
  Operator(where: {runCount: {_gt: 0}}, order_by: {bestScore: desc}) {
    id runCount bestScore paidTotal shareBalance hasPasskey admitted
  }
}
```

One task with its runs, best run and sales:

```graphql
{
  Task(where: {id: {_eq: "0"}, chainId: {_eq: 31337}}) {
    name slots runCount contributorCount bestScore paidTotal saleCount salesVolume
    bestRun { id score }
    runs(order_by: {score: desc}) { id score paid sharesIssued contributor_id txHash }
    sales { seq terms amount buyer txHash }
  }
}
```

Chain totals and sync progress:

```graphql
{
  Stats { id tasks runs operators paidTotal sales salesVolume shareSupply shareHolders admitted passkeys }
  _meta { chainId progressBlock sourceBlock isReady }
}
```

Daily chart:

```graphql
{ DailyStat(where: {chainId: {_eq: 31337}}, order_by: {dayStart: asc}) { date runs paid bestScore activeOperators newOperators sales salesVolume } }
```

A task's cap table, where `scoreTotal` is `weightOnTask`:

```graphql
{ TaskContributor(where: {task_id: {_eq: "0"}}, order_by: {scoreTotal: desc}) { operator_id runCount scoreTotal paidTotal } }
```

From a shell:

```bash
curl -s http://localhost:8089/v1/graphql -H 'content-type: application/json' \
  -d '{"query":"{ Stats { id tasks runs operators paidTotal } }"}'
```
