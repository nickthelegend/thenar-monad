# Thenar demo video (Monad Metropolis)

| File | What it is |
|---|---|
| `thenar-metropolis.mp4` | **The cut to submit.** 2:51, 1920×1080, H.264 + AAC, −16 LUFS, captions burned in |
| `thenar-metropolis.srt` | The same captions, timed from ElevenLabs' word timestamps |

**0:00–0:38, intro.** Motion graphics in Thenar's own type and colours, with the ElevenLabs voice "Eric". It covers
the problem, the product and why Monad. The arm clip is the site's own hero footage.

**0:38–2:46, the live demo.** One take, recorded on 13 Oct 2026 against **https://app.thenar.io on Monad testnet**.
Playwright drove a headed Chromium, and a visible cursor glides to every click. Every transaction is real:

| Step | Transaction |
|---|---|
| Passkey registered (PasskeyRegistry) | [`0xc4a29225…62a6e`](https://testnet.monadvision.com/tx/0xc4a29225e367538a37ebb2cd6f90cd9effdb9ee29a78cd3cbb4161dda0062a6e) |
| Paid run, task 0, score 85.14: executed 666 ms and final 791 ms from the send | [`0x7731ed0b…26c42`](https://testnet.monadvision.com/tx/0x7731ed0b7b69d170b34cd94244cad8567efa9e301d179c6d7511143c68726c42) |
| Agent buys the corpus over x402 | [`0xe7bb8511…4df21`](https://testnet.monadvision.com/tx/0xe7bb85114eb202acb175b9fa6742a62af0e833021ac94bc9e91efed995c4df21) |

**What is labelled on screen, and why:**
- **The wallet.** A fresh team wallet, `0x6F76…1d77` (`.data/recorder-3.key`), is injected as a browser wallet and signs
  in Node. The app signs it in the way it signs in any injected wallet. Privy's email login is not shown.
- **The passkey.** Chromium's virtual authenticator stands in for Face ID: a full WebAuthn implementation. The tag
  reads "PASSKEY: CHROMIUM VIRTUAL AUTHENTICATOR".
- **The headset.** The run is driven in **WebXR with Meta's emulator (IWER) standing in for a Quest 3S.** The
  controller's path is scripted by Playwright. Tagged "WEBXR · EMULATED HEADSET (IWER) · LIVE MONAD TESTNET". It is
  not called a real headset.
- **The agent shot.** A terminal drawn in the browser shows the real `scripts/agent-buy.mjs` output, line by line as
  it arrived.
- **Speed.** Scenes played faster than real time say so ("1.3× SPEED" and similar). The receipt's timers are
  never sped up: they are numbers the page measured.

**Takes that are not in the cut** (also on chain):
- Take 1: passkey `0xd4ff622a…`, paid run [`0x1fa25a4f…11851`](https://testnet.monadvision.com/tx/0x1fa25a4fddea76ce7f4804f5d60869bf22cac9da169f0e67783ee3fb85911851) (executed 663 ms, final 1.00 s), and agent sale `0x8c26a07a…`. It was recorded at 1920 CSS px, which was too small to read.
- Take 2: passkey `0x48ba4e24…`. The verifier refused its run because it was 0.2 mm from take 1's route, which is
  the duplicate rule working.

**A real Quest 3S capture can be dropped in.** Put it at `video/quest/quest-3s.mp4` (MP4, H.264, 30–60 s, 1920×1080
preferred). The cut then adds a 28 s scene tagged "REAL QUEST 3S" after the paid run, and stays under 3:00.

## Rebuild

From the repo root, with `ELEVENLABS_API_KEY` set:

```
node --import ./test/register.mjs video/capture.mjs   # the live take (spends ~0.07 MON + 0.01 USDC)
python3 video/tts.py && python3 video/timeline.py
node video/render.mjs intro video/work/intro.json video/work/intro
node video/render.mjs outro video/work/outro.json video/work/outro
node video/render.mjs overlay video/work/overlay.json video/work/overlay
python3 video/assemble.py
```

The pipeline is adapted from `clockin/videos/_pipeline`, for landscape web capture, with ElevenLabs in place of
Kokoro.
