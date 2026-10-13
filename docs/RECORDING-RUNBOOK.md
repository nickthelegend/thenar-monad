# Recording runbook (≤ 3 minutes, live app)

**Starting state:**
- Chrome, signed out, at https://app.thenar.io, window 1440×900.
- Your Privy email wallet holds **0.5 MON**. The passkey costs about 0.01 MON, and each paid run about 0.06 MON,
  because Monad bills the gas limit.
- A second tab: [the paid run's transaction on MonadVision](https://testnet.monadvision.com/tx/0x0ad7cfea8d51788264edad412d2b7296bdf66f5fbd854f59b9804d426d9a4c86).
- A terminal in the repo, for the agent shot.

| # | Seconds | Click | On screen | Caption |
|---|---|---|---|---|
| 1 | 0:00–0:20 | Nothing: let `/` load | The block strip fills, grey → blue → green, with ms; "Final 1,3xx× sooner than Ethereum" | "Monad testnet, live: a block every 300 ms, final in under 600." |
| 2 | 0:20–0:35 | **Start earning** → **Sign in** (email, code) | /start ticks Sign in and Gas | "One way in. Each step is read from the chain." |
| 3 | 0:35–0:55 | **Set up your passkey** → Face ID / Touch ID → **Derive my SO-101 key** | "Passkey set · you can earn"; the arm key, verified | "Monad's P-256 precompile checks the passkey. The same passkey drives my arm." |
| 4 | 0:55–1:35 | /station/0 → **Race the best run** (on) → **Begin run** → W A S D, Q to lower, Space to grip, carry into the ring, Space | The ghost arm moves beside yours; the timer runs | "Drive it in the browser, against the best run so far." |
| 5 | 1:35–1:55 | **Submit and get paid** → confirm | IN TOLERANCE, "Paid to your wallet", **Executed ~700 ms · Final ~1.3 s**, Monad testnet chip | "Scored, signed, paid in one transaction, and final 600 ms later." |
| 6 | 1:55–2:15 | /corpus → pick task 0 | Episode cards; the task summary with the CRE verdict | "The data, drawn from the samples the hashes commit to." |
| 7 | 2:15–2:35 | Terminal: `node --import ./test/register.mjs scripts/agent-buy.mjs https://app.thenar.io 0` | `settled true`, then the SalesLog line "logs the same sha256" | "An agent pays a cent of USDC over x402 and checks the file on chain." |
| 8 | 2:35–3:00 | /network | The Monad and Ethereum table, a P-256 key checked live, the staking epoch | "Identity, provenance, ownership and agent trust, enforced on Monad. Thenar." |

**Pause on:**
- Step 1: the chips turning green and their ms.
- Step 5: Executed and Final, and the chip "Monad testnet".
- Step 8: "Final after", Monad against Ethereum.

**Fallbacks:**
- **The strip says "reconnecting":** reload. The public WebSocket recovers within a few seconds.
- **The submit button says the wallet is thin on MON:** send 0.2 MON to the Privy wallet and retry. The run is kept as
  a draft.
- **The run scores below the floor:** press **Run again** (nothing is charged). Lower straight onto the object, then
  carry slowly.
- **The agent shows 402 with no settlement:** the agent's USDC ran out. Its wallet `0x9a6C…63aA` needs 0.01 USDC per
  pull.

**Consumes, per take:**
- About 0.07 MON from the Privy wallet: passkey 0.01, which is once only, plus the run 0.06.
- 0.01 USDC from the agent.
- Task 0 has 5 open slots. If they run out, use task 4 ("Put the pen on the closed laptop", 6 open).
