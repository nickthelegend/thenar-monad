"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { SO101 } from "@/lib/so101";

/**
 * Mirror the station's SO-101 onto a real one, through the arm relay on this
 * machine (scripts/arm-relay.mjs).
 *
 * The page only proposes joint angles. Whether a servo moves is the relay's
 * decision: it arms only when started with --arm and only from the home pose,
 * checks every target against the limits and the table, and stops the arm the
 * moment this stream goes quiet — a closed tab, a hidden one, a lost socket.
 *
 * To arm from home, a mirror begins by holding the home pose for a second,
 * then eases from home to wherever the arm on screen is, and only then follows
 * it live. The real arm never jumps.
 */
export const RELAY_URL = "ws://127.0.0.1:8787";
const HZ = 30;
const HOLD_S = 1.2;
const EASE_S = 1.5;

type Phase = "off" | "connecting" | "home" | "ease" | "live";
export type RelayStatus = {
  phase: Phase;
  error: string | null;
  follower: { port: string; armed: boolean; canArm: boolean; reason: string } | null;
  leader: { port: string; streaming: boolean } | null;
};

const link = {
  ws: null as WebSocket | null,
  phase: "off" as Phase,
  phaseAt: 0,
  sentAt: 0,
  status: { phase: "off", error: null, follower: null, leader: null } as RelayStatus,
  listeners: new Set<(s: RelayStatus) => void>(),
};

function publish(patch: Partial<RelayStatus>) {
  link.status = { ...link.status, ...patch, phase: link.phase };
  for (const l of link.listeners) l(link.status);
}
function setPhase(p: Phase) {
  link.phase = p;
  link.phaseAt = performance.now();
  publish({});
}

export function connectRelay() {
  if (link.ws) return;
  setPhase("connecting");
  publish({ error: null });
  const ws = new WebSocket(RELAY_URL);
  link.ws = ws;
  ws.onopen = () => setPhase("home");
  ws.onmessage = (e) => {
    try {
      const m = JSON.parse(String(e.data));
      if (m.type === "status") publish({ follower: m.follower, leader: m.leader });
    } catch {
      /* not ours */
    }
  };
  ws.onerror = () => publish({ error: "No arm relay answered on this machine. Start it with: node scripts/arm-relay.mjs" });
  ws.onclose = () => {
    link.ws = null;
    setPhase("off");
  };
}

export function disconnectRelay() {
  const ws = link.ws;
  if (!ws) return;
  if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "stop" }));
  ws.close();
}

/** Start again from home: used after the relay stopped the arm. */
export function rehome() {
  if (link.ws) setPhase("home");
}

/**
 * Called by the drawn SO-101 every frame with its joints, in degrees (the
 * five reaching joints and the jaw). Sends at most 30 times a second.
 */
export function mirrorJoints(liveDeg: readonly number[]) {
  const ws = link.ws;
  if (!ws || ws.readyState !== WebSocket.OPEN) return;
  const now = performance.now();
  if (now - link.sentAt < 1000 / HZ) return;
  link.sentAt = now;
  const t = (now - link.phaseAt) / 1000;
  let q: number[];
  if (link.phase === "home") {
    q = [...SO101.homeDeg];
    if (t >= HOLD_S) setPhase("ease");
  } else if (link.phase === "ease") {
    const k = Math.min(1, t / EASE_S);
    const s = k * k * (3 - 2 * k);
    q = SO101.homeDeg.map((h, i) => h + (liveDeg[i] - h) * s);
    if (k >= 1) setPhase("live");
  } else if (link.phase === "live") {
    q = [...liveDeg];
  } else return;
  ws.send(JSON.stringify({ type: "state", q: q.map((v) => Number(v.toFixed(2))) }));
}

function useRelayStatus(): RelayStatus {
  const [s, set] = useState(link.status);
  useEffect(() => {
    link.listeners.add(set);
    return () => void link.listeners.delete(set);
  }, []);
  return s;
}

/** The sidebar control. Only rendered on an SO-101 task. */
export function MirrorPanel() {
  const s = useRelayStatus();
  // Leaving the station stops the arm, rather than leaving it holding the last pose.
  useEffect(() => () => disconnectRelay(), []);
  const on = s.phase !== "off";
  const f = s.follower;
  const line = !on
    ? null
    : s.phase === "connecting"
      ? "Connecting to the relay…"
      : !f
        ? "Relay connected, but no follower on it: start it with --follower /dev/cu.… to drive the arm."
        : f.armed
          ? s.phase === "live" ? "Armed. The arm on your desk follows the one on screen." : "Armed. Easing from home to the pose on screen…"
          : f.canArm
            ? s.phase === "home" || s.phase === "ease" ? "Holding home so the follower can arm…" : `Stopped${f.reason ? `: ${f.reason}` : ""}. Send it home to arm again.`
            : "Streaming, not armed: the relay was started without --arm, so nothing moves.";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => (on ? disconnectRelay() : connectRelay())}
          className={cn(
            "border px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] transition-colors",
            on ? "border-signal text-signal hover:bg-signal hover:text-ink-0" : "border-rule-strong text-scribe hover:border-scribe",
          )}
        >
          {on ? "Stop mirroring" : "Mirror to my SO-101"}
        </button>
        {on && f && !f.armed && f.canArm && s.phase === "live" ? (
          <button type="button" onClick={rehome} className="border border-rule-strong px-3 py-1.5 font-mono text-[12px] uppercase tracking-[0.14em] text-scribe hover:border-scribe">
            Send home
          </button>
        ) : null}
      </div>
      {line ? <p className={cn("text-[13px] leading-relaxed", f?.armed ? "text-go" : "text-scribe-3")}>{line}</p> : null}
      {s.error ? <p className="text-[13px] leading-relaxed text-reject">{s.error}</p> : null}
      {!on ? (
        <p className="text-[13px] leading-relaxed text-scribe-3">
          Drives a real MG996R SO-101 from this page, through <code className="font-mono text-[12px]">scripts/arm-relay.mjs</code> on
          this computer. It arms only from home, never into the table, and stops the moment this tab does.
          Practice and paid runs record the same either way.
        </p>
      ) : null}
    </div>
  );
}
