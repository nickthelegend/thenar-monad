// The demo task: pick the cube, put it on the pad. Everything is in the arm's
// own frame (mm, Z up), parented to the arm, so it moves wherever the arm is put.
//
// Kinematic, not physical: the cube is held when the jaws close near it, and
// falls straight down when they open. Enough to make a recorded episode mean
// something ("success" is on the record), not a contact model.
import * as THREE from "three";

const SIZE = 28; // mm
const GRAB_MM = 32;
const CLOSE_DEG = 22, OPEN_DEG = 34;

export class Task {
  constructor(parent) {
    this.cubeStart = new THREE.Vector3(285, 90, SIZE / 2);
    this.goal = new THREE.Vector3(280, -105, 0);
    this.goalRadius = 42;

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(SIZE, SIZE, SIZE),
      new THREE.MeshStandardMaterial({ color: 0xe8543f, roughness: 0.45 }),
    );
    this.cube.castShadow = true;
    this.cube.receiveShadow = true;
    const pad = new THREE.Mesh(
      new THREE.CylinderGeometry(this.goalRadius, this.goalRadius, 2, 48),
      new THREE.MeshStandardMaterial({ color: 0x4fd18b, roughness: 0.6, transparent: true, opacity: 0.55 }),
    );
    pad.rotation.x = Math.PI / 2; // cylinder axis Y → Z
    pad.position.copy(this.goal).setZ(1);
    pad.receiveShadow = true;
    this.pad = pad;
    parent.add(this.cube, pad);

    this.others = new THREE.Group();
    parent.add(this.others);
    this.label = { pick: "cube", place: "pad" };

    this.placed = 0;
    this.reset();
  }

  /**
   * Stand in for a scanned table: the object to pick at its measured place and
   * colour, the target it goes on, and everything else as fixed obstacles.
   * Positions are the scan's millimetres in the arm frame.
   */
  setScene(scene) {
    if (!scene) {
      this.cubeStart.set(285, 90, SIZE / 2);
      this.goal.set(280, -105, 0);
      this.cube.material.color.set(0xe8543f);
      this.pad.material.color.set(0x4fd18b);
      this.label = { pick: "cube", place: "pad" };
      this.others.clear();
    } else {
      this.cubeStart.set(scene.pick.x_mm, scene.pick.y_mm, SIZE / 2);
      this.goal.set(scene.place.x_mm, scene.place.y_mm, 0);
      this.cube.material.color.set(scene.pick.colour ?? 0xe8543f);
      this.pad.material.color.set(scene.place.colour ?? 0x4fd18b);
      this.label = { pick: scene.pick.label, place: scene.place.label };
      this.others.clear();
      for (const o of scene.others ?? []) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(18, 18, 50, 24), new THREE.MeshStandardMaterial({ color: o.colour ?? 0x8a93a3, roughness: 0.6, transparent: true, opacity: 0.8 }));
        m.rotation.x = Math.PI / 2;
        m.position.set(o.x_mm, o.y_mm, 25);
        m.castShadow = true;
        this.others.add(m);
      }
    }
    this.pad.position.copy(this.goal).setZ(1);
    this.placed = 0;
    this.reset();
  }

  reset(start) {
    if (start) this.cubeStart.fromArray(start);
    this.cube.position.copy(this.cubeStart);
    this.cube.quaternion.identity();
    this.held = null;
    this.falling = 0;
    this.success = false;
  }

  /** Advance one frame. Returns true on the frame the cube lands on the pad. */
  step(tcp, gripDeg, dt) {
    const p = new THREE.Vector3().setFromMatrixPosition(tcp);
    if (this.held) {
      this.cube.matrix.multiplyMatrices(tcp, this.held);
      this.cube.matrix.decompose(this.cube.position, this.cube.quaternion, new THREE.Vector3());
      if (gripDeg > OPEN_DEG) {
        this.held = null;
        this.falling = 0.0001;
      }
      return false;
    }
    if (this.falling) {
      this.falling += dt * 9810; // mm/s
      this.cube.position.z = Math.max(SIZE / 2, this.cube.position.z - this.falling * dt);
      // Settle upright, square to the table.
      const e = new THREE.Euler().setFromQuaternion(this.cube.quaternion, "ZYX");
      this.cube.quaternion.setFromEuler(new THREE.Euler(0, 0, e.z, "ZYX"));
      if (this.cube.position.z <= SIZE / 2) {
        this.falling = 0;
        const onPad = Math.hypot(this.cube.position.x - this.goal.x, this.cube.position.y - this.goal.y) < this.goalRadius;
        if (onPad && !this.success) {
          this.success = true;
          this.placed++;
          return true;
        }
      }
      return false;
    }
    if (gripDeg < CLOSE_DEG && p.distanceTo(this.cube.position) < GRAB_MM) {
      this.cube.updateMatrix();
      this.held = new THREE.Matrix4().copy(tcp).invert().multiply(this.cube.matrix);
      this.success = false;
    }
    return false;
  }

  cubePose() {
    const c = this.cube;
    return [c.position.x, c.position.y, c.position.z].map((v) => +(v / 1000).toFixed(5)).concat(c.quaternion.toArray().map((v) => +v.toFixed(5)));
  }
  summary() {
    return { cubeStart: this.cubeStart.toArray(), cube: this.cubePose(), held: !!this.held, success: this.success, placed: this.placed };
  }
  status() {
    const { pick, place } = this.label;
    if (this.held) return `holding the ${pick}`;
    if (this.success) return `on the ${place} ✓ (${this.placed})`;
    return this.placed ? `placed ${this.placed}× · pick it again` : `pick the ${pick}, put it on the ${place}`;
  }
  /** Spectator: mirror the operator's cube. */
  apply(s) {
    if (!s?.cube) return;
    this.cube.position.set(s.cube[0] * 1000, s.cube[1] * 1000, s.cube[2] * 1000);
    this.cube.quaternion.set(s.cube[3], s.cube[4], s.cube[5], s.cube[6]);
    this.success = s.success;
    this.placed = s.placed;
    this.held = null;
  }
}
