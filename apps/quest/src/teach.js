// Teach & repeat: show the arm a pick-and-place once, and it does it again
// wherever the next scan finds the object and the goal.
//
// A recorded episode is cut at the grasp and at the release. Before the grasp
// the gripper's path is held relative to the object; after the release,
// relative to the goal; in between, it blends from one to the other. Moving
// the object or the goal therefore bends the demonstration rather than
// replaying it blind. Orientation turns about the base with the bearing of
// whichever point it is anchored to, so the approach still faces the arm.
//
// Pure maths over arrays: the same skill runs in the headset, on a desktop,
// and under `node --test`.

const lerp = (a, b, s) => a + (b - a) * s;
const bearing = (p) => Math.atan2(p[1], p[0]);

/** Rotate a quaternion [x,y,z,w] about the world Z axis by `a` radians. */
function yawQuat([x, y, z, w], a) {
  const s = Math.sin(a / 2), c = Math.cos(a / 2); // q_z = [0,0,s,c]
  return [c * x - s * y, c * y + s * x, c * z + s * w, c * w - s * z];
}

/**
 * Turn an episode into a skill. The episode's frames must carry
 * `observation.tcp` ([x,y,z,qx,qy,qz,qw], m, arm frame), `observation.state`
 * (joint 5 is the gripper) and `observation.held` (the object is in the
 * gripper). Returns null, with a reason, when the take cannot teach anything.
 */
export function learn(episode) {
  const f = episode?.frames ?? [];
  const grasp = f.findIndex((x) => x["observation.held"]);
  if (grasp < 0) return { skill: null, reason: "The object was never picked up in this take, so there is nothing to learn." };
  let release = f.findIndex((x, i) => i > grasp && !x["observation.held"]);
  if (release < 0) return { skill: null, reason: "The object was still held when the take ended; put it down before stopping." };
  const obj = f[grasp]["observation.cube"].slice(0, 3);
  // Where it was let go is where "the goal" was for this demonstration.
  const goal = episode.task?.goal ? [episode.task.goal[0] / 1000, episode.task.goal[1] / 1000, 0] : f[release]["observation.tcp"].slice(0, 3);
  const frames = f.map((x, i) => {
    const tcp = x["observation.tcp"];
    return { t: x.t - f[0].t, phase: i < grasp ? 0 : i >= release ? 1 : (i - grasp) / (release - grasp), p: tcp.slice(0, 3), q: tcp.slice(3), grip: x["observation.state"][5] };
  });
  return {
    skill: {
      format: "thenar-skill/1",
      taught_from: episode.started_at,
      duration_s: frames.at(-1).t,
      object: obj,
      goal,
      grasp_t: frames[grasp].t,
      release_t: frames[release].t,
      frames,
    },
    reason: null,
  };
}

/** The skill's gripper pose at time t for a new object and goal (m, arm frame). */
export function poseAt(skill, t, object, goal) {
  const fr = skill.frames;
  let i = 0;
  while (i < fr.length - 2 && fr[i + 1].t <= t) i++;
  const a = fr[i], b = fr[Math.min(i + 1, fr.length - 1)];
  const k = b.t > a.t ? Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t))) : 0;
  const p = a.p.map((v, j) => lerp(v, b.p[j], k));
  const phase = lerp(a.phase, b.phase, k);
  const qa = a.q, qb = b.q;
  const dot = qa.reduce((s, v, j) => s + v * qb[j], 0) < 0 ? -1 : 1;
  let q = qa.map((v, j) => lerp(v, qb[j] * dot, k));
  const n = Math.hypot(...q);
  q = q.map((v) => v / n);
  const grip = lerp(a.grip, b.grip, k);

  // Anchor: the object before the grasp, the goal after the release, a blend
  // between. The path's offset from its anchor turns with the anchor's
  // bearing from the base, so an approach from the arm's side stays one.
  const from = [0, 1].map((j) => lerp(skill.object[j], skill.goal[j], phase));
  const to = [0, 1].map((j) => lerp(object[j], goal[j], phase));
  const turn = lerp(bearing(object) - bearing(skill.object), bearing(goal) - bearing(skill.goal), phase);
  const rx = p[0] - from[0], ry = p[1] - from[1];
  const c = Math.cos(turn), s = Math.sin(turn);
  return { p: [to[0] + c * rx - s * ry, to[1] + s * rx + c * ry, p[2]], q: yawQuat(q, turn), grip };
}
