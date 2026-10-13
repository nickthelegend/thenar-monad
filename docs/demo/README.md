# Thenar videos (Monad Metropolis)

| File | Length | What it is |
|---|---|---|
| `thenar-demo.mp4` | 2:58 | **The demo to submit.** The whole flow, live on Monad testnet |
| `thenar-pitch.mp4` | 1:54 | **The pitch.** Problem, why now, solution, why Monad, evidence, the ask |
| `thenar-walkthrough.mp4` | 4:52 | **The full walkthrough.** The same take, every screen explained, the lab's side included |
| `*.srt` | | Captions for each, timed from ElevenLabs' word timestamps |
| `VIDEO-CRITIQUE.md` | | Why the 13 Oct cut was replaced |
| `thenar-metropolis.mp4` | 2:51 | The 13 Oct cut, superseded |

All three are 1920×1080 (H.264 + AAC, −16 LUFS), with opaque captions burned in, the ElevenLabs voice "Eric" and no
GitHub URL.

## The take

One take, recorded on 14 Oct 2026 against **https://app.thenar.io on Monad testnet**. Playwright drove a headed
Chromium, and a visible cursor glides to every click. Every transaction in it is real:

| Step | Who | Transaction |
|---|---|---|
| A lab posts bounty task #13 from its **Privy** server wallet. The policy then refuses a send anywhere else (`policy_violation`) | Privy wallet `0xeD2f…0454` | [`0x8dc67558…2138c`](https://testnet.monadvision.com/tx/0x8dc67558b4a17ccbd2d3c85f13b723082ac2ba2e19e5922ddf78289c5ca2138c) |
| Operator's passkey registered (**Mera**, P-256 precompile); the arm key derived from its PRF | `0x5feE…28a9` | [`0x175d59ba…d692`](https://testnet.monadvision.com/tx/0x175d59ba8721a332b7dd6ddd5bcdad91cabac8fe4f324705d1b28e086090d692) |
| Paid run on task #13, driven in WebXR, score 74.32: executed 1.09 s and final 1.21 s from the send | `0x5feE…28a9` | [`0x909f2c23…0d59`](https://testnet.monadvision.com/tx/0x909f2c23ccae46476bbf18f55fb0a7e85d56a0cf23a642f47ea2375f0eda0d59) |
| An agent buys task #13's corpus over **x402** (SalesLog checks the sha256) | agent `0x9a6C…63aA` | [`0x16eedac1…86281`](https://testnet.monadvision.com/tx/0x16eedac1431a7533415cfa6866abe764ef5d1d22aa1cfffb5b8fb1ad1f686281) |
| **Chainlink CRE** audits tasks 0, 12 and 13 ("uncommitted": served, but no root committed) and writes to CorpusAudit | CRE key `0x4d9e…DAb2` | [`0xf1546ec9…a5f72`](https://testnet.monadvision.com/tx/0xf1546ec91261ed5ec2750f58a71a37d0d7a1405f21c3fd057b4af921f73a5f72) |

**Labelled on screen, because each one is not a person on real hardware:**
- **The wallet.** A fresh team wallet, injected as a browser wallet, signs in Node. In production an operator
  signs in by email through Privy.
- **The passkey.** Chromium's virtual authenticator stands in for Face ID.
- **The headset.** WebXR with Meta's emulator (IWER) stands in for a Quest 3S, and Playwright scripts the
  controller's path. It is never called a real headset.
- **The terminals.** The Privy lab, the agent and the CRE run are real commands. Their output is drawn in the browser
  as it arrived.
- **CRE.** It ran through `cre workflow simulate --broadcast`, not a deployed DON. That needs CRE deploy access.
- **Speed.** Scenes played faster than real time carry a "×N SPEED" tag. Timers on the receipt are never sped up.

**The numbers in the pitch:**
- 7 paid runs and 5 agent sales;
- 2 Privy bounties;
- 13 contracts, all verified.

Our team seeded all of them on 13–14 Oct (see [../evidence/seed-13oct.md](../evidence/seed-13oct.md)), and the pitch
says so.

**A real Quest 3S capture can be dropped in.** Put it at `video/quest/quest-3s.mp4` (MP4, H.264, 30–60 s, 1920×1080
preferred). The walkthrough then adds a 28 s scene tagged "REAL QUEST 3S" before its outro.

## Rebuild

From the repo root, with `ELEVENLABS_API_KEY` set:

```
RECORDER_KEY=.data/recorder-N.key node --import ./test/register.mjs video/capture.mjs   # the live take: ~0.07 MON, 0.01 USDC, one Privy bounty
python3 video/cut.py video/cuts/demo.json         # voice, timeline, captions (also pitch.json, walkthrough.json)
node video/render.mjs overlay2 video/work/demo/overlay.json video/work/demo/overlay
python3 video/assemble_cut.py demo
```
