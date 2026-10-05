# THENAR Quest: test plan

Every item says exactly what "correct" means. A pass is measured against that
definition, in a real browser (Claude in Chrome) against the running dev server
and station, on **Monad testnet (chain 10143)** with the live GRASP contracts.
Every item also requires a clean console and no failed requests, except where
the failure is the thing being tested.

Contracts: TaskRegistry `0xf99b…5d24`, GraspLog `0xe995…da6a`, LeafVerifier
`0x0d78…0356`, FoundryMarket `0x7350…65f3`.

Status: `PASS`, `FAIL → fixed → PASS`, or `UNTESTED (reason)`.

## A. Station API (`pnpm relay`, proxied at `/api`)

| # | Item | Correct means |
|---|---|---|
| A1 | `GET /api/station` | 200. `chainId` 10143, `block` > 0, `curator` is the deployer, `logSize` equals the on-chain head's size, `contracts` equal `.env.contracts` |
| A2 | Unknown route / wrong method | `GET /api/nope` → 404 `{error:"No such endpoint."}`. `DELETE /api/tasks` → 405 |
| A3 | Bad task requests | Non-JSON → 400 "not JSON". No scene → 400 "Not a scene from the scan page." Object beyond reach → 400 naming its mm. Reward over the cap → 400. No transaction in any case |
| A4 | Publish a scanned task | 201. `TaskRegistry.taskCount` +1 on chain. `taskAt(id).specHash` equals the returned hash and `curator` is the deployer. The tx succeeded on Monadscan |
| A5 | Publish the same scene again | 200 with `already: true`, the same id, and no new transaction |
| A6 | Bad episodes | Missing frames, unknown task, a bad address and another scene's recording are each refused (400/404) with a sentence. The log size is unchanged |
| A7 | Accepted episode | 201 `accepted: true`. The leaf is appended at the old log size. An anchor tx whose on-chain size is the new log size and whose root equals the local root. A bounty tx that raises the payee's balance by exactly the reward |
| A8 | Duplicate episode | 409, no transaction |
| A9 | Proof | `GET /api/episodes/:i/proof`. `LeafVerifier.verifyLeaf` on Monad returns true, called from the browser |
| A10 | Rejected episode | 201 `accepted: false` with a reason in mm. Logged with successFlag 0. No bounty |
| A11 | Teach | 409 with no accepted demo. 201 with grasp and release times after one. `skills/latest` returns it |
| A12 | Seal | Bad price → 400. Valid → 201, `corpusCount` +1 on chain, and `capTable` equals the contributors and weights |
| A13 | License | 201. A receipt on chain. Each contributor is paid `pool·w/Σw`. The buyer is topped up only when short |
| A14 | Export | A `.tar.gz` whose `meta/info.json` counts the accepted episodes, and whose data rows carry real joint angles |

## B. Scan page (`/scan.html`)

| # | Item | Correct means |
|---|---|---|
| B1 | Load | No console errors. The detector's wasm and model load (200) from this origin |
| B2 | Photo | Upload an image: it is drawn, the detector runs, objects are listed (or "No objects yet…") |
| B3 | Sheet | Crossed clicks are refused with the order to use. Correct clicks give "Sheet found", the arm-base marker, and mm positions |
| B4 | Add / remove | Clicking after the sheet adds an object with the typed label and a position. ✕ removes it |
| B5 | Reach | Objects outside 120–400 mm are greyed, and their Pick/Place are disabled |
| B6 | Publish | Choosing pick and place gives the task sentence. Publish → "Published on Monad as task #N" and a Monadscan link |
| B7 | Live camera | Start camera → video frames → Freeze → detection |

## C. Arm page, desktop (`/`)

| # | Item | Correct means |
|---|---|---|
| C1 | Load | No console errors with the station running. The arm is drawn. Station status shows the block and task count |
| C2 | Choose a task | The object and target stand at the scan's positions, in the scan's colours. The HUD and panel show the sentence |
| C3 | Payout address | An invalid address is refused with a sentence. A valid one is checksummed and survives a reload |
| C4 | Record → submit | The demo on a scanned task places the object. Submit → result card: accepted, anchor link, bounty link, "✓ LeafVerifier on Monad confirms" |
| C5 | Teach → repeat | Teach says which episode it learned from. Repeat moves the arm on its own and ends "put the … on the … ✓" |
| C6 | Repeat as data | Recording a repeat and submitting it → accepted, and "Taught repeats earn no bounty" |
| C7 | Controls | Home, replay and download all work |

## D. Headset path (Meta IWER emulator in Chrome, `?emulate`)

| # | Item | Correct means |
|---|---|---|
| D1 | Enter VR / MR | The session starts, and the HUD shows the task sentence |
| D2 | Teleop | Controller motion moves the gripper by the same amount (±5 mm). The trigger closes the jaws |
| D3 | Auto-submit | B stops a successful take → the HUD line says "Accepted … paid" |
| D4 | Repeat | Left-stick click runs the taught skill |

## E. Spectator (`?spectate`)

| # | Item | Correct means |
|---|---|---|
| E1 | Mirror | It shows the operator's scanned scene and pose, and settles on the operator's exact joints |

## F. Corpus page (`/corpus.html`)

| # | Item | Correct means |
|---|---|---|
| F1 | Episodes | The table lists leaves with anchor and bounty links. Verify → "✓ in anchor #N" from Monad |
| F2 | Seal | A corpus card with the on-chain cap table |
| F3 | License | A licence row naming what each contributor was paid, matching the chain |
| F4 | Export | The link downloads the dataset |

## G. Hardware relay

| # | Item | Correct means |
|---|---|---|
| G1 | Fake firmware | `pnpm test`: never arms without `--arm`; arms only from home; refuses a table pose; STOP on disconnect |
| G2 | Physical ESP32 + MG996R | Only with the arm built and calibrated |

## H. Real Quest 3S

| # | Item | Correct means |
|---|---|---|
| H1 | Quest browser | WebXR, passthrough and hand tracking on the device. Needs the headset connected |
