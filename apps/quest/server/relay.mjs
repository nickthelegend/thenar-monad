#!/usr/bin/env node
// The Mac side of THENAR Quest.
//
//   pnpm relay                                   headset ⇄ second screen, episodes to disk
//   pnpm relay --leader /dev/cu.usbserial-A      + the AS5600 leader drives both arms
//   pnpm relay --follower /dev/cu.usbserial-B    + stream targets to the MG996R follower (disarmed)
//   pnpm relay --follower … --arm                + allow it to arm once the pose is home
//
// Speaks the thenar-arms firmware's serial protocol unchanged (firmware/thenar):
// the leader prints `L q0 … q5`, the follower takes `Q q0 … q5`, `ARM`, `STOP`,
// and stops itself if a target is more than 250 ms old. Nothing here arms the
// follower unless --arm was given, and then only from the displayed home pose,
// exactly as bridge.py does.
import { WebSocketServer } from "ws";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { buildChain, Joints } from "../src/kinematics.js";

const { values: opt } = parseArgs({
  options: {
    port: { type: "string", default: "8787" },
    leader: { type: "string" },
    follower: { type: "string" },
    arm: { type: "boolean", default: false },
    episodes: { type: "string", default: "episodes" },
  },
});
if (opt.arm && !opt.follower) {
  console.error("--arm needs --follower");
  process.exit(2);
}

const arm = JSON.parse(readFileSync(new URL("../public/models/arm.json", import.meta.url)));
const HOME = arm.home;
const LIMITS = arm.limits;
const episodesDir = resolve(opt.episodes);
mkdirSync(episodesDir, { recursive: true });

// ---- safety -------------------------------------------------------------------

// The follower must never be told to put its gripper into the table. A
// kinematic check on the TCP and the wrist, in the base frame (mm, Z up).
const guard = (() => {
  const spec = arm.robots.follower;
  const { root, nodes } = buildChain(spec.chain);
  const j = new Joints(root, spec.joints.map((x) => nodes[x.id]), nodes[spec.tcp], LIMITS);
  const wrist = nodes["follower_wrist_link"];
  return (q) => {
    j.set(q);
    root.updateMatrixWorld(true);
    const tcpZ = nodes[spec.tcp].matrixWorld.elements[14];
    const wristZ = wrist.matrixWorld.elements[14];
    return tcpZ > 8 && wristZ > 20;
  };
})();

export function validTarget(q) {
  return Array.isArray(q) && q.length === 6 && q.every((v, i) => Number.isFinite(v) && v >= LIMITS[i][0] && v <= LIMITS[i][1]);
}
const nearHome = (q) => q.every((v, i) => Math.abs(v - HOME[i]) <= 3);

// ---- serial -------------------------------------------------------------------

async function openSerial(path, onLine) {
  const { SerialPort, ReadlineParser } = await import("serialport");
  const port = new SerialPort({ path, baudRate: 115200 });
  const lines = port.pipe(new ReadlineParser({ delimiter: "\n" }));
  lines.on("data", (l) => onLine(l.trim()));
  await new Promise((ok, fail) => {
    port.once("open", ok);
    port.once("error", fail);
  });
  return port;
}

const follower = { port: null, armed: false, requested: false, last: "", sentAt: 0, reason: "" };
const leader = { port: null, q: null, at: 0 };

function followerStop(why) {
  if (!follower.port) return;
  follower.port.write("STOP\n");
  if (follower.armed || follower.requested) console.log(`follower STOP (${why})`);
  follower.armed = false;
  follower.requested = false;
  follower.reason = why;
  broadcastStatus();
}

function sendFollower(q, from) {
  if (!follower.port) return;
  if (!validTarget(q)) return followerStop(`invalid target from ${from}`);
  if (!guard(q)) return followerStop("the gripper would reach the table");
  const now = Date.now();
  if (now - follower.sentAt < 20) return; // 50 Hz is the firmware's own tick
  follower.sentAt = now;
  follower.port.write(`Q ${q.map((v) => v.toFixed(3)).join(" ")}\n`);
  if (opt.arm && !follower.armed && !follower.requested && nearHome(q)) {
    follower.port.write("ARM\n");
    follower.requested = true;
    console.log("follower: ARM requested at home");
  }
}

if (opt.follower) {
  follower.port = await openSerial(opt.follower, (line) => {
    follower.last = line;
    if (line === "ARMED") {
      follower.armed = true;
      console.log("follower ARMED");
    } else if (line.startsWith("STOP")) {
      follower.armed = false;
      follower.requested = false;
      follower.reason = line.slice(5);
    }
    broadcastStatus();
  });
  setTimeout(() => follower.port.write("STOP\n"), 1500);
  console.log(`follower on ${opt.follower}${opt.arm ? " — may arm from home" : " — will not arm (no --arm)"}`);
}
if (opt.leader) {
  leader.port = await openSerial(opt.leader, (line) => {
    const p = line.split(/\s+/);
    if (p[0] !== "L" || p.length !== 7) return;
    const q = p.slice(1).map(Number);
    if (!validTarget(q)) return;
    leader.q = q;
    leader.at = Date.now();
    broadcast({ type: "leader", q, t: leader.at / 1000 });
    sendFollower(q, "leader");
  });
  console.log(`leader on ${opt.leader}`);
}

// ---- websocket ------------------------------------------------------------------

const wss = new WebSocketServer({ port: +opt.port, maxPayload: 32 * 1024 * 1024 });
const clients = new Map();
let lastOperatorState = 0;

function broadcast(msg, except) {
  const s = JSON.stringify(msg);
  for (const [ws] of clients) if (ws !== except && ws.readyState === 1) ws.send(s);
}
function statusMessage() {
  return {
    type: "status",
    clients: clients.size,
    roles: [...clients.values()].map((c) => c.role),
    leader: leader.port ? { port: opt.leader, streaming: Date.now() - leader.at < 300 } : null,
    follower: follower.port ? { port: opt.follower, armed: follower.armed, canArm: opt.arm, last: follower.last, reason: follower.reason } : null,
  };
}
function broadcastStatus() {
  broadcast(statusMessage());
}

wss.on("connection", (ws, req) => {
  clients.set(ws, { role: "unknown", addr: req.socket.remoteAddress });
  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data);
    } catch {
      return;
    }
    const me = clients.get(ws);
    switch (msg.type) {
      case "hello":
        me.role = msg.role === "spectator" ? "spectator" : "operator";
        console.log(`${me.role} connected from ${me.addr}`);
        broadcastStatus();
        break;
      case "state":
        if (me.role !== "operator") return;
        lastOperatorState = Date.now();
        broadcast(msg, ws);
        // The physical leader, when present, is the only thing that drives hardware.
        if (!leader.port || Date.now() - leader.at > 300) sendFollower(msg.q, "headset");
        break;
      case "episode": {
        const ep = msg.episode;
        if (!ep?.frames?.length) return;
        const file = `episode-${(ep.started_at ?? new Date().toISOString()).replace(/[:.]/g, "-")}.json`;
        writeFileSync(join(episodesDir, file), JSON.stringify(ep));
        console.log(`saved ${file} (${ep.frame_count} frames, ${ep.duration_s}s)`);
        ws.send(JSON.stringify({ type: "saved", file }));
        break;
      }
      case "stop":
        followerStop("requested by headset");
        break;
    }
  });
  ws.on("close", () => {
    const me = clients.get(ws);
    clients.delete(ws);
    if (me?.role === "operator" && ![...clients.values()].some((c) => c.role === "operator") && !leader.port) followerStop("headset disconnected");
    broadcastStatus();
  });
  ws.send(JSON.stringify(statusMessage()));
});

// The firmware stops itself on a stale target; say so here too, so the panel knows.
setInterval(() => {
  if (follower.armed && !leader.port && Date.now() - lastOperatorState > 250) followerStop("headset stream went quiet");
  broadcastStatus();
}, 1000);

const shutdown = () => {
  followerStop("relay shutting down");
  setTimeout(() => process.exit(0), 100);
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

wss.on("listening", () => console.log(`THENAR relay on ws://0.0.0.0:${opt.port} · episodes → ${episodesDir}`));
wss.on("error", (e) => {
  console.error(e.code === "EADDRINUSE" ? `Port ${opt.port} is taken: is another relay running?` : e.message);
  followerStop("relay failed to start");
  process.exit(1);
});
