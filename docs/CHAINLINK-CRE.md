# How Thenar uses Chainlink CRE: an outside auditor for the data we sell

*Thenar · Monad Metropolis, Track 04 · live at https://app.thenar.io*

Thenar is a market for robot demonstrations on Monad:
- **operators** drive a robot arm, and one Monad transaction records each run and pays them;
- **AI agents and labs** buy the resulting corpus;
- a **Chainlink CRE workflow** checks that the corpus Thenar serves is the corpus committed on chain.

## The problem CRE solves: the seller shouldn't grade its own data

Each paid run's hash is recorded on Monad when it happens, which proves every episode was real. A buyer also needs
to know about the **set**: are the episodes Thenar serves today the ones committed, with none dropped, added or
altered? The verifier commits a Merkle root over each task's paid episodes to `CorpusManifest`. But Thenar's server
is the party that serves the files. If the only check is Thenar's own "matches: true", the buyer is trusting the
seller to grade itself.

CRE gives us an independent party that does the hashing itself. Its nodes fetch the episodes, rebuild the roots,
compare them with Monad, and write the verdict where anyone can read it.

## How it works

The workflow is `cre/corpus-audit/` (TypeScript, `@chainlink/cre-sdk`):

```
cron → every node: GET {apiBase}/api/corpus/episodes, build each task's Merkle root itself
     → consensus (identical aggregation) on the roots
     → EVM read on monad-testnet: CorpusManifest.latest for every task, in one Multicall3 call
     → a verdict per task
     → writeReport to CorpusAudit (a ReceiverTemplate) on monad-testnet
```

The verdict is a pure function of what was served and what was committed (`cre/corpus-audit/audit.ts`):

```ts
export const Verdict = { Uncommitted: 0, Matches: 1, Grown: 2, Short: 3, Altered: 4 } as const;

if (!committed) return Verdict.Uncommitted;
if (served.root.toLowerCase() === committed.root.toLowerCase()) return Verdict.Matches;
if (served.episodes > committed.episodes) return Verdict.Grown;
if (served.episodes < committed.episodes) return Verdict.Short;
return Verdict.Altered;
```

The DON never takes Thenar's word for a root. It takes only the episode hashes and does the hashing itself.
`CorpusAudit` (`0xC913C03FbE2F8901296FC69dF3b136f9889b86Dd`, verified on Sourcify) stores the latest finding per task.
The app reads it back: `/api/task/<id>/manifest` returns it under `audit`, and the corpus page shows "Chainlink CRE
audit: <verdict>" beside the data.

## Engineering notes

- **Consensus on identical roots.** Every node computes the roots independently and the report needs them to agree.
  A node that saw a different file can't move the verdict.
- **One read for every task.** The committed roots for every task come from one Multicall3 call at the last
  finalized block, so the audit costs one EVM read however many tasks there are.
- **What runs today: the simulator, with real writes.** We run it with
  `cre workflow simulate corpus-audit --target staging-settings --broadcast`. The simulator executes the real
  workflow and broadcasts the report to Monad testnet through the forwarder. Deploying it to a hosted DON needs CRE
  deploy access, which we don't have yet. The workflow code doesn't change between the two.
- **A finding we didn't hide.** The latest audit reports tasks 0, 12 and 13 as **Uncommitted**: their episodes are
  served, but the verifier hasn't committed a root for them since the last runs. We left it showing: the point of
  an outside auditor is that it says so.

## What CRE brought to Thenar

- **Buyers check the seller, not just the episodes.** A dataset bought from Thenar comes with a verdict written by
  a party that rebuilt the roots itself.
- **The verdict is on Monad.** It sits in `CorpusAudit` next to `CorpusManifest` and `SalesLog`, readable by an agent
  before it pays, not buried in our logs.
- **It catches real drift.** As shown above, it reports "uncommitted" when the server has served more than the
  verifier committed.

## See it live (Monad testnet)

- **The audit run in the demo** (tasks 0, 12 and 13, all Uncommitted):
  [0xf1546ec9…a5f72](https://testnet.monadvision.com/tx/0xf1546ec91261ed5ec2750f58a71a37d0d7a1405f21c3fd057b4af921f73a5f72).
- **An earlier audit write:**
  [0x2ac5873d…24a84](https://testnet.monadvision.com/tx/0x2ac5873da169f1e6915acb64d116ab1e1fa68a98d57935183e72e07923724a84).
- **CorpusAudit:** `0xC913C03FbE2F8901296FC69dF3b136f9889b86Dd`; its deploy tx starts `0x26adbcdd`.
- **In the app:** https://app.thenar.io/corpus (the "Chainlink CRE audit" line), and
  https://app.thenar.io/api/task/0/manifest.
- **The demo video at 2:09:** `docs/demo/thenar-demo.mp4`, the live `cre workflow simulate --broadcast` run with its
  output.
- **Code:** `cre/corpus-audit/main.ts`, `cre/corpus-audit/audit.ts`, `contracts/src/CorpusAudit.sol`.
