# THENAR Quest

Drive an SO-101 arm from a Meta Quest 3S. The arm is the **MG996R follower R3**
from [thenar-arms](https://github.com/nickthelegend/thenar-arms), assembled from
its own CAD. You take hold of it with a controller or your bare hand, it follows,
and every take is recorded as an episode.

It runs in the Quest browser (WebXR). There is no APK and no sideloading. It
works without the headset too:

| Where | What you get |
|---|---|
| **Quest 3S · mixed reality** | the arm on your real table, in passthrough, casting a shadow |
| **Quest 3S · VR** | the arm on a desk in a studio |
| **Mac browser** | the same arm; drag the gizmo, or run the pick-and-place demo |
| **Mac `?spectate`** | a second screen that mirrors the headset live, with a ghost of the operator's head and hand. Record this one for the video |
| **Mac `?emulate`** | Meta's WebXR emulator, to try the headset controls without a headset |

The physical arm is optional. With `pnpm relay --follower …` the same joint
angles go to the ESP32 over the firmware protocol thenar-arms already defines.

## Run it

```sh
pnpm install                  # from the repo root
cd apps/quest
pnpm dev                      # https://<your-mac>:5174
pnpm relay                    # second terminal: headset ⇄ second screen, episodes to disk
```

### On the Quest 3S, over Wi-Fi

1. Put the Mac and the Quest on the same network.
2. In the Quest browser, open the `https://192.168.x.x:5174` address that `pnpm dev`
   prints. The certificate is self-signed, so pick **Advanced → Proceed**.
3. Press **Enter mixed reality**. Press **A** once to stand the arm on your table
   (see the controls below).

### On the Quest 3S, over USB (no certificate prompt)

This needs developer mode on the headset.

```sh
adb reverse tcp:5174 tcp:5174
HTTP=1 pnpm dev
```

Then open `http://localhost:5174` in the Quest browser.

### Record the demo video

- **Headset view:** use the Meta button → Camera → **Record video**. It captures
  the passthrough and the arm together.
- **Second screen:** open `https://localhost:5174/?spectate` on the Mac and
  screen-record it.

## Controls

| Quest controllers | |
|---|---|
| **Right grip** (hold) | take hold of the arm; the gripper follows your hand, with rotation, from where it was |
| **Right trigger** | close the gripper (analog) |
| **A** | rest the controller on the table where the base should be, then press |
| **Right stick** | turn the arm · raise or lower it |
| **B** | record / stop |
| **X** · **Y** | replay the last episode · home |
| **Left grip** | show / hide the AS5600 leader beside it |
| **Left stick ↕** | motion scale, 0.3× (fine) to 1.5× |

| Hands | |
|---|---|
| **Left pinch** (hold) | take hold of the arm; it follows your right hand |
| **Right thumb to index** | gripper opening: pinch to close |

On the desktop: drag the gizmo (**W** move, **E** rotate). **Space** records,
**P** replays, **H** goes home, **D** runs the demo, **[ ]** work the gripper.

The haptics buzz when you take hold, when a joint reaches its limit, and when
the cube lands on the pad.

## The task

There is a red cube and a green pad. Pick up the cube and put it on the pad.
The grasp is kinematic: the cube is held when the jaws close within 32 mm of
it, and it drops straight down when they open. It is not a contact simulation.
It is enough to give each episode a success flag.

## Episodes

When the relay is running, each episode is saved to `apps/quest/episodes/*.json`.
Otherwise it stays in the page (use **Download**). The field names follow
LeRobot:

```jsonc
{
  "format": "thenar-quest-episode/1", "robot": "so101-mg996r-r3", "fps": 30,
  "joint_names": ["Base rotation", "Shoulder", "Elbow", "Wrist pitch", "Wrist roll", "Gripper / trigger"],
  "input": "quest-controller", "task": { "success": true, "cubeStart": [285, 90, 14] },
  "frames": [{
    "t": 0.033,
    "observation.state": [6 joint angles, deg],
    "action":            [6 joint angles, deg],
    "observation.tcp":   [x, y, z, qx, qy, qz, qw],   // gripper, arm base frame, m
    "observation.cube":  [x, y, z, qx, qy, qz, qw],
    "target": [...], "head": [...], "controller": [...], "source": "controller"
  }]
}
```

There is one sample per rendered frame, capped at 30 Hz. A Quest runs at 72 Hz,
so episodes come out at a steady 30 Hz.

## The real arm (optional)

```sh
pnpm relay --leader /dev/cu.usbserial-LEADER            # the leader drives both arms on screen
pnpm relay --follower /dev/cu.usbserial-FOLLOWER        # targets go out; the follower stays disarmed
pnpm relay --follower /dev/cu.usbserial-FOLLOWER --arm  # it may arm once you press Y (home)
```

The relay speaks the thenar-arms firmware protocol unchanged (`firmware/thenar`):

- The leader prints `L q0 … q5`.
- The follower takes `Q q0 … q5`, `ARM` and `STOP`.
- The follower stops itself if a target is more than 250 ms old.

On top of that, the relay:

- never arms without `--arm`, and with it arms only from the home pose, as
  `bridge.py` does
- refuses any pose that would put the gripper or wrist into the table, with a
  kinematic check in the base frame
- sends `STOP` when the headset disconnects or goes quiet
- lets a physical leader, when one is present, override the headset

The firmware ships with `FOLLOWER_CALIBRATED = false`, so it refuses `ARM` until
someone calibrates the servo pulses. That is deliberate. Calibrate unloaded, and
support the arm against gravity.

## The models

`public/models/{follower,leader}.glb` are built from the thenar-arms assembly
manifest. The script places every STL where the robot studio places it, merges
each link by material, and simplifies the result to about 65k triangles (follower)
and 108k (leader). Each GLB's node tree is the joint tree, and the joints turn
about their local Z, as in the studio and the firmware.

```sh
# with thenar-arms cloned next to this repo
pnpm models
```

`arm.json` carries the joint limits, the home pose, the bare kinematic chain and
the SHA-256 of the manifest it came from.

## Tests

```sh
pnpm test   # IK accuracy; relay mirroring, episode saving and the hardware path against a fake firmware on a pty
pnpm e2e    # headless Chromium: demo → spectator mirror → saved episode; VR teleop under the emulator
```

What these show:

- The solver recovers 40 of 40 reachable poses to within 2 mm.
- A controller move of (−90, 60, −90) mm moves the gripper by the same amount,
  to within 2.3 mm, in emulated VR.
- The relay never arms without `--arm`, and never sends a table-colliding pose.

What they do not show: a real Quest 3S session (the emulator stands in for one),
and powered hardware. The servo arm is still an unvalidated thenar-arms prototype,
so no payload or fit claims are made here.
