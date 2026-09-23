# Thenar demo — recording plan

For Monad Metropolis, Track 4 (Trust, Identity & AI Infrastructure).

Blockchain app: yes. Monad testnet, chain 10143 (runs, bounties and payouts in
MON; x402 corpus sales in USDC; SalesLog; CorpusShares and its dividends in
MON), World Chain (AgentBook, read only), World ID (Selfie Check gate).
Explorer: Monadscan, `https://testnet.monadscan.com`.

No browser wallet signs in this take. Every transaction is signed by a key that
already exists for it on Monad testnet: the Privy server wallet (lab budget,
signed inside Privy, at most 0.1 MON per transaction under its policy), the
agent's key (`AGENT_PRIVATE_KEY`, an EIP-3009 USDC authorisation that the Monad
facilitator submits and pays the gas for), and the CorpusShares issuer key
(`CORPUS_ISSUER_PRIVATE_KEY`, the dividend). None of them holds mainnet funds.
Each transaction is confirmed from its Monad receipt (status 1) before the take
moves on. A human-signed station submission is not recorded: it needs a Selfie
Check on a phone, which cannot be produced here. The World gate is shown by a
real refusal captured during the take (beat e3), from
`node --import ./test/register.mjs scripts/monad-run.mjs`; that script reads
`DEPLOYER_PRIVATE_KEY` at start, though a refused run spends nothing.

The shares beat declares a dividend rather than showing shares issued by a paid
run. A paid run needs a Selfie-Checked human, which the take cannot produce; the
dividend is an issuer operation it can perform for real, with
`node --import ./test/register.mjs scripts/shares.mjs dividend 0.01`.

Server: the production build on `http://localhost:3222`. Browser: Google
Chrome through Playwright, headless, fresh profile, viewport `DEMO_W`x`DEMO_H` (1440x810), captured as
full-viewport screenshots on the beat log's clock. If Monadscan holds the headless browser
at a bot check, the take fails with `EXPLORER_BLOCKED` rather than recording the
check. The explorer beats would then have to be recorded headed:
`demo/record-explorer.mjs` did that for the earlier Monad take, but it reads that
take's file and has not been adapted to this one.

| # | id | What is shown | Signing beat |
| --- | --- | --- | --- |
| 1 | b01-landing | Landing page with the moving arm | |
| 2 | b02-hub | Hub: open tasks, escrow in MON | |
| 3 | b03-station | Station: policy drives a practice run | |
| 4 | b04-verdict | End run: measured verdict | |
| 5 | b05-lab | Lab: Privy wallet and its policy (AxonProtocolV2 on Monad, ≤ 0.1 MON) | |
| 6 | b06-lab-sign | Post a 0.004 MON bounty (1 run × 0.004 MON); overlay until the Monad receipt is status 1 | **yes (Monad, Privy)** |
| 7 | b07-monadscan | That transaction on Monadscan | |
| 8 | b08-lab-refuse | Same wallet asked to send 0.01 MON elsewhere: Privy refuses | |
| 9 | b09-agents | Agents page: 402 terms (0.01 USDC, `eip155:10143`), treasury, SalesLog | |
| 10 | b10-agentbook | AgentBook lookup of the agent wallet | |
| 11 | b11-x402-sign | Agent buys task 1's corpus; overlay until the Monad receipt is status 1 with a USDC transfer to the treasury, and SalesLog `servedCount(sha256)` is at least 1; new row on /agents | **yes (Monad, x402)** |
| 12 | b12-monadscan-x402 | That settlement on Monadscan | |
| 13 | b13-monadscan-log | The sale's SalesLog write on Monadscan (the SalesLog address page if the write's hash is not known) | |
| 14 | b14-corpus-token | CorpusShares on /corpus-token | |
| 15 | b15-dividend-sign | Declare a 0.01 MON dividend; overlay until the Monad receipt is status 1; dividends declared +1 | **yes (Monad, CorpusShares)** |
| 16 | b16-monadscan-dividend | That declaration on Monadscan | |
| 17 | b17-lookup | Holder lookup: agent wallet refused, AccountIsNotInControlList | |
| 18 | b18-contracts | The Thenar contracts on Monad testnet | |
| 19 | b19-status | Live status checks | |

Post-production scenes, with narration, drawn from the take file:
`intro`, `e1-path` (after b13), `e2-receipts` (after b17, the take's three
Monad transactions), `e3-world` (after e2, the take's real 403 refusal),
`e4-selfie` (the card before the hand-recorded Selfie Check), `outro`.
