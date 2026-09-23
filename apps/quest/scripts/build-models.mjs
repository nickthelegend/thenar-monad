// Build the Quest's arm models from the thenar-arms CAD.
//
//   node scripts/build-models.mjs <path to thenar-arms/robot-studio/public/models/so101>
//
// Reads the assembly manifest the robot studio already draws from, places every
// STL instance on its kinematic node exactly as the studio does, merges each
// node's parts by material, simplifies them to a budget a Quest 3S can draw at
// 72 Hz, and writes one GLB per robot whose node tree *is* the joint tree. The
// app rotates the joint nodes about their local Z, as the studio and the
// firmware's table guard both do.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { mergeGeometries, mergeVertices, toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { MeshoptSimplifier } from "meshoptimizer";
import { Document, NodeIO } from "@gltf-transform/core";

const src = resolve(process.argv[2] ?? "../../../thenar-arms/robot-studio/public/models/so101");
const out = resolve(import.meta.dirname, "../public/models");
mkdirSync(out, { recursive: true });

const manifestText = readFileSync(join(src, "study-manifest.json"), "utf8");
const manifest = JSON.parse(manifestText);
if (!manifest.encoder_leader) throw new Error("expected the MG996R R3 + AS5600 L1 study manifest");

// Share of triangles kept per merged mesh. The printed shells are CAD-dense;
// halving them is invisible at arm's length in the headset.
const KEEP = { print: 0.45, hardware: 0.6 };
const CREASE = THREE.MathUtils.degToRad(35);

const MATERIALS = {
  follower_print: { color: [0.949, 0.722, 0.271], metal: 0.05, rough: 0.5 },
  leader_print: { color: [0.333, 0.522, 0.875], metal: 0.05, rough: 0.5 },
  servo: { color: [0.11, 0.12, 0.14], metal: 0.1, rough: 0.45 },
  metal: { color: [0.67, 0.72, 0.78], metal: 0.85, rough: 0.28 },
  pcb: { color: [0.09, 0.44, 0.39], metal: 0.1, rough: 0.5 },
};
function materialKey(part, robot) {
  if (part.kind === "print") return `${robot}_print`;
  const id = part.id.toLowerCase();
  if (id.includes("mg996r")) return "servo";
  if (id.includes("pcb") || id.includes("chip") || id.includes("connector")) return "pcb";
  return "metal";
}

const loader = new STLLoader();
const stl = new Map();
function geometryOf(part) {
  if (!stl.has(part.id)) {
    const buf = readFileSync(join(src, part.file));
    const g = loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
    g.deleteAttribute("normal");
    stl.set(part.id, g);
  }
  return stl.get(part.id);
}

// Three's default Euler order, the studio's, and bridge.py's Rx·Ry·Rz agree.
const matrixOf = (position, rotationDeg) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotationDeg.map(THREE.MathUtils.degToRad), "XYZ")),
    new THREE.Vector3(1, 1, 1),
  );

function simplify(geometry, keep) {
  const welded = mergeVertices(geometry, 1e-4);
  const positions = welded.attributes.position.array;
  const indices = new Uint32Array(welded.index.array);
  const target = Math.max(3, Math.floor((indices.length * keep) / 3) * 3);
  const [reduced] = MeshoptSimplifier.simplify(indices, positions, 3, target, 0.002, ["LockBorder"]);
  welded.setIndex(new THREE.BufferAttribute(reduced, 1));
  // Creased normals keep the CAD's hard edges hard and its fillets smooth.
  const creased = toCreasedNormals(welded, CREASE);
  const out = mergeVertices(creased, 1e-4);
  return out;
}

const partsById = new Map(manifest.parts.map((p) => [p.id, p]));

async function buildRobot(robot) {
  const doc = new Document();
  const buffer = doc.createBuffer();
  const scene = doc.createScene(robot);
  const materials = {};
  const material = (key) =>
    (materials[key] ??= doc
      .createMaterial(key)
      // glTF colour factors are linear; the palette above is written in sRGB.
      .setBaseColorFactor([...new THREE.Color().setRGB(...MATERIALS[key].color, THREE.SRGBColorSpace).toArray(), 1])
      .setMetallicFactor(MATERIALS[key].metal)
      .setRoughnessFactor(MATERIALS[key].rough));

  const nodes = manifest.nodes.filter((n) => n.id === robot || n.id.startsWith(robot + "_"));
  const gltfNodes = new Map();
  let triangles = 0;
  for (const n of nodes) {
    // The robot root carries the studio's display offset; the app places the arm itself.
    const isRoot = n.parent === null;
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...n.rotation.map(THREE.MathUtils.degToRad), "XYZ"));
    const node = doc
      .createNode(n.id)
      .setTranslation(isRoot ? [0, 0, 0] : n.position)
      .setRotation([q.x, q.y, q.z, q.w]);
    if (n.joint !== null) node.setExtras({ joint: n.joint });
    gltfNodes.set(n.id, node);
    (isRoot ? scene : gltfNodes.get(n.parent)).addChild(node);

    const groups = new Map();
    for (const inst of manifest.instances.filter((i) => i.node === n.id)) {
      const part = partsById.get(inst.part);
      const key = materialKey(part, robot);
      const g = geometryOf(part).clone().applyMatrix4(matrixOf(inst.position, inst.rotation));
      (groups.get(key) ?? groups.set(key, []).get(key)).push(g);
    }
    for (const [key, list] of groups) {
      const merged = simplify(mergeGeometries(list, false), KEEP[key.endsWith("print") ? "print" : "hardware"]);
      const pos = merged.attributes.position.array;
      const nor = merged.attributes.normal.array;
      const idx = merged.index.array;
      triangles += idx.length / 3;
      const prim = doc
        .createPrimitive()
        .setMaterial(material(key))
        .setAttribute("POSITION", doc.createAccessor().setType("VEC3").setArray(new Float32Array(pos)).setBuffer(buffer))
        .setAttribute("NORMAL", doc.createAccessor().setType("VEC3").setArray(new Float32Array(nor)).setBuffer(buffer))
        .setIndices(
          doc
            .createAccessor()
            .setType("SCALAR")
            .setArray(pos.length / 3 > 65535 ? new Uint32Array(idx) : new Uint16Array(idx))
            .setBuffer(buffer),
        );
      const mesh = doc.createMesh(`${n.id}:${key}`).addPrimitive(prim);
      node.addChild(doc.createNode(`${n.id}:${key}`).setMesh(mesh));
    }
  }
  const glb = await new NodeIO().writeBinary(doc);
  writeFileSync(join(out, `${robot}.glb`), glb);
  return { triangles, bytes: glb.byteLength };
}

await MeshoptSimplifier.ready;
const report = {};
for (const robot of ["follower", "leader"]) report[robot] = await buildRobot(robot);

const joints = (robot) =>
  manifest.nodes.filter((n) => n.joint !== null && n.id.startsWith(robot + "_")).map((n) => ({ id: n.id, index: n.joint }));
// The bare kinematic chain, so the solver can be tested without a GPU or a GLB.
const chain = (robot) =>
  manifest.nodes
    .filter((n) => n.id.startsWith(robot + "_"))
    .map(({ id, parent, position, rotation, joint }) => ({ id, parent: parent === robot ? null : parent, position, rotation, joint }));
writeFileSync(
  join(out, "arm.json"),
  JSON.stringify(
    {
      revision: manifest.revision,
      source: "thenar-arms robot-studio/public/models/so101/study-manifest.json",
      sourceSha256: createHash("sha256").update(manifestText).digest("hex"),
      units: "mm, Z up",
      jointNames: manifest.jointNames,
      home: manifest.home,
      limits: manifest.limits,
      robots: {
        follower: { file: "follower.glb", joints: joints("follower"), tcp: "follower_gripper_frame_link", chain: chain("follower"), ...report.follower },
        leader: { file: "leader.glb", joints: joints("leader"), tcp: "leader_gripper_frame_link", chain: chain("leader"), ...report.leader },
      },
    },
    null,
    1,
  ) + "\n",
);
console.log(report);
