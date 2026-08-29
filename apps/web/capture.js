/* capture.js — the capture page: drive the arm, record, score.
 *
 * The mechanics live in caplogic.js so they can be tested without a browser;
 * this file is the glue that turns pointers and keys into ticks, and draws the
 * result. The trajectory is genuinely recorded — joint angles from inverse
 * kinematics, sampled at a fixed rate from real operator input, with a grasp
 * that only forms when the jaws close inside the capture volume.
 *
 * What this is not: contact-rich physics. No friction, no deformation, no slip.
 * A policy trained on contact needs a real engine, and the exported metadata
 * says as much. What it does produce is a real demonstration with real timing
 * and a measured outcome, rather than a synthetic hash with an assigned score.
 */
import { sampleScene, drawScene, sceneMapping } from "./scene.js";
import { taskId as computeTaskId } from "./taskspec.js";
import * as cap from "./caplogic.js";

const $ = (s) => document.querySelector(s);
let spec = null, tid = null, scene = null, st = null;
let running = false, t0 = 0, last = 0;
/* Time the tab spent hidden, which is time the operator was not driving.
 * Browsers stop the frame loop on a hidden tab, so without this the wall clock
 * would keep counting through a gap in which nothing was recorded, and the
 * episode would claim a duration nobody drove. The clock is stopped instead,
 * and caplogic refuses any run that still contains a gap. */
let hiddenAt = 0, pausedMs = 0;

function reset() {
  const seed = BigInt(Math.floor(Math.random() * 2 ** 32));
  scene = sampleScene(spec, tid, seed);
  st = cap.initialState(spec, tid, scene);
  st.seedUsed = seed;
  running = false;
  $("#c-clock").textContent = "0.0 s";
  $("#c-start").textContent = "Begin";
  // A new run must not leave the last one's score on screen looking current.
  $("#c-result").innerHTML = `<p class="cmeta">No run yet.</p>`;
  $("#c-episode").innerHTML = `<p class="cmeta">A completed run produces a leaf.</p>`;
  $("#c-grip").textContent = "Close jaws";
  $("#c-grip").disabled = true;
  $("#c-end").disabled = true;
  $("#c-stage").classList.remove("armed");
  draw(); readout();
}

/** The scene's own frame, so the arm and the world cannot drift apart. */
function mapping() {
  const cv = $("#c-stage");
  const rect = cv.getBoundingClientRect();
  return { ...sceneMapping(rect.width, rect.height, spec), rect };
}

function draw() {
  const cv = $("#c-stage");
  if (!cv.clientWidth) return;
  // Everything but the payload, which moves and so is drawn here.
  drawScene(cv, { ...scene, objects: scene.objects.slice(1) }, spec, new Set([0]));
  const ctx = cv.getContext("2d");
  const m = mapping();
  const ik = cap.solve(st.tool[0], st.tool[1]);
  ctx.save();
  ctx.lineCap = "round";

  ctx.strokeStyle = "rgba(255,255,255,.07)";
  ctx.setLineDash([3, 5]);
  ctx.beginPath();
  ctx.arc(m.X(0), m.Y(0), (cap.L1 + cap.L2) * m.s, 0, 7);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = "#4D17F5"; ctx.lineWidth = 1.5;
  const gx = m.X(st.goal[0]), gy = m.Y(st.goal[1]);
  const gr = Math.max(6, (spec.success.toleranceMm / 1000) * m.s);
  ctx.beginPath(); ctx.arc(gx, gy, gr, 0, 7); ctx.stroke();
  ctx.font = "600 9px ui-monospace, Menlo, monospace";
  ctx.fillStyle = "#8A6BFF";
  ctx.fillText(`datum ±${spec.success.toleranceMm}mm`, gx + gr + 4, gy + 3);

  if (st.samples.length > 1) {
    ctx.strokeStyle = "rgba(77,23,245,.6)"; ctx.lineWidth = 1.5;
    ctx.beginPath();
    st.samples.forEach((s, i) => {
      const p = [m.X(s.object[0]), m.Y(s.object[1])];
      i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]);
    });
    ctx.stroke();
  }

  const e = [cap.L1 * Math.cos(ik.j1), cap.L1 * Math.sin(ik.j1)];
  ctx.strokeStyle = "#9B9B9B"; ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(m.X(0), m.Y(0)); ctx.lineTo(m.X(e[0]), m.Y(e[1]));
  ctx.lineTo(m.X(ik.x), m.Y(ik.y)); ctx.stroke();
  ctx.fillStyle = "#272727";
  for (const p of [[0, 0], e]) { ctx.beginPath(); ctx.arc(m.X(p[0]), m.Y(p[1]), 5, 0, 7); ctx.fill(); }

  const jaw = Math.max(3, (st.grip / 1000) * m.s * 1.6);
  ctx.strokeStyle = ik.clamped ? "#FA9DCD" : "#fff"; ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(m.X(ik.x) - jaw, m.Y(ik.y) - 7); ctx.lineTo(m.X(ik.x) - jaw, m.Y(ik.y) + 7);
  ctx.moveTo(m.X(ik.x) + jaw, m.Y(ik.y) - 7); ctx.lineTo(m.X(ik.x) + jaw, m.Y(ik.y) + 7);
  ctx.stroke();

  // Amber, because the distractors are already pink: the one object that
  // matters must not look like the ones that do not.
  const px = m.X(st.payload[0]), py = m.Y(st.payload[1]);
  ctx.fillStyle = st.held ? "#7CE0A5" : "#F2B01E";
  ctx.strokeStyle = "rgba(0,0,0,.55)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.roundRect(px - 9, py - 7, 18, 14, 3);
  ctx.fill(); ctx.stroke();
  ctx.font = "600 9px ui-monospace, Menlo, monospace";
  ctx.fillStyle = st.held ? "#7CE0A5" : "#F2B01E";
  ctx.fillText(st.held ? "held" : "payload", px + 13, py + 3);
  ctx.restore();
}

function readout() {
  const ik = cap.solve(st.tool[0], st.tool[1]);
  const dev = Math.hypot(st.payload[0] - st.goal[0], st.payload[1] - st.goal[1]) * 1000;
  $("#c-readout").innerHTML =
    `<span>tool <b>${ik.x.toFixed(3)}, ${ik.y.toFixed(3)}</b></span>` +
    `<span>jaw <b>${st.grip.toFixed(0)} mm</b></span>` +
    `<span class="${st.held ? "held" : ""}">${st.held ? "PAYLOAD HELD" : "jaws empty"}</span>` +
    `<span>datum <b>${dev.toFixed(1)} mm</b></span>` +
    `<span>samples <b>${st.samples.length}</b></span>` +
    (ik.clamped ? `<span style="color:#FA9DCD">OUT OF REACH</span>` : "");
  const fig = (k, v) => `<div class="fig"><div class="k">${k}</div><div class="v small">${v}</div></div>`;
  $("#c-live").innerHTML =
    fig("Samples", st.samples.length) + fig("Deviation", `${dev.toFixed(1)} mm`) +
    fig("Held", st.held ? "yes" : "no");
}

function frame(now) {
  requestAnimationFrame(frame);
  if (!running) return;
  if (!last) last = now;
  const dt = Math.min((now - last) / 1000, 0.1);
  last = now;
  drive(dt);
  const t = (now - t0 - pausedMs) / 1000;
  cap.tick(st, dt, t);
  $("#c-clock").textContent = `${t.toFixed(1)} s`;
  draw(); readout();
}

const keys = Object.create(null);
function drive(dt) {
  const v = 0.36 * dt;
  if (keys.w || keys.arrowup) st.tool[1] += v;
  if (keys.s || keys.arrowdown) st.tool[1] -= v;
  if (keys.a || keys.arrowleft) st.tool[0] -= v;
  if (keys.d || keys.arrowright) st.tool[0] += v;
}

function finish() {
  running = false;
  $("#c-start").textContent = "Run again";
  $("#c-grip").disabled = true;
  $("#c-end").disabled = true;
  $("#c-stage").classList.remove("armed");

  const r = cap.finishEpisode(st, spec, tid, { seed: st.seedUsed });
  if (!r.recorded) {
    $("#c-result").innerHTML =
      `<p class="verdictline no">Nothing was recorded</p>
       <p class="cmeta">${r.reason}${r.gaps?.length ? "." : ", so there is no demonstration to score."}
       Nothing is submitted and nothing is deducted.</p>`;
    $("#c-episode").innerHTML = `<p class="cmeta">No leaf: an episode has to contain a demonstration.</p>`;
    return;
  }
  const s = r.score;
  const bar = (k, v, c) =>
    `<div class="scorebar"><span>${k}</span><i><b style="width:${(v * 100).toFixed(1)}%${c ? `;background:${c}` : ""}"></b></i><em>${(v * 100).toFixed(0)}%</em></div>`;
  $("#c-result").innerHTML =
    `<p class="verdictline ${r.accepted ? "yes" : "no"}">${
      !s.success ? "Out of tolerance" : r.overrun ? "Over the time limit"
      : r.accepted ? "Accepted" : "In tolerance, below the bar"}</p>` +
    `<p class="cmeta">${s.deviationMm.toFixed(1)} mm from the datum · ${s.durationS.toFixed(1)} s · jerk ${s.meanJerk.toFixed(1)}${st.drops ? ` · dropped ${st.drops}×` : ""}${st.places > 1 ? ` · placed ${st.places}×` : ""}</p>` +
    bar("placement", s.placement) + bar("smoothness", s.smoothness) + bar("efficiency", s.efficiency) +
    `<div class="scorebar" style="margin-top:10px"><span><b>score</b></span><i><b style="width:${(s.totalBps / 100).toFixed(1)}%;background:${r.accepted ? "#7CE0A5" : "#FA9DCD"}"></b></i><em>${(s.totalBps / 100).toFixed(2)}%</em></div>` +
    (r.accepted ? "" : `<p class="cmeta" style="margin-top:8px">This task accepts at ${(spec.acceptance.minScoreBps / 100).toFixed(0)}% within ${spec.acceptance.maxDurationS} s. Nothing is deducted for a run that misses it.</p>`);

  const bundle = {
    episode: { ...r.episode, capturedAt: String(r.episode.capturedAt),
      submittedAt: String(r.episode.submittedAt), worldSeed: String(r.episode.worldSeed) },
    preimage: r.preimage, leaf: r.leaf, trajectory: r.trajectory, score: s,
    capture: { method: "browser-kinematic-v1", hz: cap.HZ, physics: "none: kinematic, no contact model" },
  };
  const name = `episode-${r.leaf.slice(2, 10)}.json`;
  $("#c-episode").innerHTML =
    `<p class="cmeta">leaf</p><p class="mono" style="word-break:break-all;font-size:11.5px">${r.leaf}</p>
     <p class="cmeta" style="margin-top:8px">${st.samples.length} samples · the payload hash commits to every one of them</p>
     <div class="bactions">
       <a class="btn sm" id="c-dl" download="${name}">Download the episode</a>
       <a class="btn sm ghost" href="./verify.html?preimage=${r.preimage}">Check the leaf</a>
     </div>
     <p class="bhint" style="margin-left:0;margin-top:8px">Append and anchor it with
     <code>pnpm tsx scripts/ingest-episode.ts ${name}</code>, which recomputes the
     score from the trajectory before it will accept the leaf.</p>`;
  $("#c-dl").href = URL.createObjectURL(
    new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" }));
}

function mount() {
  const cv = $("#c-stage");
  let dragging = false;
  const toWorld = (e) => {
    const m = mapping();
    return m.toWorld(e.clientX - m.rect.left, e.clientY - m.rect.top);
  };
  cv.addEventListener("pointerdown", (e) => {
    dragging = true; cv.setPointerCapture(e.pointerId); cv.classList.add("dragging");
    st.tool = toWorld(e); draw(); readout();
  });
  cv.addEventListener("pointermove", (e) => {
    if (dragging) { st.tool = toWorld(e); draw(); readout(); }
  });
  const up = (e) => {
    dragging = false; cv.classList.remove("dragging");
    if (cv.hasPointerCapture?.(e.pointerId)) cv.releasePointerCapture(e.pointerId);
  };
  cv.addEventListener("pointerup", up);
  cv.addEventListener("pointercancel", up);

  addEventListener("keydown", (e) => {
    const t = e.target instanceof Element ? e.target : null;
    if (t && (t.matches("input, textarea, select") || t.isContentEditable)) return;
    const k = e.key.toLowerCase();
    if ([" ", "w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
    if (k === " ") { grip(); return; }
    keys[k] = true;
  });
  addEventListener("keyup", (e) => { keys[e.key.toLowerCase()] = false; });
  addEventListener("blur", () => { for (const k in keys) keys[k] = false; });
  document.addEventListener("visibilitychange", () => {
    if (!running) return;
    if (document.hidden) { hiddenAt = performance.now(); for (const k in keys) keys[k] = false; }
    else if (hiddenAt) {
      pausedMs += performance.now() - hiddenAt;
      hiddenAt = 0;
      last = 0;               // do not bill the operator for the pause
      $("#c-clock").title = "The clock stopped while this tab was in the background.";
    }
  });
  addEventListener("resize", draw, { passive: true });

  $("#c-start").addEventListener("click", () => {
    if (running) return;
    if (st.samples.length) { reset(); return; }
    running = true; t0 = performance.now(); last = 0; pausedMs = 0; hiddenAt = 0;
    $("#c-start").textContent = "Recording";
    $("#c-grip").disabled = false;
    $("#c-end").disabled = false;
    cv.classList.add("armed");
  });
  $("#c-grip").addEventListener("click", grip);
  $("#c-end").addEventListener("click", finish);
}

function grip() {
  if (!running) return;
  cap.toggleGrip(st);
  $("#c-grip").textContent = st.grip > cap.GRIP_CLOSED ? "Close jaws" : "Open jaws";
  draw(); readout();
}

(async () => {
  try {
    const doc = await fetch("./sample-task.json").then((r) => r.json());
    spec = doc.spec;
    tid = computeTaskId(spec);
    $("#c-task").innerHTML =
      `${spec.instruction}<br>${spec.embodiment} · tolerance ${spec.success.toleranceMm} mm · ` +
      `accepts at ${(spec.acceptance.minScoreBps / 100).toFixed(0)}% within ${spec.acceptance.maxDurationS} s`;
    reset();
    mount();
    requestAnimationFrame(frame);
  } catch (e) {
    $("#c-task").textContent = `Could not load a task: ${e.message}`;
  }
})();
