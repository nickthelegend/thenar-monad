import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocket } from "ws";

let PORT = 18787;
const nextPort = () => ++PORT;

function start(dir) {
  nextPort();
  const p = spawn(process.execPath, ["server/relay.mjs", "--port", String(PORT), "--episodes", dir], { cwd: new URL("..", import.meta.url) });
  return new Promise((ok, fail) => {
    p.stdout.on("data", (d) => String(d).includes("THENAR relay on") && ok(p));
    p.on("exit", (c) => fail(new Error(`relay exited ${c}`)));
  });
}
function client(role) {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  const inbox = [];
  ws.on("message", (d) => inbox.push(JSON.parse(d)));
  return new Promise((ok) => ws.on("open", () => (ws.send(JSON.stringify({ type: "hello", role })), ok({ ws, inbox }))));
}
const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("timed out");
};

test("the relay mirrors the headset to a spectator and saves episodes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "thenar-relay-"));
  const relay = await start(dir);
  try {
    const op = await client("operator");
    const sp = await client("spectator");
    const status = await until(() => sp.inbox.findLast((m) => m.type === "status" && m.roles.length === 2));
    assert.deepEqual(status.roles.sort(), ["operator", "spectator"]);
    assert.equal(status.follower, null, "no hardware without --follower");

    op.ws.send(JSON.stringify({ type: "state", q: [10, -20, 30, 0, 0, 40], t: 1 }));
    const st = await until(() => sp.inbox.find((m) => m.type === "state"));
    assert.deepEqual(st.q, [10, -20, 30, 0, 0, 40]);
    assert.equal(op.inbox.filter((m) => m.type === "state").length, 0, "the sender does not hear itself");

    const episode = { format: "thenar-quest-episode/1", started_at: "2026-09-23T10:00:00.000Z", frame_count: 2, duration_s: 0.03, frames: [{ t: 0 }, { t: 0.03 }] };
    op.ws.send(JSON.stringify({ type: "episode", episode }));
    const saved = await until(() => op.inbox.find((m) => m.type === "saved"));
    assert.deepEqual(readdirSync(dir), [saved.file]);
    assert.deepEqual(JSON.parse(readFileSync(join(dir, saved.file))), episode);
    op.ws.close();
    sp.ws.close();
  } finally {
    relay.kill();
  }
});

// ---- hardware path, against a pseudo-terminal that answers like the firmware ----

function fakeFollower() {
  const p = spawn("python3", [fileURLToPath(new URL("./fake-follower.py", import.meta.url))]);
  const lines = [];
  let path;
  p.stdout.on("data", (d) => {
    for (const l of String(d).split("\n").filter(Boolean)) path ? lines.push(l) : (path = l);
  });
  return until(() => path).then(() => ({ p, path, lines }));
}
function startWith(args) {
  nextPort();
  const p = spawn(process.execPath, ["server/relay.mjs", "--port", String(PORT), "--episodes", mkdtempSync(join(tmpdir(), "thenar-relay-")), ...args], {
    cwd: new URL("..", import.meta.url),
  });
  return new Promise((ok, fail) => {
    p.stdout.on("data", (d) => String(d).includes("THENAR relay on") && ok(p));
    p.on("exit", (c) => fail(new Error(`relay exited ${c}`)));
  });
}

test("without --arm the follower gets targets but is never armed", async () => {
  const fw = await fakeFollower();
  const relay = await startWith(["--follower", fw.path]);
  try {
    const op = await client("operator");
    for (let i = 0; i < 5; i++) {
      op.ws.send(JSON.stringify({ type: "state", q: [0, -25, 35, 0, 0, 20] }));
      await new Promise((r) => setTimeout(r, 40));
    }
    await until(() => fw.lines.some((l) => l.startsWith("Q ")));
    assert.ok(!fw.lines.includes("ARM"), fw.lines.join("\n"));
    op.ws.close();
  } finally {
    relay.kill();
    fw.p.kill();
  }
});

test("with --arm it arms only from home, refuses a table pose, and stops when the headset leaves", async () => {
  const fw = await fakeFollower();
  const relay = await startWith(["--follower", fw.path, "--arm"]);
  try {
    const op = await client("operator");
    const send = (q) => op.ws.send(JSON.stringify({ type: "state", q }));
    send([40, 30, -20, 0, 0, 20]); // away from home: a target, but no ARM
    await until(() => fw.lines.some((l) => l.startsWith("Q 40.000")));
    assert.ok(!fw.lines.includes("ARM"));
    await new Promise((r) => setTimeout(r, 40));
    send([0, -25, 35, 0, 0, 20]);
    await until(() => fw.lines.includes("ARM"));
    const armed = await until(() => op.inbox.findLast((m) => m.type === "status" && m.follower?.armed));
    assert.equal(armed.follower.armed, true);

    // Shoulder swung fully forward, arm straight: the gripper ends up ~190 mm below the table.
    await new Promise((r) => setTimeout(r, 40));
    send([0, 80, 0, 0, 0, 20]);
    await until(() => fw.lines.at(-1) === "STOP");
    assert.ok(!fw.lines.some((l) => l.startsWith("Q 0.000 80.000 0.000")), "the table pose was never sent");

    fw.lines.length = 0;
    await new Promise((r) => setTimeout(r, 40));
    send([0, -25, 35, 0, 0, 20]);
    await until(() => fw.lines.includes("ARM"));
    op.ws.close();
    await until(() => fw.lines.at(-1) === "STOP");
  } finally {
    relay.kill();
    fw.p.kill();
  }
});
