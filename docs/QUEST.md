# The station in a headset, and tasks scanned from a real table

## A Quest 3 / 3S on the station

Open any task's station in the Quest browser. Two buttons appear in the corner
of the scene when the browser has WebXR:

- **Enter on your table** — mixed reality. The bench sits on your real table, in passthrough.
- **Enter in VR** — the modelled room.

The bench is placed a forearm ahead of you on entry. Rest the right controller on
your real table and press **B** to stand the arm exactly there.

| Controller | |
|---|---|
| **Grip** (hold) | take hold of the arm: the tool follows your hand, millimetre for millimetre |
| **Trigger** | close the jaws, as far as it is pulled |
| **A** (or **X**) | begin a run, or end the one in progress |
| **B** | put the bench where this controller rests |
| **Stick** | nudge the tool one axis at a time |

| Hands | |
|---|---|
| **Left pinch** (hold) | take hold of the arm; it follows your right hand |
| **Right thumb to index** | the jaws |

The panel above the bench shows the task, the run and what to press. Take the headset
off to submit: a run is paid from your wallet like any other, after the same
World ID check, and recorded in the same shape as one driven from a keyboard.

### Reaching the dev server from the headset

WebXR needs a secure origin. Over USB, with developer mode on the headset:

```bash
adb reverse tcp:3334 tcp:3334
pnpm exec next dev --port 3334
```

Then open `http://localhost:3334/station/0` in the Quest browser. A deployed site
(HTTPS) needs nothing.

## Scanning a task from a real table (`/post`)

1. Lay a sheet of A4 flat in front of the arm, long side pointing away, near edge
   centred 9 cm ahead of the base.
2. **Scan with a camera**: start the camera and freeze a frame, or upload a photo.
3. Click the sheet's corners (near left, near right, far right, far left). Every
   object on the table now has a position in millimetres in the arm's frame.
4. The on-device detector (MediaPipe EfficientDet-Lite0, served from this site)
   names what it recognises; click the picture to add anything it missed.
5. Choose **Move** and **Onto**.

The measured positions go into the task's name on chain:

`Put the glass on the plate [scan 199,35 > 309,-52]`

- `lib/scan.ts` parses that tag.
- `lib/bench.ts` `goalFor` / `startFor` read it.
- The station draws the payload where it really stood.
- `/api/sign` scores the run against where its target really is, read from the task on chain, never from the request.
- A task without the tag keeps the bench's shared start and goal, and scores exactly as before.

## Teach and repeat (station sidebar)

- **Teach** learns from the best paid run on the task, fetched through `/api/dataset`: the same export a buyer downloads.
- **Repeat alone** runs the arm by itself. The demonstration is bent to this scene's start and goal (`lib/teach.ts`).
- A repeat is practice only: it is never submitted and never paid.

## The SO-101 (MG996R) as a second arm

The SO-101, built with MG996R servos, is the default arm: every single-arm
task runs on it. A name tagged `[arm thenar6]`, or a task that needs two arms,
runs on the THENAR-6. `/post` writes the tag either way, so a task's arm never
depends on the default. The tag sits next to any scan tag:

`Put the glass on the plate [arm so101] [scan 199,35 > 309,-52]`

- `lib/scan.ts` reads the tags. `lib/hooks.ts` shapes every task into `name`
  (the sentence), `chainName` (the name exactly as stored), `arm` and `scanned`.
  Scoring always reads `chainName`.
- `lib/so101-spec.ts` is the follower chain from thenar-arms' assembly manifest.
  `lib/so101.ts` solves it: damped least squares, gripper down, limits enforced.
  `public/models/so101-mg996r.glb` is built from the same manifest.
- The station draws `components/station/so101-arm.tsx` for an SO-101 task. It
  records the arm's own five joints and the jaw (radians) and its own tool
  position. Grasp, placement and score are the same bench.
- Replays, teach (`lib/teach.ts`) and the coherence check (`lib/coherence.ts`)
  read the joints back through the arm that made them (`lib/embodiment.ts`).
  Dataset exports carry `embodiment`, `arm` and `joint_names`.
- `/spec/so101` is the arm on its own: drive the gripping point and read the
  solved joints.

### Mirroring onto a real SO-101

```bash
node scripts/arm-relay.mjs --follower /dev/cu.usbserial-XXXX --arm
```

Then press **Mirror to my SO-101** on an SO-101 task's station or on
`/spec/so101`.

The relay speaks thenar-arms' firmware protocol: `Q q0 … q5`, `ARM`, `STOP`,
and `L …` from a leader given with `--leader`. It listens on 127.0.0.1 and
refuses pages from other websites. It never arms without `--arm`, and then only
from home. The page holds home, then eases to the pose on screen.

The relay also refuses:

- any pose outside the joint limits
- any pose that would put the gripper or the wrist into the table

It sends STOP when the page stops streaming. `test/arm-relay.test.mjs` checks
all of this against a pseudo-terminal that answers like the firmware
(`test/fake-follower.py`). `test/live-so101.mjs` drives `/spec/so101` in a real
browser through the relay.

## Real props

Seventeen props are photoscans from [Poly Haven](https://polyhaven.com), all
CC0. Their entries in `public/props/index.json` carry a `source` field;
`cad/props.py` leaves those alone when it regenerates the procedural set.
`scripts/real-props.mjs` converts a scan into the props' convention: metres,
Z up, standing on z = 0, centred on its footprint, with 512 px JPEG textures.
The previews on `/post` and `/inventory` are stills drawn by one shared
offscreen renderer (`components/model-stage.tsx`), so the library can grow
without running into the browser's WebGL context limit.
