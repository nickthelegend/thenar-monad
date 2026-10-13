# Sponsor coverage

Every Metropolis sponsor protocol, and what Thenar does with it. **Working** means real calls or transactions on Monad
testnet, used by the product and tested. All evidence below is from 13 Oct 2026, on app.thenar.io and Monad testnet
(chain 10143).

**Count: 6 working, 2 partial, the rest not used (with the reason).**

| Protocol | Status | What it does in Thenar | Evidence |
|---|---|---|---|
| **Privy** | working | Operators sign in with email and get an embedded wallet. A lab's budget is a Privy server wallet whose policy only lets it fund Thenar tasks | Bounty signed by Privy, task #12: [`0xdfb15157…8d7c5`](https://testnet.monadvision.com/tx/0xdfb15157ca93b73dcd66c23cb0572a7ceffa999c2ccbdb3bd896346f4ec8d7c5). A forbidden send was refused with `policy_violation` |
| **Chainlink CRE** | working | A DON audits the corpus Thenar sells against its on-chain commitment and writes a verdict per task to `CorpusAudit` | Audit write [`0x2ac5873d…24a84`](https://testnet.monadvision.com/tx/0x2ac5873da169f1e6915acb64d116ab1e1fa68a98d57935183e72e07923724a84). The verdict shows in `/api/task/0/manifest`. CorpusAudit is `0xC913…86Dd`, verified |
| **Mera** (Monad Foundation) | working | A passkey is the operator's identity, checked on chain by the P-256 precompile, and its PRF derives the SO-101's command key | Passkey registered [`0x3d763ead…b408fe`](https://testnet.monadvision.com/tx/0x3d763ead3bc5666292aaee48e38dfaa2071a74feb0d0be2d08354a6eb6b408fe). Admission (CorpusShares) [`0x15b27d03…2ceed`](https://testnet.monadvision.com/tx/0x15b27d03781dcfb2f094fa74f77710a762746c014526bdcab6d0d96b5172ceed) |
| **x402** (Monad's facilitator) | working | Agents pay 0.01 USDC per task corpus over HTTP; every sale is logged with the file's sha256 | Sale [`0xad0e3082…216b5`](https://testnet.monadvision.com/tx/0xad0e30826dbdf8b249c5833f218e697ea5257676ddc5c96f925639a775c216b5), SalesLog #1 matches the bytes received |
| **Envio** | working | HyperIndex over Thenar's contracts: history and the agents ranking on /leaderboard | `indexer/`. Tests 9/9. HyperSync on Monad testnet read with the shared token (height 70,453,982). The ranking ran from the indexer locally |
| **BlockVision** (MonadVision, Sourcify) | working | All 13 contracts verified, and every hash links to MonadVision | Sourcify `exact_match` for every address in `lib/deployment.ts`, plus CorpusAudit |
| **Qwen** | partial | The buyer agent's model (lists, prices, pays, verifies, signs its reasons) | Runs on a real Qwen 3 through Ollama and on a scripted double in CI. No Model Studio key yet |
| **Kimi** | partial | The same agent on Kimi | Code and tests only. Thenar does not use the shared Moonshot key (the user's rule) |
| Cleanverse | not used | Planned for compliant USDC payouts | Blocked on their onboarding (docs/CLEANVERSE.md) |
| MetaMask Smart Accounts, Dynamic, Zerion, Nansen, Alchemy, QuickNode, Chainstack, Dwellir, Spectrum, Tenderly | not used | Thenar already has a wallet (Privy) and the public Monad RPC; adding these would be a badge, not a function | — |
| Kuru, Perpl, Agora AUSD, Aurora Intents, Mercuryo, Tencent Hunyuan | not used | No trading, stablecoin swaps or media generation in Thenar | — |

## The Monad paid run behind it

One operator, end to end, scripted (`scripts/monad-operator-run.mjs`) against the live app:

| Step | Transaction |
|---|---|
| Fund the operator (0.15 MON) | [`0xe3e451dc…9b259`](https://testnet.monadvision.com/tx/0xe3e451dcb0ad86ed92425d1f979555452220677ac973986345f27640abd9b259) |
| Passkey on chain | [`0x3d763ead…b408fe`](https://testnet.monadvision.com/tx/0x3d763ead3bc5666292aaee48e38dfaa2071a74feb0d0be2d08354a6eb6b408fe) |
| Admission | [`0x15b27d03…2ceed`](https://testnet.monadvision.com/tx/0x15b27d03781dcfb2f094fa74f77710a762746c014526bdcab6d0d96b5172ceed) |
| Paid run (score 89.98, task 0): executed in 702 ms and final in 1,310 ms, from the send | [`0x0ad7cfea…24c86`](https://testnet.monadvision.com/tx/0x0ad7cfea8d51788264edad412d2b7296bdf66f5fbd854f59b9804d426d9a4c86) |
| Corpus shares issued (90 THNRC) | [`0xccd1d8df…06b01`](https://testnet.monadvision.com/tx/0xccd1d8dfa85a938b7e3968c55b982f505691b7add1bfc905b4cd3369b7d06b01) |
| Agent buys the corpus over x402 | [`0xad0e3082…216b5`](https://testnet.monadvision.com/tx/0xad0e30826dbdf8b249c5833f218e697ea5257676ddc5c96f925639a775c216b5) |
| Chainlink CRE audit | [`0x2ac5873d…24a84`](https://testnet.monadvision.com/tx/0x2ac5873da169f1e6915acb64d116ab1e1fa68a98d57935183e72e07923724a84) |

The run's page: <https://app.thenar.io/run/0x2cbb297cc1a7409ad8b6bdf356d3e1bf56799949bf8c613d7af273a24f927ad8>.
The recording is one the verifier accepted on the local chain for the task of the same name. The hosted verifier
re-scored it for this operator, since the contributor is part of what it hashes.
