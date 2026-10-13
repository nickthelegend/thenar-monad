# Critique of `thenar-metropolis.mp4` (13 Oct cut, 2:51), as a Metropolis judge

Watched with the `watch` skill (21 keyframes) against its captions.

**Verdict: honest and real, but it does not show the product's full flow, and it breaks two of the format rules.**

## What breaks the rules or the brief
- **The intro is 38 s of slides** (0:00–0:38). The brief wants the problem and the user stated in under 15 s, over
  real app footage. A judge sees no product until 0:38.
- **The footage does not fill the frame.** The take sits at 80% inside black bands (1536×864), so the UI's text is
  small.
- **Captions are not opaque.** They are white text on a transparent band.

## What is missing from the flow
- **The lab side.** Nobody posts a task. Privy appears nowhere: there is no sign-in modal, and no lab budget in a
  Privy wallet funding a bounty. Yet Privy is our first "working" sponsor.
- **Mera's second half.** The passkey is made, but "Derive my SO-101 key" (the PRF key that commands the arm) is
  never shown.
- **The agent.** It is a CLI scroll only. The agent's signed trail on /agents (what it bought and why, signed with
  the key that paid) is never opened.
- **Chainlink CRE is only said.** The verdict on the corpus page and the CorpusAudit transaction are never on screen
  long enough to read.
- **The Monad-native proof is thin.** Executed and Final flash by, the receipt's Details (txpool status, block,
  finalized tag) stay closed, the gas line ("Monad charges the limit") is not shown, and the paid run is never opened
  on MonadVision.
- **No value at the end.** There is no "the operator now owns shares of the corpus" moment, and the THNRC line is
  never read.

## Dead air and pacing
- 0:38–0:42: the home page is still loading (blank) behind the first caption.
- 1:14–1:20: "Loading the arm…" before the station is ready.
- The /network scene starts on "paused · waiting for a block" before the data arrives.
- The emulated headset view is low and off-axis for the first seconds, and no controller or hand is visible. The
  drive reads as a camera, not a person.

## What works and should stay
- Every transaction is real and listed. The labels are honest: virtual authenticator, emulated headset, speed tags.
- The WebXR run itself: the arm follows the controller 1:1, and the run lands IN TOLERANCE.
- The receipt: executed 666 ms, final 791 ms, measured in the page.

## The rebuild
- **`thenar-demo.mp4` (≤ 3:00):** full-frame live footage from the first second. The lab posts a bounty through its
  Privy wallet, then the operator onboards with a Privy wallet, makes a passkey and derives the arm key, drives the
  lab's task in WebXR, gets paid, and opens the receipt details and MonadVision. Then: the dataset with its CRE verdict,
  the agent buying over x402 and its signed trail, and /network. It ends on what the operator owns.
- **`thenar-walkthrough.mp4` (4–5 min):** the same take, with every screen and the lab's and agent's sides explained.
- **`thenar-pitch.mp4` (≤ 2:00):** problem, why now, solution, why Monad, evidence (real txs), the ask.
