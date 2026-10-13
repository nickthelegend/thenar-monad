# Judge review (13 Oct 2026)

Thenar scored as an unbiased Metropolis judge would, on the official criteria, after using app.thenar.io cold.

| Criterion (main track, 20% each) | Score /10 | Why |
|---|---|---|
| Product quality | 7 | The station is genuinely good: three ways to drive, replay, the race ghost. The judge path reads at a glance now. A first paid run still takes five steps |
| Technical excellence | 8 | Real contracts, all verified; a verifier that re-scores from samples; Merkle commitments; signed agent records; CI with an anvil end-to-end |
| Monad integration | 8 | Live commit states, two-timer receipts measured on Monad (702 ms executed, 1,310 ms final for a paid run), P-256 at 0x0100, staking reads, gas billed on the limit, canonical contracts, Sourcify |
| Track fit (Track 4: trust, identity, AI infrastructure) | 9 | Identity (passkeys on chain), provenance (hashes, Merkle roots, a DON audit), ownership (shares only verified humans hold), agent trust (x402 plus signed reasons) |
| Innovation | 7 | Paying people per robot demonstration, on chain, is new; the parts are known patterns |

**Bounties** (requirements 40 / technical 30 / Monad 20 / innovation 10): Privy, Chainlink CRE, Mera and Envio each have
a load-bearing use with a transaction or a test behind it (docs/SPONSOR-COVERAGE.md). Qwen is the weakest: no hosted
model key, so the live agent trail comes from a local model or the test double.

**Product-market fit:** robot learning is starved of demonstrations, and the people who could record them are not paid.
Thenar's two sides are real, but a lab buying data and an operator earning from it both still have to show up.

**Hackathon fit:** strong. Everything claimed runs, on Monad, with evidence.

## Top 5 weaknesses, and what would make a judge say no

1. Few real runs on Monad (one scripted operator run on 13 Oct); the corpus is thin.
2. The hand flow (email sign-in, passkey, drive) on the live site was not walked end to end by a person before submission.
3. No hosted Qwen or Kimi model, so the agent's live reasoning on Monad isn't shown.
4. The CRE verdict is "uncommitted", because no manifest root was committed for the task yet.
5. Many pages; a judge without the script can still wander.

**Fixed before 20:00:** a real paid run, x402 sale and CRE audit on Monad, with every transaction recorded in the
docs; the judge path readable at 1440 and 390 px.
