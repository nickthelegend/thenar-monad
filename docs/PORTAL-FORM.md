# Thenar: the portal form (hackathon.monad.xyz → "Complete your entry")

> **Superseded by [PORTAL-ENTRY.md](PORTAL-ENTRY.md)**: it follows the real portal layout, with character counts and the exact bounty names. Use that one.

Every field is in the portal's order and within its limit. Paste it straight in. Fields marked **[you]** are yours to
fill.

---

### 1. Primary track
**04 · Trust, Identity & AI Infrastructure**

### 2. Logo
`docs/brand/logo-portal.png` (1024×1024 PNG, 270 KB)

### 3. Project name
Thenar

### 4. Tagline
Teach a robot, own the data, get paid on Monad: people drive robot arms, one transaction pays them, and AI agents buy
the corpus.

### 5. Description

**PROBLEM**
Robot policies learn from human demonstrations: someone drives an arm through a task, again and again, and the
recording becomes training data. Physical AI is short of these demonstrations. The people who record them are rarely
paid or credited, and they never own the result. Buyers can't check that a dataset is what it claims to be, or that
a person, not a script, made it.

**SOLUTION**
Thenar is a market for robot demonstrations.
- **Labs** post funded tasks. A lab's budget can live in a Privy server wallet whose policy only lets it fund Thenar.
- **Operators** drive an SO-101 robot arm from a browser, a Meta Quest 3S (WebXR, hands on the controllers) or a
  physical leader arm. A verifier scores the recording from its samples and signs, and **one Monad transaction
  records the run and pays the operator** from the task's escrow. Every paid run also issues the operator shares of
  the corpus.
- **AI agents** buy a task's corpus over x402: one cent of USDC per pull, with no account. Every sale is logged on
  Monad with the file's sha256, so the agent checks it got the bytes that were sold.
- **Chainlink CRE** audits the corpus against the Merkle root committed on Monad, and writes its verdict on chain.

**WHY MONAD**
- **Paid while you watch.** A paid run is executed in about 0.4–1.1 s and final in about 0.8–1.3 s from the send,
  measured in the browser. It uses `eth_sendRawTransactionSync` and is checked against Monad's finalized tag. The
  operator sees the payment before they take the headset off.
- **A person behind every paid run.** The operator's passkey is registered in PasskeyRegistry and verified by
  Monad's P-256 precompile (0x0100). Through Mera, the same passkey derives the key that commands their arm.
- **Monad-native receipts.** The receipt shows each step: seen in the txpool (`txpool_statusByHash`), executed, then
  final, with its hash checked. The page prices gas the way Monad charges it, on the limit. /network reads Monad and
  Ethereum side by side, live.

**WHAT'S LIVE (Monad testnet, chain 10143)**
- App: https://app.thenar.io. 13 contracts, all verified on Sourcify/MonadVision (`lib/deployment.ts`).
- A lab bounty posted from a Privy server wallet: task #13,
  `0x8dc67558b4a17ccbd2d3c85f13b723082ac2ba2e19e5922ddf78289c5ca2138c`. The policy refuses any other send
  (`policy_violation`).
- A paid run driven in WebXR: `0x909f2c23ccae46476bbf18f55fb0a7e85d56a0cf23a642f47ea2375f0eda0d59`, executed 1.09 s
  and final 1.21 s from the send.
- An agent purchase over x402: `0x16eedac1431a7533415cfa6866abe764ef5d1d22aa1cfffb5b8fb1ad1f686281`.
- A Chainlink CRE audit write to CorpusAudit: `0xf1546ec91261ed5ec2750f58a71a37d0d7a1405f21c3fd057b4af921f73a5f72`.
- So far: 7 paid runs from 7 wallets, 5 agent sales, 2 Privy lab bounties.

**Team-seeded activity, labelled as such.** Every run, sale and bounty above was made by our team's wallets on 13–14
Oct (`docs/evidence/seed-13oct.md`, `docs/demo/README.md`). In the recordings, the passkey is Chromium's virtual
authenticator and the headset is Meta's WebXR emulator. Both are labelled on screen.

### 6. First users, and how we reach them

**First users:**
- **Makers who already print robot arms.** The SO-101 and its leader arm are open hardware. Our own Thenar Arms are
  a printable leader/follower pair, and a maker with one can earn on Thenar the day they plug it in.
- **Quest 3S owners.** They need no hardware beyond the headset: open app.thenar.io in the headset and drive with
  their hands.
- **Small robotics labs and research groups.** They need task-specific demonstrations and don't want a payout key
  on a laptop. A Privy policy wallet lets them post bounties with a hard cap.
- **AI agents and data teams.** They buy per task over x402, or by subscription, and verify what they bought.

**How we reach them:**
- **Through the hardware.** ThenarLabs publishes the arms, the leader rig and the teleop software as open source, and
  every build guide ends at a funded task on Thenar.
- **Through the communities that print arms.** LeRobot and SO-101 builders, maker spaces, Quest developer
  communities. We start with tasks they already practise (pick-and-place, drawer, transfer).
- **To labs:** we come with a dataset that's already verifiable, priced per run, and audited by CRE on chain.
- **To agents:** a 402 that states its terms is the whole onboarding; no sales call needed.

### 7. Repo URL
https://github.com/nickthelegend/thenar-monad

### 8. Live app URL
https://app.thenar.io

### 9. Demo video (≤ 3:00, the working product)
Upload **`docs/demo/thenar-demo.mp4`** (2:56) to YouTube or Loom (unlisted is fine) and paste the link.

It's one live take on Monad testnet:
- 0:16, a lab posts a bounty from its Privy wallet, and the policy refuses a send elsewhere;
- 0:30, operator onboarding;
- 0:35, a passkey verified by the P-256 precompile;
- 0:43, the Mera arm key;
- 0:48, the lab's task driven in **WebXR** (an emulated Quest, labelled);
- 1:23, paid in one transaction: executed, then final, with the receipt details;
- 1:40, corpus shares;
- 1:51, an agent buys over x402;
- 2:09, a live Chainlink CRE audit;
- 2:31, the leaderboard;
- 2:37, Monad beside Ethereum.

Waits and the teleop run are fast-forwarded under a visible "⏩ ×N" chip, and the receipt's timers are never sped up. There are no slides. A 4:00 walkthrough of the same take is in `docs/demo/thenar-walkthrough.mp4`.

### 10. Pitch video (≤ 2:00)
Upload **`docs/demo/thenar-pitch.mp4`** (1:20): hook → who we are → problem → why now → drive / get paid / own it
(one 4 s glimpse of the VR run) → proof card (testnet facts, team-seeded) → who it's for and how we reach them →
close.

Team: **[you]** The pitch says "We're ThenarLabs. We print robot arms and build the rigs that drive them" and names no
one. Replace or record the team line if you want names in it.

### 11. Testing instructions for judges

**No login needed to look around:** https://app.thenar.io (Monad testnet, chain 10143).
- `/`: the live block strip.
- `/network`: Monad beside Ethereum, read live, and a P-256 key checked by `0x0100`.
- `/corpus`: every episode, the Merkle root and the CRE verdict.
- `/leaderboard`: operators and agents.
- `/agents`: the x402 terms and the sale log.
- Any `/run/<hash>`: a replay and its on-chain proof, for example
  `/run/0x2cbb297cc1a7409ad8b6bdf356d3e1bf56799949bf8c613d7af273a24f927ad8`.

**To try the station free (no wallet):** open `/station/2`, choose **Practise first, no wallet needed**, then
**Begin run**.
- **Keys:** W A S D move the arm, Q/E lower and raise it, Space opens and closes the jaws.
- **Goal:** pick the payload up and set it down inside the ring. The page scores it as soon as it settles.

**To earn (about 0.1 MON of gas):**
1. **Start earning** → sign in with email (Privy) or any EVM wallet on Monad testnet, and get MON from the faucet
   link.
2. **Set up your passkey** (Face ID, a fingerprint or a PIN). It's registered on Monad and you're admitted to the
   corpus shares. **Derive my SO-101 key** shows the Mera-derived arm key.
3. Open a task with free slots (task 2 or task 3), drive it, and press **Submit and get paid**. The receipt shows
   executed and final times; open **Details** for the txpool, block and finalized-tag steps.
4. **On a Quest 3S:** open `app.thenar.io/q/<task>` in the headset browser → **Enter in VR**. A grips the arm, the
   trigger closes the jaws, A starts and ends the run.

**An agent purchase (needs a wallet with 0.01 testnet USDC):**
```
node --import ./test/register.mjs scripts/agent-buy.mjs https://app.thenar.io 13
```

**Notes and caps:**
- A task pays a fixed number of runs, and each operator has a cap per task.
- The verifier refuses a run that copies a route already recorded on the task ("drive it differently").
- CRE ran via `cre workflow simulate --broadcast`, with real writes to Monad. A hosted DON needs CRE deploy access.
- Some activity is team-seeded and labelled as such.

### 12. Bounties

**Privy**
- **Article:** https://github.com/nickthelegend/thenar-monad/blob/main/docs/PRIVY.md
- **How it's used:**
  - Operators sign in with email (or an external wallet) and get an embedded wallet on Monad.
  - A lab's budget is a **Privy server wallet under a Privy policy** with one allowed action: a transaction to
    Thenar's AxonProtocolV2 on Monad testnet, worth at most 0.1 MON.
  - Posting a bounty is that action. Anything else, such as sending MON to another address, is refused by Privy's
    policy engine before a signature exists.
- **Code:** `scripts/privy-lab.mjs`, `components/providers.tsx`.
- **Evidence:**
  - Bounty task #13, signed by Privy: `0x8dc67558b4a17ccbd2d3c85f13b723082ac2ba2e19e5922ddf78289c5ca2138c`.
  - Task #12: `0xdfb15157ca93b73dcd66c23cb0572a7ceffa999c2ccbdb3bd896346f4ec8d7c5`.
  - The forbidden send returned `400 policy_violation`.
  - The demo video at 0:16.

**Mera (One Passkey, Many Keys)**
- **Article:** https://github.com/nickthelegend/thenar-monad/blob/main/docs/MERA.md
- **How it's used:** one passkey is the operator's identity and their arm's key.
  - Its P-256 public key is registered in PasskeyRegistry, and each assertion is verified on chain through Monad's
    P-256 precompile (0x0100). That admission puts them on the corpus-shares whitelist.
  - The passkey's PRF output, through Mera, derives the separate key the operator's SO-101 obeys.
- **Code:** `lib/passkey.ts`, `components/operator-gate.tsx`, `components/passkey-keys.tsx`,
  `contracts/src/PasskeyRegistry.sol`.
- **Evidence:**
  - Passkey registration `0x175d59ba8721a332b7dd6ddd5bcdad91cabac8fe4f324705d1b28e086090d692`.
  - An earlier operator: registration `0x3d763ead3bc5666292aaee48e38dfaa2071a74feb0d0be2d08354a6eb6b408fe`, admission
    `0x15b27d03781dcfb2f094fa74f77710a762746c014526bdcab6d0d96b5172ceed`.
  - `test/live-passkey.mjs` (a real browser ceremony, verified by the registry on Monad).
  - The demo video at 0:35–0:48.

**Chainlink CRE**
- **Article:** https://github.com/nickthelegend/thenar-monad/blob/main/docs/CHAINLINK-CRE.md
- **How it's used:** the `cre/corpus-audit` workflow audits the party being checked: Thenar's server.
  - It fetches the served episode hashes, rebuilds each task's Merkle root itself (consensus on identical roots), and
    reads CorpusManifest on Monad through Multicall3.
  - It writes a verdict per task (Matches, Grown, Short, Altered or Uncommitted) to `CorpusAudit` (0xC913…86Dd,
    verified).
  - The corpus page shows that verdict beside the data.
- **Code:** `cre/corpus-audit/`, `contracts/src/CorpusAudit.sol`.
- **Evidence (`cre workflow simulate --broadcast`):**
  - `0xf1546ec91261ed5ec2750f58a71a37d0d7a1405f21c3fd057b4af921f73a5f72` (tasks 0, 12 and 13: uncommitted, served
    but no root committed);
  - `0x2ac5873da169f1e6915acb64d116ab1e1fa68a98d57935183e72e07923724a84`;
  - the demo video at 2:09.

**Envio** *(built; hosted indexing pending)*
- **Article:** https://github.com/nickthelegend/thenar-monad/blob/main/docs/ENVIO.md
- **How it's used:** an Envio HyperIndex indexer over Thenar's contracts: run history and the agents ranking for
  /leaderboard. It reads Monad testnet through HyperSync.
- **Code:** `indexer/`.
- **Evidence:** indexer tests pass 9/9 locally, and HyperSync on Monad testnet was read with the shared token. The
  live leaderboard reads the protocol's own ledger until Envio hosting is set up.

### 13. Promo clip (optional, ≤ 0:30)
`docs/demo/thenar-promo.mp4` (0:27): drive in the headset → paid on Monad → an agent buys over x402 → close.

### 14. X link
**[you]**
