# Thenar: portal entry

Laid out exactly like the portal page, top to bottom. Paste field by field. Each `>` line is the portal's own label
or hint. Character counts are of the text inside each block. **Live URL everywhere: https://app.thenar.io**

## Primary track
> Your project is judged in one track. Choose it before you add bounties.

**Trust, Identity & AI Infrastructure**

## Project details

### Logo
> PNG, JPG, or WEBP · Max 2 MB · At least 500 px · Up to 2000 × 2000 px

`docs/brand/logo-portal.png` (1024×1024 PNG, 270 KB)

### Name   (6 / 120)
```
Thenar
```

### Tagline   (129 / 200)
```
Teach a robot, own the data, get paid on Monad: people drive robot arms, one transaction pays them, and AI agents buy the corpus.
```

### Description   (2,956 / 8,000)
```
PROBLEM
Robot policies learn from human demonstrations: someone drives an arm through a task, again and again, and the recording becomes training data. Physical AI is short of these demonstrations, and the people who record them are rarely paid or credited and never own the result. Buyers can't check that a dataset is what it claims to be, or that a person, not a script, made it.

SOLUTION
Thenar is a market for robot demonstrations.
- Labs post funded tasks. A lab's budget can live in a Privy server wallet whose policy only lets it fund Thenar.
- Operators drive an SO-101 robot arm from a browser, a Meta Quest 3S (WebXR, hands on the controllers) or a physical leader arm. A verifier scores the recording from its samples and signs, and one Monad transaction records the run and pays the operator from the task's escrow. Every paid run also issues the operator shares of the corpus.
- AI agents buy a task's corpus over x402: one cent of USDC per pull, with no account. Every sale is logged on Monad with the file's sha256, so the agent checks it got the bytes that were sold.
- Chainlink CRE audits the served corpus against the Merkle root committed on Monad and writes its verdict on chain.

WHY MONAD
- Paid while you watch. A paid run is executed in about 0.4 to 1.1 s and final in about 0.8 to 1.3 s from the send, measured in the browser. It is sent with eth_sendRawTransactionSync and checked against Monad's finalized tag. The operator sees the payment before they take the headset off.
- A person behind every paid run. The operator's passkey is registered in PasskeyRegistry and verified by Monad's P-256 precompile (0x0100). Through Mera, the same passkey derives the key that commands their arm.
- Monad-native receipts. Each receipt shows seen in the txpool (txpool_statusByHash), executed, then final, with the block hash checked. Gas is priced on the limit, the way Monad charges it. /network reads Monad and Ethereum side by side, live.

WHAT'S LIVE (Monad testnet, chain 10143)
- App: https://app.thenar.io. 13 contracts, all verified on Sourcify / MonadVision.
- A lab bounty from a Privy server wallet: task #13, 0x8dc67558b4a17ccbd2d3c85f13b723082ac2ba2e19e5922ddf78289c5ca2138c. The policy refuses any other send (policy_violation).
- A paid run driven in WebXR: 0x909f2c23ccae46476bbf18f55fb0a7e85d56a0cf23a642f47ea2375f0eda0d59, executed 1.09 s and final 1.21 s from the send.
- An agent purchase over x402: 0x16eedac1431a7533415cfa6866abe764ef5d1d22aa1cfffb5b8fb1ad1f686281.
- A Chainlink CRE audit written to CorpusAudit: 0xf1546ec91261ed5ec2750f58a71a37d0d7a1405f21c3fd057b4af921f73a5f72.
- So far: 7 paid runs from 7 wallets, 5 agent sales, 2 Privy lab bounties.

Team-seeded activity, labelled as such: every run, sale and bounty above was made by our team's wallets on 13 and 14 Oct. In the recordings, the passkey is Chromium's virtual authenticator and the headset is Meta's WebXR emulator, both labelled on screen.
```

### First users + how we reach them   (1,242 / 8,000)
```
FIRST USERS
- Makers who already print robot arms. The SO-101 and its leader arm are open hardware, and our own Thenar Arms are a printable leader and follower pair. A maker with one can earn on Thenar the day they plug it in.
- Quest 3S owners. They need no hardware beyond the headset: open app.thenar.io in the headset and drive with their hands.
- Small robotics labs and research groups. They need task-specific demonstrations and don't want a payout key on a laptop. A Privy policy wallet lets them post bounties with a hard cap.
- AI agents and data teams. They buy per task over x402, or by subscription, and verify what they bought against the chain.

HOW WE REACH THEM?
- Through the hardware. ThenarLabs publishes the arms, the leader rig and the teleop software as open source, and every build guide ends at a funded task on Thenar.
- Through the communities that print arms: LeRobot and SO-101 builders, maker spaces and Quest developer communities. We start with the tasks they already practise: pick-and-place, drawers and transfers.
- To labs, we come with a dataset that is already verifiable, priced per run and audited by CRE on chain.
- To agents, a 402 that states its terms is the whole onboarding. No sales call needed.
```

### Repository
> Public, or shared with metropolis@hackathon.monad.xyz.

https://github.com/nickthelegend/thenar-monad

## Demo and pitch

### Live URL
> Must run on Monad Mainnet or Testnet.

https://app.thenar.io

### Demo video
> Show the working product, not slides or a code walkthrough. Up to 3 minutes.

Upload `docs/demo/thenar-demo.mp4` (2:56), then paste ONE link (YouTube unlisted, Loom or Vimeo, not a folder). Its
captions are in `docs/demo/thenar-demo.srt`.
[ ] Let organizers show it publicly (**you decide**)

### Pitch video
> Introduce your team, the problem you solve, and why you are building it. Up to 2 minutes.

Upload `docs/demo/thenar-pitch.mp4` (1:20), then paste ONE link.
Team: **[you fill in]**. The pitch says "We're ThenarLabs. We print robot arms and build the rigs that drive them"
and names no one.

### Judge testing instructions   (2,095 / 8,000)
> Private to your team, judges, and organizers.
```
Live app: https://app.thenar.io (Monad testnet, chain 10143).

NO LOGIN NEEDED TO LOOK AROUND
1. https://app.thenar.io: the live block strip, each block timed from proposed to final.
2. /network: Monad beside Ethereum, read live, with a P-256 key checked through the 0x0100 precompile.
3. /corpus: every episode, the Merkle root and the Chainlink CRE verdict.
4. /leaderboard: operators by earnings and agents by purchases. /agents: the x402 terms and the sale log.
5. Any run's page: https://app.thenar.io/run/0x2cbb297cc1a7409ad8b6bdf356d3e1bf56799949bf8c613d7af273a24f927ad8 shows the replay and its on-chain proof.

DRIVE THE ARM FOR FREE (no wallet)
6. Open https://app.thenar.io/station/2 and choose "Practise first, no wallet needed", then "Begin run".
7. W A S D move the arm, Q and E lower and raise it, Space opens and closes the jaws. Pick the payload up and set it inside the ring. The score appears as soon as it settles.

EARN (about 0.1 MON of testnet gas)
8. "Start earning": sign in with email (Privy) or any EVM wallet on Monad testnet. Get MON from the faucet link on the page.
9. "Set up your passkey" (Face ID, a fingerprint or a PIN). It is registered on Monad and you are admitted. "Derive my SO-101 key" shows the arm key Mera derives from it.
10. Open a task with free slots (task 2 or task 3), drive it, then "Submit and get paid". The receipt shows executed and final times. Open "Details" for the txpool, block and finalized-tag steps.
11. On a Quest 3S: open https://app.thenar.io/q/2 in the headset browser, then "Enter in VR". The grip takes the arm, the trigger closes the jaws, and A starts and ends a run.

NOTES AND CAPS
- Each task pays a fixed number of runs, and each operator has a per-task cap (5).
- The verifier refuses a run that copies a route already recorded on the task.
- An agent purchase needs a wallet with 0.01 testnet USDC (scripts/agent-buy.mjs in the repo).
- Chainlink CRE runs through "cre workflow simulate --broadcast" with real writes to Monad. A hosted DON needs CRE deploy access.
- Some activity is team-seeded and labelled as such.
```

## Bounties

Claimed: three bounties, each met with live evidence on Monad testnet. **Not claimed, and why:**
- **Envio:** the indexer is built and tested, but not hosted, so no live feature runs on it yet.
- **Mera-Powered UX:** Mera is not our entire account layer; Privy is.
- **Qwen:** there is no key.
- **Cleanverse:** the CVA is blocked.
- **Community Team Project:** **[you decide]**.

### Best workflow with CRE   (Chainlink)
**Describe how CRE is used as an orchestration layer**   (1,635 chars)
```
Thenar sells robot-demonstration data, and its own server is the party being checked, so the audit runs as a Chainlink CRE workflow (cre/corpus-audit, TypeScript, @chainlink/cre-sdk). CRE orchestrates the whole check across off-chain data and two Monad contracts:
1. Cron trigger.
2. HTTP capability: every node fetches the served episode hashes from https://app.thenar.io/api/corpus/episodes and rebuilds each task's Merkle root itself.
3. Consensus (identical aggregation) on those roots, so a node that saw different files cannot move the result.
4. EVM read capability on monad-testnet: CorpusManifest.latest for every task, in one Multicall3 call at the last finalized block. These are the roots our verifier committed.
5. A verdict per task: Matches, Grown, Short, Altered or Uncommitted (cre/corpus-audit/audit.ts, a pure function).
6. EVM write capability: writeReport to CorpusAudit (0xC913C03FbE2F8901296FC69dF3b136f9889b86Dd, a ReceiverTemplate, verified on Sourcify) on Monad testnet.

The app reads the verdict back: /api/task/<id>/manifest returns it under "audit", and the corpus page shows "Chainlink CRE audit: <verdict>" beside the data, so a buyer or an agent can read it before paying.

It runs through the CRE CLI simulator with a real broadcast: cre workflow simulate corpus-audit --target staging-settings --broadcast. Deploying to a hosted DON needs CRE deploy access, which we don't have. The latest audit (0xf1546ec9...a5f72) found tasks 0, 12 and 13 "uncommitted": their episodes are served, but no root is committed yet. We left that verdict showing, because an outside auditor is only useful if it says so.
```
**Video (required, ≤ 2:00) of a CRE CLI simulation or live deployment**
`docs/demo/bounty-cre.mp4`: upload it, then paste the link.

**What we did**
- Wrote the `cre/corpus-audit` workflow: cron → HTTP fetch → consensus on the roots → EVM read (Multicall3 on Monad)
  → a verdict → EVM write.
- Deployed `CorpusAudit` (a ReceiverTemplate) on Monad testnet and verified it on Sourcify.
- Made the verdict a pure, tested function (`audit.ts`), and surfaced it in the app's API and on the corpus page.
- Ran it live in the demo with `cre workflow simulate --broadcast`, writing to Monad.

**Evidence**
- The audit write for tasks 0, 12 and 13 (Uncommitted): https://testnet.monadvision.com/tx/0xf1546ec91261ed5ec2750f58a71a37d0d7a1405f21c3fd057b4af921f73a5f72
- An earlier audit write: https://testnet.monadvision.com/tx/0x2ac5873da169f1e6915acb64d116ab1e1fa68a98d57935183e72e07923724a84
- The verdict, read back by the app: https://app.thenar.io/api/task/0/manifest (`audit`), and https://app.thenar.io/corpus
- The article: https://github.com/nickthelegend/thenar-monad/blob/main/docs/CHAINLINK-CRE.md
- The demo video at 2:09.

### Privy!   (Privy)
**Describe how the project meaningfully integrates Privy (beyond login)**   (1,396 chars)
```
Beyond login, Privy holds a robotics lab's money. A lab funds Thenar tasks (bounties that pay operators per accepted run) from a Privy server wallet that carries a Privy policy with exactly one allowed action:
- a transaction to Thenar's AxonProtocolV2;
- on Monad testnet (chain_id 10143);
- worth at most 0.1 MON (value <= LIMIT);
- for both eth_sendTransaction and eth_signTransaction.
Everything else is denied when Privy signs, before a signature exists.

scripts/privy-lab.mjs creates the policy and the wallet (policy_ids: [policy]) through Privy's API. It prices and nonces a createTaskUntil transaction from Monad, has Privy sign it (eth_signTransaction on the wallet's RPC), then broadcasts the signed bytes with Monad's eth_sendRawTransactionSync, timing executed and final. It then asks the same wallet to sign a 0.01 MON transfer to another address. Privy returns 400 policy_violation, and no signature is made.

So a lab can automate bounties without a payout key on a laptop or in CI. The worst case for a leaked app secret is "it funded Thenar tasks". Monad charges the gas limit, so the transaction Privy signs carries a thin margin (estimate x 1.1).

Operators also sign in with Privy (email or an external wallet, components/providers.tsx) and receive their pay in that wallet. The bounty Privy signed in the demo, task #13, was then driven and paid on Monad in the same video.
```
**Video (optional, ≤ 2:00)**
`docs/demo/bounty-privy.mp4`: upload it, then paste the link.

**What we did**
- Wrote a Privy policy: allow only `to == AxonProtocolV2`, `chain_id == 10143`, `value ≤ 0.1 MON`; deny everything
  else.
- Created a Privy server wallet under that policy; the lab's budget lives there.
- Built bounty posting: Privy signs (`eth_signTransaction`), then Monad's `eth_sendRawTransactionSync` broadcasts
  and the timers run.
- Showed the refusal: a send anywhere else returns `policy_violation`, with no signature made.
- Operators sign in with Privy and are paid into that wallet.

**Evidence**
- Bounty task #13, signed by Privy: https://testnet.monadvision.com/tx/0x8dc67558b4a17ccbd2d3c85f13b723082ac2ba2e19e5922ddf78289c5ca2138c
- Bounty task #12, signed by Privy: https://testnet.monadvision.com/tx/0xdfb15157ca93b73dcd66c23cb0572a7ceffa999c2ccbdb3bd896346f4ec8d7c5
- A paid run on the lab's task #13: https://testnet.monadvision.com/tx/0x909f2c23ccae46476bbf18f55fb0a7e85d56a0cf23a642f47ea2375f0eda0d59
- The lab wallet: `0xeD2f5E810D24970E83ADac83CEec5A9BC7DE0454`. The article:
  https://github.com/nickthelegend/thenar-monad/blob/main/docs/PRIVY.md. The demo video at 0:16.

### Mera: One Passkey, Many Keys   (Mera)
**Describe how Mera is used for non-account work (a PRF namespace)**   (1,357 chars)
```
Mera gives each operator one passkey that does two jobs. The second job is not about accounts: it is a key that commands a physical robot arm.

1. The PRF namespace (the non-account work). lib/passkey.ts calls Mera's getPasskeyPrfOutput with a purpose-specific salt, SHA-256("thenar:<purpose>:v1"). For the purpose "so101-commands", lib/robot-key.ts runs the PRF output through HKDF-SHA-256 (info "thenar so101 command key v1") to get an Ed25519 seed. It hands that seed to Mera's createEd25519SigningSession and zeroes it. That key signs every command frame the station sends to the operator's own SO-101. The arm relay (scripts/arm-relay.mjs --owner <public key>) moves the arm only for frames signed by it. Nothing is stored: "Derive my SO-101 key" on /passkey re-derives the same key each time, and another purpose (salt) gives an independent key. test/live-passkey.mjs checks in a real browser that the PRF is stable for one purpose and separated between purposes.

2. Identity. Mera's ceremony creates the passkey, and its P-256 public key is registered in PasskeyRegistry on Monad. Admission assertions are verified through Monad's P-256 precompile (0x0100), so every paid run comes from a person.

One passkey, two keys: who you are (P-256, checked on chain) and what your robot obeys (Ed25519 from the PRF). There is no seed phrase and no key file.
```
**Video (optional, ≤ 2:00)**
`docs/demo/bounty-mera.mp4`: upload it, then paste the link.

**What we did**
- Built a PRF namespace in Mera: `SHA-256("thenar:<purpose>:v1")` salts. "so101-commands" → HKDF → an Ed25519
  signing session.
- That key signs the arm's command frames, and the relay obeys only its owner's key.
- Identity runs on the same passkey: P-256 in PasskeyRegistry, verified by Monad's `0x0100` precompile.
- Tested it end to end in a real browser (`test/live-passkey.mjs`): PRF stable per purpose and separated across
  purposes, and the registry verifies on Monad.

**Evidence**
- The demo take's passkey registration: https://testnet.monadvision.com/tx/0x175d59ba8721a332b7dd6ddd5bcdad91cabac8fe4f324705d1b28e086090d692
- An operator's registration and admission: https://testnet.monadvision.com/tx/0x3d763ead3bc5666292aaee48e38dfaa2071a74feb0d0be2d08354a6eb6b408fe,
  https://testnet.monadvision.com/tx/0x15b27d03781dcfb2f094fa74f77710a762746c014526bdcab6d0d96b5172ceed
- https://app.thenar.io/passkey ("Derive my SO-101 key"). The article:
  https://github.com/nickthelegend/thenar-monad/blob/main/docs/MERA.md. The demo video at 0:35–0:48.

## Optional promotion
### Promo video (≤ 30 s)
Upload `docs/demo/thenar-promo.mp4` (0:27), then paste the link.
### X link
**[you fill in]**
