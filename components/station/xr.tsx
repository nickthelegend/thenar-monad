"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { cn } from "@/lib/cn";

/**
 * Stand in the room the run is recorded in — or bring the bench into yours.
 *
 * The scene is at true scale (metres, 408 mm of reach), which is what a
 * headset is for. In VR the operator stands behind the arm; in mixed reality
 * (a Quest 3 or 3S) the bench sits on their real table, in passthrough.
 *
 * The controller is not a joystick here. Squeeze the grip and the arm's tool
 * follows the controller's own motion, millimetre for millimetre, until you
 * let go; the trigger closes the jaws as far as it is pulled. Hands work too:
 * pinch with the left to take hold, and the right hand's thumb and index
 * finger are the jaws. All of it lands on the same target and the same jaw
 * opening the keyboard drives, so a run recorded in a headset is the same
 * shape of trajectory as one recorded at a desk, scored by the same verifier.
 */

/** What the headset asks of the rig this frame, in the arm's own Z-up metres. */
export const xrInput = {
  delta: [0, 0, 0] as [number, number, number],
  /** Jaw opening in mm while a controller or hand owns the jaws, else null. */
  grip: null as number | null,
};

/** Session state other components read without re-rendering: the room is
 *  hidden in passthrough, and the page writes the headset panel's lines. */
export const xrState = {
  mode: null as "vr" | "mr" | null,
  hud: [] as string[],
};

/** One page-level action for the headset's A button: begin a run, or end one. */
export const XR_ACTION = "thenar:xr";

const GRIP_OPEN_MM = 42;
const GRIP_SHUT_MM = 6;
const DEADZONE = 0.55;
const REPEAT_MS = 180;

function tap(key: string) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
  setTimeout(() => window.dispatchEvent(new KeyboardEvent("keyup", { key, bubbles: true, cancelable: true })), 90);
}

/** three.js world (Y up) to the arm's frame (Z up): x stays, y is -z, z is y. */
const toArm = (d: THREE.Vector3): [number, number, number] => [d.x, -d.z, d.y];

type XRFrameLike = XRFrame & { getJointPose?: (j: XRJointSpace, s: XRSpace) => XRJointPose | undefined };

/**
 * Put the bench where the operator can work it: a forearm ahead of the eyes,
 * the table half a metre below them, facing along the arm's reach. Done by
 * offsetting the reference space, so the scene itself never moves and every
 * recorded coordinate stays in the arm's frame.
 */
function placeFromViewer(base: XRReferenceSpace, viewer: XRPose): XRReferenceSpace {
  const p = viewer.transform.position, o = viewer.transform.orientation;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
  fwd.y = 0;
  fwd.normalize();
  // The desired eye: 0.30 m behind the base, 0.50 m above the table, looking
  // along the arm's +x (three's +x).
  const eye = new THREE.Vector3(-0.3, 0.5, 0);
  // Rotation taking three's +x onto the viewer's forward.
  const yaw = Math.atan2(-fwd.z, fwd.x);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  const pos = new THREE.Vector3(p.x, p.y, p.z).sub(eye.clone().applyQuaternion(q));
  return base.getOffsetReferenceSpace(new XRRigidTransform({ x: pos.x, y: pos.y, z: pos.z }, { x: q.x, y: q.y, z: q.z, w: q.w }));
}

/** Put the arm's base where a controller rests on a real table, facing where it points. */
function placeAtController(base: XRReferenceSpace, grip: XRPose): XRReferenceSpace {
  const p = grip.transform.position, o = grip.transform.orientation;
  const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion(o.x, o.y, o.z, o.w));
  fwd.y = 0;
  fwd.normalize();
  const yaw = Math.atan2(-fwd.z, fwd.x);
  const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
  // The grip sits ~35 mm above the table when the controller rests on it.
  return base.getOffsetReferenceSpace(new XRRigidTransform({ x: p.x, y: p.y - 0.035, z: p.z }, { x: q.x, y: q.y, z: q.z, w: q.w }));
}

/**
 * Read the controllers and hands each frame. Lives inside the Canvas because
 * in a session the frame loop is the headset's, and only there is the pose
 * of the frame about to be drawn available.
 */
export function XRControls() {
  const { gl, scene } = useThree();
  const baseSpace = useRef<XRReferenceSpace | null>(null);
  const placed = useRef(false);
  const clutch = useRef<THREE.Vector3 | null>(null);
  const prev = useRef<Record<string, boolean>>({});
  const nextAt = useRef(0);
  const pinch = useRef({ left: false, right: false });
  const markers = useRef<THREE.Group>(null);
  // The panel is made and owned outside render: it is a canvas and a GPU
  // texture, which a render pass must neither create nor mutate.
  const hudRef = useRef<Hud | null>(null);
  useEffect(() => {
    const h = new Hud();
    hudRef.current = h;
    scene.add(h.mesh);
    return () => {
      scene.remove(h.mesh);
      h.dispose();
      hudRef.current = null;
    };
  }, [scene]);

  useFrame((state, _dt, xrFrame) => {
    const frame = xrFrame as XRFrameLike | undefined;
    const hud = hudRef.current;
    const session = gl.xr.getSession?.();
    if (!session || !frame) {
      placed.current = false;
      baseSpace.current = null;
      clutch.current = null;
      xrInput.grip = null;
      if (hud) hud.mesh.visible = false;
      if (markers.current) markers.current.visible = false;
      return;
    }
    const ref = gl.xr.getReferenceSpace();
    if (!ref) return;
    baseSpace.current ??= ref;

    // First frame of a session: bring the bench in front of the operator.
    if (!placed.current) {
      const viewer = frame.getViewerPose(baseSpace.current);
      if (viewer) {
        gl.xr.setReferenceSpace(placeFromViewer(baseSpace.current, viewer));
        placed.current = true;
      }
      return;
    }

    const edge = (key: string, now: boolean) => {
      const was = prev.current[key] ?? false;
      prev.current[key] = now;
      return now && !was;
    };

    let held: THREE.Vector3 | null = null; // where the operator's holding hand is, this frame
    let jaws: number | null = null;
    let left: XRInputSource | undefined, right: XRInputSource | undefined;
    for (const s of session.inputSources) {
      if (s.handedness === "left") left = s;
      else if (s.handedness === "right") right = s;
    }
    if (markers.current) markers.current.visible = true;
    const mk = markers.current?.children ?? [];

    // --- controllers --------------------------------------------------------------
    if (right && !right.hand && right.gripSpace) {
      const pose = frame.getPose(right.gripSpace, ref);
      const pad = right.gamepad;
      if (pose && pad) {
        const p = pose.transform.position;
        mk[0]?.position.set(p.x, p.y, p.z);
        if (pad.buttons[1]?.pressed) held = new THREE.Vector3(p.x, p.y, p.z);
        jaws = GRIP_OPEN_MM + (GRIP_SHUT_MM - GRIP_OPEN_MM) * (pad.buttons[0]?.value ?? 0);
        // A begins or ends a run; B puts the bench where this controller rests.
        if (edge("a", !!pad.buttons[4]?.pressed)) window.dispatchEvent(new CustomEvent(XR_ACTION, { detail: "primary" }));
        if (edge("b", !!pad.buttons[5]?.pressed) && baseSpace.current) {
          const base = frame.getPose(right.gripSpace, baseSpace.current);
          if (base) gl.xr.setReferenceSpace(placeAtController(baseSpace.current, base));
          clutch.current = null;
        }
        // The stick still nudges, one axis at a time, for the last millimetre.
        const now = performance.now();
        if (!held && now >= nextAt.current) {
          const x = pad.axes[2] ?? 0, y = pad.axes[3] ?? 0;
          if (Math.abs(x) > Math.abs(y) && Math.abs(x) > DEADZONE) {
            tap(x > 0 ? "d" : "a");
            nextAt.current = now + REPEAT_MS;
          } else if (Math.abs(y) > DEADZONE) {
            tap(y > 0 ? "s" : "w");
            nextAt.current = now + REPEAT_MS;
          }
        }
      }
    }
    if (left && !left.hand && left.gamepad) {
      const pose = left.gripSpace && frame.getPose(left.gripSpace, ref);
      if (pose) mk[1]?.position.set(pose.transform.position.x, pose.transform.position.y, pose.transform.position.z);
      // X is the same primary action, for a left-handed operator.
      if (edge("x", !!left.gamepad.buttons[4]?.pressed)) window.dispatchEvent(new CustomEvent(XR_ACTION, { detail: "primary" }));
    }

    // --- hands ----------------------------------------------------------------------
    const tips = (src: XRInputSource | undefined) => {
      if (!src?.hand || !frame.getJointPose) return null;
      const t = src.hand.get("thumb-tip"), i = src.hand.get("index-finger-tip");
      const a = t && frame.getJointPose(t, ref), b = i && frame.getJointPose(i, ref);
      if (!a || !b) return null;
      const A = new THREE.Vector3(a.transform.position.x, a.transform.position.y, a.transform.position.z);
      const B = new THREE.Vector3(b.transform.position.x, b.transform.position.y, b.transform.position.z);
      return { mid: A.clone().lerp(B, 0.5), gap: A.distanceTo(B) };
    };
    const lh = tips(left), rh = tips(right);
    if (lh) pinch.current.left = pinch.current.left ? lh.gap < 0.035 : lh.gap < 0.02;
    if (rh) {
      mk[0]?.position.copy(rh.mid);
      jaws = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(rh.gap, 0.015, 0.09, GRIP_SHUT_MM, GRIP_OPEN_MM), GRIP_SHUT_MM, GRIP_OPEN_MM);
      if (pinch.current.left) held = rh.mid;
    }

    // --- the clutch: while held, the tool moves as the hand moves --------------------
    if (held) {
      if (clutch.current) {
        const d = toArm(held.clone().sub(clutch.current));
        xrInput.delta[0] += d[0];
        xrInput.delta[1] += d[1];
        xrInput.delta[2] += d[2];
      }
      clutch.current = held;
    } else {
      clutch.current = null;
    }
    xrInput.grip = jaws;

    // --- the panel: above and left of the base, turned to face the operator ----------
    if (!hud) return;
    hud.mesh.visible = true;
    hud.mesh.position.set(0.02, 0.36, -0.3);
    const eye = new THREE.Vector3();
    state.camera.getWorldPosition(eye);
    hud.mesh.lookAt(eye);
    hud.draw([
      ...xrState.hud,
      held ? "HOLDING — the tool follows your hand" : right?.hand ? "Pinch with your LEFT hand to take hold" : "Squeeze GRIP to take hold · trigger closes the jaws",
      "A: begin / end run · B: put the bench where this controller rests",
    ]);
  });

  return (
    <>
      <group ref={markers} visible={false}>
        {/* Where each hand is, so the operator can see what they are driving
            with. Plain shapes: the controller models live on a CDN this
            site's security policy does not allow. */}
        <mesh><sphereGeometry args={[0.012, 16, 12]} /><meshStandardMaterial color="#E8B04A" /></mesh>
        <mesh><sphereGeometry args={[0.012, 16, 12]} /><meshStandardMaterial color="#7FA6F0" /></mesh>
      </group>
    </>
  );
}

/** The in-headset panel: one canvas texture on one plane, redrawn a few times a second. */
class Hud {
  canvas = document.createElement("canvas");
  texture: THREE.CanvasTexture;
  mesh: THREE.Mesh;
  last = 0;
  constructor() {
    this.canvas.width = 1024;
    this.canvas.height = 420;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, (0.34 * 420) / 1024),
      new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false }),
    );
    this.mesh.visible = false;
    this.mesh.renderOrder = 10;
  }
  draw(lines: string[]) {
    const now = performance.now();
    if (now - this.last < 120) return;
    this.last = now;
    const c = this.canvas.getContext("2d")!;
    c.clearRect(0, 0, 1024, 420);
    c.fillStyle = "rgba(14,14,14,0.88)";
    c.fillRect(0, 0, 1024, 420);
    c.strokeStyle = "rgba(242,238,230,0.25)";
    c.lineWidth = 3;
    c.strokeRect(1.5, 1.5, 1021, 417);
    c.fillStyle = "#E8B04A";
    c.font = "600 30px ui-monospace, Menlo, monospace";
    c.fillText("THENAR · STATION", 36, 58);
    lines.slice(0, 6).forEach((l, i) => {
      c.fillStyle = i === 0 ? "#F2EEE6" : "#B8B2A8";
      c.font = `${i === 0 ? "600 30px" : "500 26px"} ui-sans-serif, system-ui, sans-serif`;
      let t = l;
      while (t.length > 1 && c.measureText(t).width > 950) t = t.slice(0, -2);
      c.fillText(t === l ? t : t + "…", 36, 118 + i * 50);
    });
    this.texture.needsUpdate = true;
  }
  dispose() {
    this.texture.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.geometry.dispose();
  }
}

/**
 * Offer the headset, when there is one: VR, and mixed reality where the
 * browser can composite with passthrough (Quest 3 and 3S).
 *
 * Rendered outside the Canvas, because a button inside a WebGL scene is not
 * reachable before the session starts. Absent entirely on a device with no
 * headset rather than shown disabled.
 */
export function EnterXR({ gl, className }: { gl: THREE.WebGLRenderer | null; className?: string }) {
  const [modes, setModes] = useState<{ vr: boolean; mr: boolean } | null>(null);
  const [inSession, setInSession] = useState<"vr" | "mr" | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const t = setTimeout(() => {
      const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
      if (!xr?.isSessionSupported) return setModes({ vr: false, mr: false });
      Promise.all([xr.isSessionSupported("immersive-vr").catch(() => false), xr.isSessionSupported("immersive-ar").catch(() => false)])
        .then(([vr, mr]) => live && setModes({ vr, mr }));
    }, 0);
    return () => { live = false; clearTimeout(t); };
  }, []);

  if (!modes || (!modes.vr && !modes.mr) || !gl) return null;

  const enter = async (mode: "vr" | "mr") => {
    setFailed(null);
    const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!xr) return;
    try {
      const session = await xr.requestSession(mode === "mr" ? "immersive-ar" : "immersive-vr", {
        requiredFeatures: ["local-floor"],
        optionalFeatures: ["hand-tracking", "bounded-floor"],
      });
      Object.assign(gl.xr, { enabled: true });
      gl.xr.setReferenceSpaceType("local-floor");
      await gl.xr.setSession(session as never);
      xrState.mode = mode;
      setInSession(mode);
      session.addEventListener("end", () => {
        xrState.mode = null;
        xrInput.grip = null;
        setInSession(null);
      });
    } catch (e) {
      setFailed(e instanceof Error ? e.message : "The headset refused the session.");
    }
  };

  const button = (mode: "vr" | "mr", label: string) => (
    <button
      type="button"
      onClick={() => enter(mode)}
      disabled={!!inSession}
      className={cn(
        "border px-3 py-2 font-mono text-[12px] uppercase tracking-[0.12em] transition-colors",
        inSession === mode ? "border-signal text-signal" : "border-rule-strong bg-ink-1/80 text-scribe hover:border-signal hover:text-signal",
      )}
    >
      {inSession === mode ? "In the headset" : label}
    </button>
  );

  return (
    <div className={cn("flex flex-col items-end gap-1", className)}>
      <div className="flex gap-2">
        {modes.mr ? button("mr", "Enter on your table") : null}
        {modes.vr ? button("vr", "Enter in VR") : null}
      </div>
      {failed ? <p className="font-mono text-[12px] text-reject">{failed}</p> : null}
    </div>
  );
}
