// THENAR Quest: drive an SO-101 (MG996R follower R3) from a Quest 3S.
//
// One page, four ways in:
//   desktop        orbit the arm, drag the gizmo, run the scripted demo
//   Enter MR/VR    the arm on your table (passthrough) or in a studio;
//                  squeeze to take hold of it, trigger closes the gripper
//   ?spectate      a second screen that mirrors whatever the headset is doing
//   ?emulate       Meta's WebXR emulator, to test the headset path on a Mac
//
// The arm is the thenar-arms CAD (scripts/build-models.mjs); its node tree is
// the joint tree, so the pose on screen is the pose the firmware would be sent.
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import { XRControllerModelFactory } from "three/addons/webxr/XRControllerModelFactory.js";
import { XRHandModelFactory } from "three/addons/webxr/XRHandModelFactory.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { Joints, solveIK } from "./kinematics.js";
import { Recorder, stateAt, download } from "./recorder.js";
import { Link } from "./link.js";
import { Hud } from "./hud.js";
import { Task } from "./task.js";
import "./style.css";

const params = new URLSearchParams(location.search);
const SPECTATE = params.has("spectate");
if (params.has("emulate")) await installEmulator();

const $ = (s) => document.querySelector(s);
const D2R = Math.PI / 180;
const ONE = new THREE.Vector3(1, 1, 1);
// Gripper joint 5: 0° is jaws shut, 70° wide open (the manifest's range).
const GRIP_OPEN = 60, GRIP_SHUT = 0;
const TABLE_Z_MM = 14; // the TCP never goes below this, in the arm's frame
const STATE_HZ = 30;

// ---- scene -----------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
renderer.xr.setFoveation(0.5);
$("#app").prepend(renderer.domElement);

const scene = new THREE.Scene();
const BG = new THREE.Color("#0d1017");
scene.background = BG;
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.7;

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.01, 50);
camera.position.set(0.6, 1.1, 0.02);

scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.1));
const sun = new THREE.DirectionalLight(0xffffff, 2.4);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
Object.assign(sun.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 4 });
sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);

// Where the arm stands. In MR you put this on your real table with A.
const anchor = new THREE.Group();
anchor.position.set(0, 0.74, -0.2);
scene.add(anchor);
sun.target = anchor;
sun.position.set(-0.6, 2.2, 0.8);

// Studio: floor and a desk, hidden in passthrough. The desk follows the arm.
const studio = new THREE.Group();
const desk = new THREE.Group();
{
  const floor = new THREE.Mesh(new THREE.CircleGeometry(6, 64), new THREE.MeshStandardMaterial({ color: 0x1a1f29, roughness: 0.95 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const top = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.03, 0.75), new THREE.MeshStandardMaterial({ color: 0xd9d4ca, roughness: 0.75 }));
  top.position.set(0, 0.725, -0.15);
  top.receiveShadow = true;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.6, metalness: 0.4 });
  for (const [x, z] of [[-0.5, -0.48], [0.5, -0.48], [-0.5, 0.18], [0.5, 0.18]]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.71, 0.04), legMat);
    leg.position.set(x, 0.355, z);
    leg.castShadow = true;
    desk.add(leg);
  }
  desk.add(top);
  const grid = new THREE.GridHelper(12, 48, 0x2c3444, 0x222835);
  grid.position.y = 0.001;
  studio.add(floor, grid, desk);
}
scene.add(studio);
// The desk top sits 0.74 m up; keep it under the base wherever the arm is put.
function syncDesk() {
  desk.position.set(anchor.position.x, anchor.position.y - 0.74, anchor.position.z);
  desk.rotation.y = anchor.rotation.y;
}

// In passthrough the arm still needs a shadow, or it floats.
const shadowCatcher = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), new THREE.ShadowMaterial({ opacity: 0.35 }));
shadowCatcher.rotation.x = -Math.PI / 2;
shadowCatcher.position.y = 0.0005;
shadowCatcher.receiveShadow = true;
shadowCatcher.visible = false;
anchor.add(shadowCatcher);

// anchor → facing (arm reaches along the anchor's -Z) → zup (the CAD is mm, Z up)
const facing = new THREE.Group();
facing.rotation.y = Math.PI / 2;
anchor.add(facing);
const zup = new THREE.Group();
zup.rotation.x = -Math.PI / 2;
zup.scale.setScalar(0.001);
facing.add(zup);

// The leader stands beside the follower, the way the two sit on a bench.
const leaderMount = new THREE.Group();
leaderMount.position.set(-0.36, 0, 0.12);
leaderMount.visible = params.has("leader");
anchor.add(leaderMount);
const leaderFacing = facing.clone(false);
leaderMount.add(leaderFacing);
const leaderZup = zup.clone(false);
leaderFacing.add(leaderZup);

// ---- arms -------------------------------------------------------------------

const arm = await (await fetch("./models/arm.json")).json();
const loader = new GLTFLoader();

async function loadArm(robot, parent) {
  const spec = arm.robots[robot];
  const gltf = await loader.loadAsync(`./models/${spec.file}`, (e) => progress(robot, e));
  const root = gltf.scene;
  const nodes = {};
  root.traverse((o) => {
    nodes[o.name] = o;
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  parent.add(root);
  const joints = new Joints(root, spec.joints.map((j) => nodes[j.id]), nodes[spec.tcp], arm.limits);
  joints.set(arm.home);
  return joints;
}
const loads = {};
function progress(robot, e) {
  loads[robot] = e.total ? e.loaded / e.total : 0;
  const v = Object.values(loads);
  $("#load-bar").value = (v.reduce((a, b) => a + b, 0) / 2) * 100;
}
const [follower, leader] = await Promise.all([loadArm("follower", zup), loadArm("leader", leaderZup)]);
$("#loading").hidden = true;

// ---- target, task ------------------------------------------------------------

// The IK target lives in world space so the desktop gizmo and a controller can
// both hold it. A small tri-axis marker; red line to the TCP when out of reach.
const target = new THREE.Group();
{
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.012, 20, 12), new THREE.MeshBasicMaterial({ color: 0xf2b845, transparent: true, opacity: 0.55, depthTest: false }));
  ball.renderOrder = 5;
  const axes = new THREE.AxesHelper(0.05);
  axes.material.depthTest = false;
  axes.renderOrder = 5;
  target.add(ball, axes);
}
scene.add(target);
const reachLine = new THREE.Line(
  new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]),
  new THREE.LineBasicMaterial({ color: 0xff5a4f, depthTest: false }),
);
reachLine.renderOrder = 6;
reachLine.frustumCulled = false;
scene.add(reachLine);

const task = new Task(zup);

// Spectator only: a ghost of the operator's headset and right hand, so a room
// watching the second screen can see who is moving the arm, and how.
const ghost = new THREE.Group();
{
  const mat = new THREE.MeshStandardMaterial({ color: 0xe9e9ee, roughness: 0.4, transparent: true, opacity: 0.85 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.1, 0.1), mat);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.07, 0.01), new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.2 }));
  visor.position.z = -0.052;
  head.add(visor);
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.03, 20, 12), new THREE.MeshStandardMaterial({ color: 0xf2b845, roughness: 0.4 }));
  ghost.add(head, hand);
  ghost.userData = { head, hand };
  ghost.visible = false;
  scene.add(ghost);
}
function placeGhost(part, pose) {
  if (!pose) return (part.visible = false);
  part.visible = true;
  const local = new THREE.Matrix4().compose(new THREE.Vector3(pose[0] * 1000, pose[1] * 1000, pose[2] * 1000), new THREE.Quaternion(pose[3], pose[4], pose[5], pose[6]), ONE);
  armToWorld(local, _m).decompose(part.position, part.quaternion, _s);
}

// ---- state ------------------------------------------------------------------

const recorder = new Recorder({ fps: 30, robot: "so101-mg996r-r3", jointNames: arm.jointNames });
const episodes = [];
let source = "idle"; // idle | desktop | controller | hand | leader | replay | demo | remote | sliders
let ikError = 0;
let grip = arm.home[5];
let replay = null; // { episode, t0 }
let demo = null; // { t0 }
let leaderStream = null; // { q, at }
let remote = null; // spectator: last operator state
let motionScale = 1;
const q = [...arm.home];

const link = new Link(SPECTATE ? "spectator" : "operator");
let relay = { follower: null, leader: null, clients: 0 };
link.on("status", (m) => {
  relay = m;
  renderPanel();
});
link.on("leader", (m) => (leaderStream = { q: m.q, at: performance.now() }));
link.on("saved", (m) => toast(`Saved on the Mac: ${m.file}`));
link.on("state", (m) => {
  if (SPECTATE) remote = { ...m, at: performance.now() };
});
link.on("status:link", () => renderPanel());

// ---- helpers ----------------------------------------------------------------

const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3();
const _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4();

/** A world matrix, re-expressed in the follower's own frame (mm, no scale). */
function worldToArm(world, out = new THREE.Matrix4()) {
  follower.root.updateMatrixWorld(true);
  out.copy(follower.root.matrixWorld).invert().multiply(world);
  out.decompose(_p, _q, _s);
  return out.compose(_p, _q, ONE);
}
function armToWorld(local, out = new THREE.Matrix4()) {
  follower.root.updateMatrixWorld(true);
  out.multiplyMatrices(follower.root.matrixWorld, local);
  out.decompose(_p, _q, _s);
  return out.compose(_p, _q, ONE);
}
function tcpWorld(out = new THREE.Matrix4()) {
  return armToWorld(follower.tcpPose(_m2), out);
}
function snapTargetToTcp() {
  tcpWorld(_m).decompose(target.position, target.quaternion, _s);
}
function setPose(next) {
  for (let i = 0; i < 6; i++) q[i] = next[i];
  follower.set(q);
  q.splice(0, 6, ...follower.q);
}
/** Pose tuple in the arm frame, metres: [x, y, z, qx, qy, qz, qw]. */
function armPose(worldMatrix) {
  worldToArm(worldMatrix, _m).decompose(_p, _q, _s);
  return [_p.x / 1000, _p.y / 1000, _p.z / 1000, _q.x, _q.y, _q.z, _q.w].map((v) => +v.toFixed(5));
}

function solveToTarget() {
  target.updateMatrixWorld(true);
  const local = worldToArm(target.matrixWorld, _m);
  local.decompose(_p, _q, _s);
  if (_p.z < TABLE_Z_MM) _p.z = TABLE_Z_MM;
  local.compose(_p, _q, ONE);
  ikError = solveIK(follower, local);
  q.splice(0, 5, ...follower.q.slice(0, 5));
  return ikError;
}

// ---- desktop controls -------------------------------------------------------

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(-0.12, 0.84, -0.4);
orbit.enableDamping = true;
orbit.update();

const gizmo = new TransformControls(camera, renderer.domElement);
gizmo.setSize(0.8);
gizmo.setSpace("local");
let dragging = false;
gizmo.addEventListener("dragging-changed", (e) => {
  orbit.enabled = !e.value;
  dragging = e.value;
  if (dragging) stopAuto();
});
if (!SPECTATE) {
  gizmo.attach(target);
  scene.add(gizmo.getHelper());
}

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
addEventListener("keydown", (e) => {
  if (e.target.closest?.("input,select,textarea")) return;
  if (e.key === "w") gizmo.setMode("translate");
  else if (e.key === "e") gizmo.setMode("rotate");
  else if (e.key === " ") {
    e.preventDefault();
    toggleRecord();
  } else if (e.key === "h") goHome();
  else if (e.key === "p") startReplay();
  else if (e.key === "d") toggleDemo();
  else if (e.key === "[") setGrip(grip - 10);
  else if (e.key === "]") setGrip(grip + 10);
});

function setGrip(v) {
  grip = THREE.MathUtils.clamp(v, ...arm.limits[5]);
}
function stopAuto() {
  replay = null;
  demo = null;
}
function goHome() {
  stopAuto();
  setPose(arm.home);
  grip = arm.home[5];
  snapTargetToTcp();
}

// ---- record & replay --------------------------------------------------------

function toggleRecord() {
  if (SPECTATE) return;
  if (recorder.recording) {
    const ep = recorder.stop();
    if (ep) {
      ep.task = task.summary();
      episodes.push(ep);
      link.send({ type: "episode", episode: ep }) || toast(`Episode ${episodes.length} kept in this tab (relay offline)`);
    }
    buzz(0.8, 80);
  } else {
    stopAuto();
    task.reset();
    recorder.start({ input: source === "hand" ? "quest-hand" : xrMode() ? "quest-controller" : "desktop", xr: xrMode() || "none" });
    buzz(0.8, 80);
  }
  renderPanel();
}
function startReplay() {
  const ep = episodes.at(-1);
  if (!ep) return toast("Record an episode first (B in the headset, space here).");
  if (recorder.recording) return;
  demo = null;
  replay = { episode: ep, t0: performance.now() };
  task.reset(ep.task?.cubeStart);
}
function toggleDemo() {
  if (demo) return (demo = null);
  replay = null;
  task.reset();
  demo = { t0: performance.now() };
}

// A scripted pick and place, in the arm's frame: the kinematic demo for a
// screen with no headset, and a check that the task logic works end to end.
function demoPose(t) {
  const c = task.cubeStart, g = task.goal;
  const down = (x, y) => new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, 0)).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.atan2(y, x)));
  const keys = [
    [0, [c.x, c.y, 120], GRIP_OPEN],
    [1.4, [c.x, c.y, 120], GRIP_OPEN],
    [2.4, [c.x, c.y, 22], GRIP_OPEN],
    [3.0, [c.x, c.y, 22], GRIP_SHUT],
    [3.9, [c.x, c.y, 130], GRIP_SHUT],
    [5.4, [g.x, g.y, 130], GRIP_SHUT],
    [6.3, [g.x, g.y, 36], GRIP_SHUT],
    [6.9, [g.x, g.y, 36], GRIP_OPEN],
    [7.8, [g.x, g.y, 140], GRIP_OPEN],
    [9.0, [g.x, g.y, 140], GRIP_OPEN],
  ];
  const T = keys.at(-1)[0];
  if (t > T) return null;
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1][0] < t) i++;
  const [ta, pa, ga] = keys[i], [tb, pb, gb] = keys[i + 1];
  const k = THREE.MathUtils.smootherstep(t, ta, tb);
  const p = new THREE.Vector3(...pa).lerp(new THREE.Vector3(...pb), k);
  return { pose: new THREE.Matrix4().compose(p, down(p.x, p.y), ONE), grip: ga + (gb - ga) * k };
}

// ---- XR -----------------------------------------------------------------------

const controllers = [0, 1].map((i) => {
  const ray = renderer.xr.getController(i);
  const grip = renderer.xr.getControllerGrip(i);
  const hand = renderer.xr.getHand(i);
  const c = { i, ray, grip, hand, source: null, prev: [] };
  ray.addEventListener("connected", (e) => (c.source = e.data));
  ray.addEventListener("disconnected", () => (c.source = null));
  scene.add(ray, grip, hand);
  return c;
});
const controllerModels = new XRControllerModelFactory();
const handModels = new XRHandModelFactory();
for (const c of controllers) {
  c.grip.add(controllerModels.createControllerModel(c.grip));
  c.hand.add(handModels.createHandModel(c.hand, "mesh"));
}
const hud = new Hud({ jointNames: arm.jointNames, limits: arm.limits });
scene.add(hud.mesh);
hud.mesh.visible = false;

let clutch = null; // { ctrl0: Matrix4 world, tgt0: Matrix4 world, by: 'controller'|'hand' }
let pinch = { left: false, right: false };

function xrMode() {
  const s = renderer.xr.getSession();
  if (!s) return null;
  return s.environmentBlendMode && s.environmentBlendMode !== "opaque" ? "mr" : "vr";
}
const byHand = (h) => controllers.find((c) => c.source?.handedness === h);
function pressed(c, b) {
  return !!c?.source?.gamepad?.buttons[b]?.pressed;
}
function edge(c, b) {
  const now = pressed(c, b);
  const was = c.prev[b] ?? false;
  c.prev[b] = now;
  return now && !was;
}
function buzz(intensity, ms, hand = "right") {
  const h = byHand(hand)?.source?.gamepad?.hapticActuators?.[0];
  h?.pulse?.(intensity, ms);
}

async function enterXR(mode) {
  const type = mode === "mr" ? "immersive-ar" : "immersive-vr";
  const session = await navigator.xr.requestSession(type, {
    requiredFeatures: ["local-floor"],
    optionalFeatures: ["hand-tracking", "layers"],
  });
  renderer.xr.setReferenceSpaceType("local-floor");
  await renderer.xr.setSession(session);
  const mr = mode === "mr";
  scene.background = mr ? null : BG;
  studio.visible = !mr;
  shadowCatcher.visible = mr;
  hud.mesh.visible = true;
  gizmo.getHelper().visible = false;
  placeInFrontOfHead = true;
  session.addEventListener("end", () => {
    scene.background = BG;
    studio.visible = true;
    shadowCatcher.visible = false;
    hud.mesh.visible = false;
    gizmo.getHelper().visible = !SPECTATE;
    clutch = null;
    anchor.position.set(0, 0.74, -0.2);
    anchor.rotation.set(0, 0, 0);
    renderPanel();
  });
  renderPanel();
}
let placeInFrontOfHead = false;

function placeAnchorFromHead() {
  const head = renderer.xr.getCamera();
  head.getWorldPosition(_p);
  head.getWorldDirection(_s);
  _s.y = 0;
  _s.normalize();
  const yaw = Math.atan2(-_s.x, -_s.z);
  // In VR the desk is a desk (0.74 m). In MR guess a table ~0.5 m below the
  // eyes until A puts the base on the real one.
  const y = xrMode() === "mr" ? Math.max(0.4, _p.y - 0.5) : 0.74;
  anchor.position.set(_p.x + _s.x * 0.42, y, _p.z + _s.z * 0.42);
  anchor.rotation.set(0, yaw, 0);
}

function handPinch(c, finger = "index-finger-tip") {
  const j = c?.hand?.joints;
  if (!j?.["thumb-tip"] || !j[finger]) return null;
  return j["thumb-tip"].position.distanceTo(j[finger].position);
}

function pollXR() {
  const right = byHand("right");
  const left = byHand("left");
  const rightHand = right?.source?.hand;
  const leftHand = left?.source?.hand;

  // Buttons (controllers only). A place · B record · X replay · Y home.
  if (right && !rightHand) {
    if (edge(right, 4)) {
      // Rest the controller on the table where the base should stand, press A.
      right.grip.getWorldPosition(_p);
      right.grip.getWorldQuaternion(_q);
      _s.set(0, 0, -1).applyQuaternion(_q);
      anchor.position.set(_p.x, _p.y - 0.035, _p.z);
      anchor.rotation.set(0, Math.atan2(-_s.x, -_s.z), 0);
      snapTargetToTcp();
      buzz(0.5, 40);
    }
    if (edge(right, 5)) toggleRecord();
    // Thumbstick while not holding the arm: turn it, raise or lower it.
    const ax = right.source.gamepad.axes;
    if (!clutch && ax.length >= 4) {
      if (Math.abs(ax[2]) > 0.25) anchor.rotation.y -= ax[2] * 0.02;
      if (Math.abs(ax[3]) > 0.25) anchor.position.y -= ax[3] * 0.002;
    }
  }
  if (left && !leftHand) {
    if (edge(left, 4)) startReplay();
    if (edge(left, 5)) goHome();
    if (edge(left, 1)) leaderMount.visible = !leaderMount.visible;
    const ax = left.source.gamepad.axes;
    if (ax.length >= 4 && Math.abs(ax[3]) > 0.5) motionScale = THREE.MathUtils.clamp(motionScale - ax[3] * 0.01, 0.3, 1.5);
  }

  // Hands: left pinch holds the arm, the right hand is the gripper.
  if (rightHand) {
    const d = handPinch(right) ?? 0.1;
    pinch.right = pinch.right ? d < 0.035 : d < 0.02;
    grip = THREE.MathUtils.clamp(THREE.MathUtils.mapLinear(d, 0.015, 0.09, GRIP_SHUT, GRIP_OPEN), GRIP_SHUT, GRIP_OPEN);
  }
  if (leftHand) {
    const d = handPinch(left) ?? 0.1;
    pinch.left = pinch.left ? d < 0.035 : d < 0.02;
  }

  const holdingController = right && !rightHand && pressed(right, 1);
  const holdingHand = rightHand && pinch.left;
  const holding = holdingController || holdingHand;

  if (holding && !replay && !demo) {
    const ctrlWorld = new THREE.Matrix4();
    if (holdingController) ctrlWorld.copy(right.grip.matrixWorld);
    else {
      const j = right.hand.joints;
      _p.copy(j["thumb-tip"].position).lerp(j["index-finger-tip"].position, 0.5);
      right.hand.localToWorld(_p);
      j["wrist"].getWorldQuaternion(_q);
      ctrlWorld.compose(_p, _q, ONE);
    }
    if (!clutch) {
      snapTargetToTcp();
      target.updateMatrixWorld(true);
      clutch = { ctrl0: ctrlWorld.clone(), tgt0: target.matrixWorld.clone(), by: holdingController ? "controller" : "hand" };
      buzz(0.3, 30);
    }
    // target = tgt0 moved by the controller's motion since the squeeze.
    const c0p = new THREE.Vector3(), c0q = new THREE.Quaternion(), cp = new THREE.Vector3(), cq = new THREE.Quaternion(), tp = new THREE.Vector3(), tq = new THREE.Quaternion();
    clutch.ctrl0.decompose(c0p, c0q, _s);
    ctrlWorld.decompose(cp, cq, _s);
    clutch.tgt0.decompose(tp, tq, _s);
    tp.add(cp.sub(c0p).multiplyScalar(motionScale));
    tq.premultiply(cq.multiply(c0q.invert()));
    target.position.copy(tp);
    target.quaternion.copy(tq);
    source = clutch.by;
  } else if (clutch) {
    clutch = null;
  }

  if (right && !rightHand) {
    const t = right.source.gamepad.buttons[0]?.value ?? 0;
    grip = GRIP_OPEN + (GRIP_SHUT - GRIP_OPEN) * t;
  }
}

// ---- frame ------------------------------------------------------------------

let lastState = 0, lastFrame = performance.now(), fps = 72, lastLimitBuzz = 0;

renderer.setAnimationLoop((time, frame) => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  fps = fps * 0.95 + (1 / Math.max(1e-3, dt)) * 0.05;
  lastFrame = now;

  if (frame && placeInFrontOfHead) {
    placeAnchorFromHead();
    placeInFrontOfHead = false;
    snapTargetToTcp();
  }

  const leaderFresh = leaderStream && now - leaderStream.at < 300;
  source = "idle";

  if (SPECTATE) {
    if (remote && now - remote.at < 1000) {
      setPose(remote.q);
      source = "remote";
      if (remote.task) task.apply(remote.task);
      ghost.visible = remote.source === "controller" || remote.source === "hand" || !!remote.hand;
      placeGhost(ghost.userData.head, remote.head);
      placeGhost(ghost.userData.hand, remote.hand);
    }
  } else if (replay) {
    const t = (now - replay.t0) / 1000;
    setPose(stateAt(replay.episode, t));
    grip = q[5];
    source = "replay";
    if (t > replay.episode.duration_s + 0.5) replay = null;
  } else if (demo) {
    const d = demoPose((now - demo.t0) / 1000);
    if (!d) {
      demo = null;
    } else {
      target.position.setFromMatrixPosition(armToWorld(d.pose, _m));
      target.quaternion.setFromRotationMatrix(_m);
      grip = d.grip;
      solveToTarget();
      source = "demo";
    }
  } else if (leaderFresh) {
    // A physical leader outranks everything a hand can do in the air.
    setPose(leaderStream.q);
    grip = q[5];
    source = "leader";
  } else {
    if (renderer.xr.isPresenting) pollXR();
    if (dragging) source = "desktop";
    if (source === "controller" || source === "hand" || source === "desktop") {
      const before = follower.q.slice(0, 5);
      solveToTarget();
      const atLimit = follower.q.some((v, i) => i < 5 && (v <= arm.limits[i][0] + 0.3 || v >= arm.limits[i][1] - 0.3));
      if (atLimit && now - lastLimitBuzz > 250 && before.some((v, i) => v !== follower.q[i])) {
        buzz(0.6, 20);
        lastLimitBuzz = now;
      }
    }
  }
  if (source !== "replay" && source !== "leader" && source !== "remote") q[5] = grip;
  follower.set(q);
  leader.set(leaderFresh ? leaderStream.q : q);

  // Idle: the marker rests on the gripper, so the next squeeze starts from there.
  if (source === "idle" || source === "replay" || source === "leader" || source === "remote") snapTargetToTcp();

  // Reach line: only when the solver cannot get there.
  const tcp = tcpWorld(_m);
  const showLine = ikError > 8 && (source === "controller" || source === "hand" || source === "desktop");
  reachLine.visible = showLine;
  if (showLine) {
    const pos = reachLine.geometry.attributes.position;
    _p.setFromMatrixPosition(tcp);
    pos.setXYZ(0, _p.x, _p.y, _p.z);
    pos.setXYZ(1, target.position.x, target.position.y, target.position.z);
    pos.needsUpdate = true;
  }

  // The task: a cube to pick and a pad to put it on.
  if (!SPECTATE) {
    const placed = task.step(follower.tcpPose(_m2), q[5], dt);
    if (placed) {
      toast("Placed on the pad ✓");
      buzz(1, 120);
    }
  }

  const camPose = renderer.xr.isPresenting ? renderer.xr.getCamera() : camera;
  if (!SPECTATE && now - lastState > 1000 / STATE_HZ) {
    lastState = now;
    camPose.updateMatrixWorld(true);
    const right = byHand("right");
    link.send({
      type: "state",
      t: now / 1000,
      q: q.map((v) => +v.toFixed(3)),
      source,
      head: armPose(camPose.matrixWorld),
      hand: right ? armPose(right.grip.matrixWorld) : null,
      task: task.summary(),
    });
  }
  if (recorder.recording) {
    camPose.updateMatrixWorld(true);
    target.updateMatrixWorld(true);
    const right = byHand("right");
    recorder.tick({
      "observation.state": q.map((v) => +v.toFixed(3)),
      action: q.map((v) => +v.toFixed(3)),
      "observation.tcp": armPose(tcp),
      "observation.cube": task.cubePose(),
      target: armPose(target.matrixWorld),
      head: armPose(camPose.matrixWorld),
      controller: renderer.xr.isPresenting && right ? armPose(right.grip.matrixWorld) : null,
      source,
    });
  }

  if (renderer.xr.isPresenting) {
    // The panel floats above and behind the arm, turned to face you.
    const head = renderer.xr.getCamera();
    head.getWorldPosition(_p);
    anchor.localToWorld(hud.mesh.position.set(-0.36, 0.2, 0.02));
    hud.mesh.lookAt(_p);
    hud.draw({
      q,
      source,
      recording: recorder.recording,
      recordSeconds: recorder.elapsed,
      replaying: !!replay,
      ikError,
      fps,
      episodes: episodes.length,
      linkLabel: linkLabel(),
      linkColor: link.status === "online" ? (relay.follower?.armed ? "amber" : "green") : "dim",
      hint: clutch
        ? "Holding the arm · trigger closes the gripper · let go to stop"
        : byHand("right")?.source?.hand
          ? "Pinch with your LEFT hand to hold the arm · your right hand is the gripper"
          : "Squeeze GRIP to hold · A place on table · B record · X replay · Y home",
    });
  } else {
    orbit.update();
  }
  syncDesk();
  if (now - lastPanel > 150) updateReadout();
  renderer.render(scene, camera);
});

// ---- 2D panel -------------------------------------------------------------------

let lastPanel = 0;
function linkLabel() {
  if (link.status !== "online") return "RELAY OFF";
  if (relay.follower?.armed) return "ARM LIVE";
  if (relay.follower) return "ARM READY";
  return "RELAY";
}
function renderPanel() {
  const xr = renderer.xr.isPresenting;
  $("#rec").textContent = recorder.recording ? "Stop recording" : "Record";
  $("#rec").classList.toggle("live", recorder.recording);
  $("#episodes").textContent = episodes.length ? `${episodes.length} recorded` : "none yet";
  $("#download").disabled = !episodes.length;
  $("#relay-state").textContent =
    link.status !== "online"
      ? "Relay not running. The arm still works here; start `pnpm relay` on the Mac for hardware and a second screen."
      : `Relay online · ${relay.clients} connected${relay.leader ? " · leader streaming" : ""}${relay.follower ? (relay.follower.armed ? " · follower ARMED" : " · follower connected, disarmed") : ""}`;
  $("#relay-dot").className = "dot " + (link.status === "online" ? "on" : "");
  $("#xr-state").textContent = xr ? `In ${xrMode() === "mr" ? "mixed reality" : "VR"}` : "";
}
function updateReadout() {
  lastPanel = performance.now();
  $("#joints").innerHTML = arm.jointNames
    .map((n, i) => `<div class="row"><span>${n}</span><b>${q[i].toFixed(1)}°</b></div>`)
    .join("");
  $("#source").textContent = source;
  $("#reach").textContent = `${ikError.toFixed(1)} mm`;
  $("#task-state").textContent = task.status();
  if (recorder.recording) $("#rec").textContent = `Stop · ${recorder.elapsed.toFixed(1)}s`;
}
function toast(msg) {
  const t = $("#toast");
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (t.hidden = true), 3200);
}

async function setupXRButtons() {
  const xr = navigator.xr;
  const [vr, ar] = xr ? await Promise.all([xr.isSessionSupported("immersive-vr").catch(() => false), xr.isSessionSupported("immersive-ar").catch(() => false)]) : [false, false];
  $("#enter-mr").disabled = !ar;
  $("#enter-vr").disabled = !vr;
  if (!vr && !ar)
    $("#xr-note").textContent = window.isSecureContext
      ? "No headset here. Open this page in the Quest browser, or add ?emulate to try it with Meta's emulator."
      : "WebXR needs HTTPS or localhost. Use the https:// address `pnpm dev` prints.";
  $("#enter-mr").onclick = () => enterXR("mr").catch((e) => toast(e.message));
  $("#enter-vr").onclick = () => enterXR("vr").catch((e) => toast(e.message));
}
$("#rec").onclick = toggleRecord;
$("#replay").onclick = startReplay;
$("#home").onclick = goHome;
$("#demo").onclick = toggleDemo;
$("#show-leader").checked = leaderMount.visible;
$("#show-leader").onchange = (e) => (leaderMount.visible = e.target.checked);
$("#download").onclick = () => episodes.forEach((ep, i) => download(ep, `thenar-episode-${i + 1}.json`));
$("#mode").textContent = SPECTATE ? "Spectating the headset" : "Operator";
document.body.classList.toggle("spectate", SPECTATE);
if (SPECTATE) {
  $("#app").classList.add("spectator");
}
setupXRButtons();
renderPanel();
snapTargetToTcp();

// Handles for scripted checks (and curious people with a console open).
window.thenar = { arm, follower, leader, q, target, task, episodes, recorder, setPose, solveToTarget, toggleDemo, toggleRecord, startReplay, get source() { return source; }, get ikError() { return ikError; } };

// ---- emulator -------------------------------------------------------------------

async function installEmulator() {
  const { XRDevice, metaQuest3 } = await import("iwer");
  const device = new XRDevice(metaQuest3);
  // Chrome on a Mac ships a navigator.xr with no device behind it; replace it.
  device.installRuntime({ forceInstall: true });
  // ?emulate=bare leaves the controllers to scripts (the DevUI owns their poses).
  if (params.get("emulate") !== "bare") {
    const { DevUI } = await import("@iwer/devui");
    device.installDevUI(DevUI);
  }
  if (params.get("emulate") === "mr") {
    const { SyntheticEnvironmentModule } = await import("@iwer/sem");
    device.installSEM(SyntheticEnvironmentModule);
    device.sem?.loadDefaultEnvironment?.("office_small");
  }
  window.xrDevice = device;
}
