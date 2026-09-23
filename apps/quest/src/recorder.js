// Episodes: what the arm did, sampled at a fixed rate, in the names LeRobot
// uses (`observation.state`, `action`) so services/export can take them as-is.
//
// `state` is where the joints are; `action` is where they were told to go. In a
// headset-only session the two are equal (the solver's answer *is* the pose);
// they differ once a physical follower reports back or the leader drives.

export const EPISODE_FORMAT = "thenar-quest-episode/1";

export class Recorder {
  constructor({ fps = 30, robot, jointNames }) {
    this.fps = fps;
    this.robot = robot;
    this.jointNames = jointNames;
    this.frames = null;
    this.startedAt = 0;
    this.nextAt = 0;
  }
  get recording() {
    return this.frames !== null;
  }
  get elapsed() {
    return this.frames ? (performance.now() - this.startedAt) / 1000 : 0;
  }
  start(meta = {}) {
    this.frames = [];
    this.meta = meta;
    this.startedAt = performance.now();
    this.startedWall = new Date().toISOString();
    this.nextAt = 0;
  }
  /** Call every render frame; keeps only one sample per 1/fps tick. */
  tick(sample) {
    if (!this.frames) return false;
    const t = (performance.now() - this.startedAt) / 1000;
    if (t < this.nextAt) return false;
    this.nextAt = Math.max(this.nextAt + 1 / this.fps, t - 0.5 / this.fps);
    this.frames.push({ t: +t.toFixed(4), ...sample });
    return true;
  }
  stop() {
    if (!this.frames) return null;
    const frames = this.frames;
    this.frames = null;
    if (frames.length < 2) return null;
    return {
      format: EPISODE_FORMAT,
      robot: this.robot,
      fps: this.fps,
      units: { joints: "deg", position: "m", time: "s" },
      joint_names: this.jointNames,
      started_at: this.startedWall,
      duration_s: frames.at(-1).t,
      frame_count: frames.length,
      ...this.meta,
      frames,
    };
  }
}

/** Joint state at time `t`, linearly interpolated; clamps to the ends. */
export function stateAt(episode, t) {
  const f = episode.frames;
  if (t <= f[0].t) return f[0]["observation.state"];
  if (t >= f.at(-1).t) return f.at(-1)["observation.state"];
  let lo = 0, hi = f.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (f[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = f[lo], b = f[hi];
  const k = (t - a.t) / (b.t - a.t);
  return a["observation.state"].map((v, i) => v + (b["observation.state"][i] - v) * k);
}

export function download(episode, name) {
  const blob = new Blob([JSON.stringify(episode)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name ?? `thenar-episode-${episode.started_at.replace(/[:.]/g, "-")}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
