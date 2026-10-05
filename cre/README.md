# Chainlink CRE: the corpus audit

Thenar sells each task's corpus: every paid episode, as one file. The verifier commits a Merkle root over those
episodes to `CorpusManifest` on Monad, so a buyer can check a file against the chain. But a buyer only finds a gap
after downloading, and only if they think to look.

`corpus-audit` makes that check for everyone, on a schedule, from a Chainlink DON:

1. **Cron trigger** (every 30 s in staging, hourly in production).
2. **HTTP with consensus.** Every node fetches `GET {apiBase}/api/corpus/episodes`, the bare episode hashes Thenar
   would sell for each task, and builds each task's Merkle root itself. The nodes agree on the roots with
   identical consensus. Thenar's server is the party being checked, so the DON never takes its word for a root.
3. **EVM read** on `monad-testnet`: the verifier's committed root and episode count for every task, from
   `CorpusManifest.latest`, in one Multicall3 call at a finalized block.
4. **A verdict per task**, one of:
   - `Matches`: the root agrees with the commitment;
   - `Grown`: more episodes are served than were committed, so the corpus was paid since its last commitment;
   - `Short`: fewer episodes are served than were committed, so some are missing;
   - `Altered`: the same count but a different set;
   - `Uncommitted`: nothing has been committed for the task yet.
5. **`writeReport`** to `CorpusAudit` (`contracts/src/CorpusAudit.sol`). It is a `ReceiverTemplate` that accepts
   reports only from the KeystoneForwarder. It stores the newest verdict per task and discards older retried reports.

`audit.ts` is the logic with no CRE in it, and `main.ts` wires it to the capabilities.

## Checked without a DON

- `forge test --match-contract CorpusAuditTest` (in `contracts/`) covers the receiver: forwarder only, newest wins,
  owner-only settings, ERC-165.
- `test/live-cre-audit.mjs` runs on the local chain. The roots `audit.ts` builds are the ones `lib/merkle.ts` and
  `/api/task/{id}/manifest` build. The verdicts follow real `CorpusManifest` commitments. A `CorpusAudit` deployed
  locally decodes and stores the exact report the workflow encodes.
- `bun install && ./node_modules/.bin/cre-compile main.ts dist/corpus-audit.wasm` (in `corpus-audit/`) compiles
  the workflow to WASM.

## Running it

The CRE CLI needs an account for `init`, `simulate` and `deploy`:

1. `cre login` (sign up at cre.chain.link first).
2. Deploy the receiver from a throwaway key with a little MON. Never use the protocol deployer, the verifier or the
   corpus issuer.

   ```bash
   cd contracts
   forge script script/DeployCorpusAudit.s.sol --rpc-url monad --broadcast --private-key <throwaway key>
   ```

   It trusts Monad testnet's MockKeystoneForwarder (`0xB9F79d863261869B234c481D1f9A7af84AeAd192`) by default. That
   is what `simulate --broadcast` delivers through.
3. Put the printed address in `corpus-audit/config.staging.json` as `corpusAudit`.
4. Copy `.env.example` to `.env` and set `CRE_ETH_PRIVATE_KEY` to the same throwaway key.
5. Simulate, with a real write on Monad testnet:

   ```bash
   cd cre/corpus-audit && bun install && cd ..
   cre workflow simulate corpus-audit --target staging-settings --non-interactive --trigger-index 0 --broadcast
   ```

Set `CORPUS_AUDIT` to the receiver's address on the app's backend, and `/api/task/{id}/manifest` reports the DON's
latest verdict as `audit` next to its own `computed` and the verifier's `committed`.

To deploy the workflow itself, point the receiver at the production KeystoneForwarder
(`setForwarderAddress(0xF8344CFd5c43616a4366C34E3EEE75af79a74482)`). Then fill `config.production.json` and run
`cre workflow deploy corpus-audit --target production-settings` (this needs `cre account access` approval).
