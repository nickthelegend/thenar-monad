// SO-101 kinematics on the manifest's own node tree.
//
// Every joint is a rotation about its node's local Z, in degrees, clamped to the
// manifest's limits: the same convention the robot studio draws with and the
// firmware's table guard checks against. Nothing here knows about meshes, so the
// solver runs identically in the headset, on the desktop and under `node --test`.
import * as THREE from "three";

const D2R = Math.PI / 180;

/** Build a bare Object3D tree from `arm.json`'s chain. Units stay in mm. */
export function buildChain(chain) {
  const root = new THREE.Object3D();
  root.name = "chain-root";
  const nodes = {};
  for (const n of chain) {
    const o = new THREE.Object3D();
    o.name = n.id;
    o.position.fromArray(n.position);
    o.rotation.set(n.rotation[0] * D2R, n.rotation[1] * D2R, n.rotation[2] * D2R);
    o.userData.joint = n.joint;
    nodes[n.id] = o;
    (n.parent ? nodes[n.parent] : root).add(o);
  }
  return { root, nodes };
}

export const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));

/**
 * One arm's joints: `jointNodes[i]` is the node joint i turns. The node's rest
 * rotation (always zero on joint nodes in this manifest) is kept, so the angle
 * is added rather than assigned.
 */
export class Joints {
  constructor(root, jointNodes, tcp, limits) {
    this.root = root;
    this.nodes = jointNodes;
    this.tcp = tcp;
    this.limits = limits;
    this.rest = jointNodes.map((n) => n.rotation.z);
    this.q = new Array(jointNodes.length).fill(0);
  }
  set(q) {
    for (let i = 0; i < this.nodes.length; i++) {
      this.q[i] = clamp(q[i], this.limits[i]);
      this.nodes[i].rotation.z = this.rest[i] + this.q[i] * D2R;
    }
    return this.q;
  }
  /** The TCP's pose in the root's frame (mm), written into `out`. */
  tcpPose(out = new THREE.Matrix4()) {
    this.root.updateMatrixWorld(true);
    const inv = _m.copy(this.root.matrixWorld).invert();
    return out.multiplyMatrices(inv, this.tcp.matrixWorld);
  }
}
const _m = new THREE.Matrix4();

// ---- inverse kinematics --------------------------------------------------

const _cur = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _tq = new THREE.Quaternion();
const _dq = new THREE.Quaternion();

/**
 * Pose error as a 6-vector: position (mm) then orientation as a rotation vector
 * scaled to mm by `orientWeight` (mm per radian). Orientation matters less than
 * position for a 5-DOF arm, which cannot reach every orientation anyway.
 */
function poseError(target, current, orientWeight, out) {
  target.decompose(_tp, _tq, _s);
  current.decompose(_p, _q, _s);
  out[0] = _tp.x - _p.x;
  out[1] = _tp.y - _p.y;
  out[2] = _tp.z - _p.z;
  _dq.copy(_tq).multiply(_q.invert());
  if (_dq.w < 0) _dq.set(-_dq.x, -_dq.y, -_dq.z, -_dq.w);
  const s = Math.sqrt(1 - Math.min(1, _dq.w * _dq.w));
  const angle = 2 * Math.acos(Math.min(1, _dq.w));
  const k = s < 1e-6 ? 2 : angle / s;
  out[3] = _dq.x * k * orientWeight;
  out[4] = _dq.y * k * orientWeight;
  out[5] = _dq.z * k * orientWeight;
  return out;
}

/** Solve A x = b for a small dense system, in place (Gaussian elimination). */
function solve(A, b, n) {
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r * n + c]) > Math.abs(A[p * n + c])) p = r;
    if (p !== c) {
      for (let k = 0; k < n; k++) [A[c * n + k], A[p * n + k]] = [A[p * n + k], A[c * n + k]];
      [b[c], b[p]] = [b[p], b[c]];
    }
    const d = A[c * n + c];
    if (Math.abs(d) < 1e-12) continue;
    for (let r = c + 1; r < n; r++) {
      const f = A[r * n + c] / d;
      if (!f) continue;
      for (let k = c; k < n; k++) A[r * n + k] -= f * A[c * n + k];
      b[r] -= f * b[c];
    }
  }
  for (let r = n - 1; r >= 0; r--) {
    let s = b[r];
    for (let k = r + 1; k < n; k++) s -= A[r * n + k] * b[k];
    const d = A[r * n + r];
    b[r] = Math.abs(d) < 1e-12 ? 0 : s / d;
  }
  return b;
}

/**
 * Damped-least-squares IK over the first `count` joints (the gripper is not
 * part of the reach). Mutates `joints` toward `target` (a Matrix4 in the root
 * frame, mm) and returns the residual position error in mm.
 */
export function solveIK(joints, target, { count = 5, iterations = 16, orientWeight = 60, lambda = 1.5, maxStepDeg = 6, tolMm = 0.5 } = {}) {
  const n = count;
  const e = new Float64Array(6);
  const e2 = new Float64Array(6);
  const J = new Float64Array(6 * n);
  const A = new Float64Array(36);
  const y = new Float64Array(6);
  const h = 0.25; // degrees, finite-difference step
  let posErr = Infinity;
  for (let it = 0; it < iterations; it++) {
    poseError(target, joints.tcpPose(_cur), orientWeight, e);
    posErr = Math.hypot(e[0], e[1], e[2]);
    if (posErr < tolMm && Math.hypot(e[3], e[4], e[5]) < tolMm) break;
    const q0 = joints.q.slice();
    for (let j = 0; j < n; j++) {
      const q = q0.slice();
      q[j] += h;
      joints.set(q);
      poseError(target, joints.tcpPose(_cur), orientWeight, e2);
      // d(error)/dq = -(d pose)/dq; J here is d(pose)/dq, per degree.
      for (let r = 0; r < 6; r++) J[r * n + j] = (e[r] - e2[r]) / h;
    }
    joints.set(q0);
    // (J Jᵀ + λ² I) y = e ;  dq = Jᵀ y
    for (let r = 0; r < 6; r++)
      for (let c = 0; c < 6; c++) {
        let s = r === c ? lambda * lambda : 0;
        for (let k = 0; k < n; k++) s += J[r * n + k] * J[c * n + k];
        A[r * 6 + c] = s;
      }
    y.set(e);
    solve(A, y, 6);
    const q = q0.slice();
    let biggest = 0;
    const dq = new Float64Array(n);
    for (let j = 0; j < n; j++) {
      for (let r = 0; r < 6; r++) dq[j] += J[r * n + j] * y[r];
      biggest = Math.max(biggest, Math.abs(dq[j]));
    }
    const scale = biggest > maxStepDeg ? maxStepDeg / biggest : 1;
    for (let j = 0; j < n; j++) q[j] += dq[j] * scale;
    joints.set(q);
  }
  poseError(target, joints.tcpPose(_cur), orientWeight, e);
  return Math.hypot(e[0], e[1], e[2]);
}
