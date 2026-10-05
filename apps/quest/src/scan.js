// Scan: turn a camera picture of the real table into a task the arm can do.
//
// 1. Point any camera at the table: this Mac's, a phone's, or the headset's
//    if its browser exposes it. A photo works too.
// 2. Click the four corners of an A4 sheet lying in front of the arm.
// 3. The detector names what is on the table; each object's footprint is
//    mapped through the sheet to millimetres in the arm's frame. Click the
//    picture to add anything it missed.
// 4. Choose what to pick and where to put it, and send the task to the
//    station, which publishes it on Monad and hands it to the headset.
import { detect, loadDetector, sampleColour } from "./detect.js";
import { homography, apply, sheetCorners, checkQuad, footprint, A4_GAP_MM } from "./scan-geometry.js";
import "./scan.css";

const $ = (s) => document.querySelector(s);
const video = $("#video");
const canvas = $("#frame");
const overlay = $("#overlay");
const ctx = canvas.getContext("2d", { willReadFrequently: true });
const octx = overlay.getContext("2d");

const state = {
  stream: null,
  frozen: false,
  corners: [], // clicked, image px
  H: null,
  objects: [], // { id, label, score, box, px, mm: {x,y}, colour, source }
  pick: null,
  place: null,
  mode: "corners", // corners | add
};
let nextId = 1;
const CORNERS = sheetCorners();
// The arm reaches roughly 120–400 mm from its base; say so before the headset finds out.
const REACH = { min: 120, max: 400 };

function say(msg, kind = "") {
  const el = $("#status");
  el.textContent = msg;
  el.className = "status " + kind;
}

// ---- camera ------------------------------------------------------------------

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    return say(window.isSecureContext ? "This browser gives pages no camera. Use Upload photo." : "The camera needs HTTPS or localhost. Open the https:// address.", "bad");
  }
  say("Waiting for camera permission: allow it in the browser's prompt.");
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
  } catch (e) {
    return say(e.name === "NotAllowedError" ? "Camera permission was refused. Allow it in the address bar, or use Upload photo." : e.name === "NotFoundError" ? "No camera found. Use Upload photo." : `Camera failed: ${e.message}`, "bad");
  }
  video.srcObject = state.stream;
  await video.play();
  state.frozen = false;
  $("#freeze").disabled = false;
  say("Camera on. Lay an A4 sheet in front of the arm, then press Freeze frame.");
  loop();
}
function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
}
function loop() {
  if (state.frozen || !state.stream) return;
  if (video.videoWidth) {
    size(video.videoWidth, video.videoHeight);
    ctx.drawImage(video, 0, 0);
  }
  requestAnimationFrame(loop);
}
function size(w, h) {
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = overlay.width = w;
    canvas.height = overlay.height = h;
  }
}
async function freeze() {
  if (!video.videoWidth) return say("The camera has not delivered a frame yet.", "bad");
  size(video.videoWidth, video.videoHeight);
  ctx.drawImage(video, 0, 0);
  state.frozen = true;
  stopCamera();
  await afterFrame();
}
async function upload(file) {
  if (!file) return;
  if (!file.type.startsWith("image/")) return say("That file is not an image.", "bad");
  const img = new Image();
  img.src = URL.createObjectURL(file);
  try {
    await img.decode();
  } catch {
    return say("That image could not be read.", "bad");
  }
  stopCamera();
  size(img.naturalWidth, img.naturalHeight);
  ctx.drawImage(img, 0, 0);
  URL.revokeObjectURL(img.src);
  state.frozen = true;
  await afterFrame();
}
async function afterFrame() {
  state.corners = [];
  state.H = null;
  state.objects = [];
  state.pick = state.place = null;
  state.mode = "corners";
  $("#rescan").disabled = false;
  draw();
  renderList();
  await runDetector();
  say(`Now click the sheet's ${CORNERS[0].name} corner (the corner nearest the arm, on its left).`);
}
async function runDetector() {
  say("Looking for objects…");
  try {
    const found = await detect(canvas);
    for (const d of found) state.objects.push({ id: nextId++, ...d, px: footprint(d.box), colour: sampleColour(canvas, d.box), source: "detector" });
  } catch (e) {
    say(`The detector failed to load: ${e.message}`, "bad");
    return;
  }
  measure();
  draw();
  renderList();
}

// ---- clicks --------------------------------------------------------------------

overlay.addEventListener("click", (e) => {
  if (!state.frozen) return say("Freeze a frame (or upload a photo) first.", "bad");
  const r = overlay.getBoundingClientRect();
  const p = { x: ((e.clientX - r.left) / r.width) * overlay.width, y: ((e.clientY - r.top) / r.height) * overlay.height };
  if (state.mode === "corners") {
    state.corners.push(p);
    if (state.corners.length < 4) {
      say(`Now the ${CORNERS[state.corners.length].name} corner.`);
    } else {
      const bad = checkQuad(state.corners);
      if (bad) {
        state.corners = [];
        say(bad + " Start again at the near left corner.", "bad");
      } else {
        state.H = homography(state.corners, CORNERS);
        state.mode = "add";
        measure();
        say(`Sheet found. ${state.objects.length ? "Choose what to pick and where to put it" : "Nothing was detected: click where each object touches the table to add it"}.`, "good");
      }
    }
  } else {
    const label = ($("#add-label").value || "object").trim().slice(0, 32);
    state.objects.push({ id: nextId++, label, score: 1, box: null, px: p, colour: sampleColour(canvas, { x: p.x - 12, y: p.y - 24, w: 24, h: 24 }), source: "clicked" });
    measure();
  }
  draw();
  renderList();
});

function measure() {
  for (const o of state.objects) {
    o.mm = state.H ? apply(state.H, o.px) : null;
    if (o.mm) {
      const r = Math.hypot(o.mm.x, o.mm.y);
      o.reach = r < REACH.min ? "too close to the base" : r > REACH.max ? "out of reach" : null;
    }
  }
}

// ---- drawing ------------------------------------------------------------------------

function draw() {
  octx.clearRect(0, 0, overlay.width, overlay.height);
  const lw = Math.max(2, overlay.width / 400);
  octx.lineWidth = lw;
  octx.font = `${Math.max(14, overlay.width / 60)}px ui-sans-serif, system-ui`;
  // The sheet.
  if (state.corners.length) {
    octx.strokeStyle = "#f2b845";
    octx.fillStyle = "rgba(242,184,69,0.15)";
    octx.beginPath();
    state.corners.forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)));
    if (state.corners.length === 4) octx.closePath(), octx.fill();
    octx.stroke();
    state.corners.forEach((p, i) => {
      octx.fillStyle = "#f2b845";
      octx.beginPath();
      octx.arc(p.x, p.y, lw * 3, 0, Math.PI * 2);
      octx.fill();
      octx.fillText(String(i + 1), p.x + lw * 4, p.y - lw * 4);
    });
  }
  // The arm's base, where the sheet says it is.
  if (state.H) {
    const inv = homography(CORNERS, state.corners);
    const base = apply(inv, { x: 0, y: 0 });
    octx.strokeStyle = octx.fillStyle = "#6f9cf0";
    const inside = base.x >= 0 && base.y >= 0 && base.x <= overlay.width && base.y <= overlay.height;
    if (inside) {
      octx.beginPath();
      octx.arc(base.x, base.y, lw * 8, 0, Math.PI * 2);
      octx.stroke();
      octx.fillText("arm base", base.x + lw * 10, base.y);
    } else {
      // Usually just below the picture: point at it from the edge.
      const x = Math.min(overlay.width - lw * 60, Math.max(lw * 4, base.x)), y = Math.min(overlay.height - lw * 4, Math.max(lw * 12, base.y));
      octx.fillText(`arm base ${base.y > overlay.height ? "↓" : base.y < 0 ? "↑" : base.x < 0 ? "←" : "→"} (off the picture)`, x, y);
    }
  }
  for (const o of state.objects) {
    const role = o.id === state.pick ? "PICK" : o.id === state.place ? "PLACE ON" : "";
    octx.strokeStyle = role === "PICK" ? "#ff5a4f" : role ? "#4fd18b" : o.reach ? "#9aa3b2" : "#ffffff";
    if (o.box) octx.strokeRect(o.box.x, o.box.y, o.box.w, o.box.h);
    octx.fillStyle = octx.strokeStyle;
    octx.beginPath();
    octx.arc(o.px.x, o.px.y, lw * 3, 0, Math.PI * 2);
    octx.fill();
    const where = o.mm ? ` ${Math.round(o.mm.x)}, ${Math.round(o.mm.y)} mm` : "";
    const tx = o.box ? o.box.x : o.px.x + lw * 4, ty = o.box ? o.box.y - lw * 3 : o.px.y - lw * 3;
    octx.fillText(`${role ? role + " · " : ""}${o.label}${where}`, tx, ty);
  }
}

function renderList() {
  const list = $("#objects");
  if (!state.objects.length) {
    list.innerHTML = `<p class="note">${state.frozen ? "No objects yet. After the sheet, click where each object touches the table." : "Freeze a frame to scan."}</p>`;
  } else {
    list.innerHTML = state.objects
      .map(
        (o) => `<div class="obj ${o.reach ? "far" : ""}">
          <span class="sw" style="background:${o.colour}"></span>
          <div><b>${o.label}</b> <small>${o.source === "detector" ? Math.round(o.score * 100) + "%" : "added"}</small><br>
          <small>${o.mm ? `${Math.round(o.mm.x)} mm ahead, ${Math.round(o.mm.y)} mm ${o.mm.y >= 0 ? "left" : "right"}${o.reach ? " · " + o.reach : ""}` : "mark the sheet to measure"}</small></div>
          <div class="roles">
            <button data-pick="${o.id}" class="${state.pick === o.id ? "on pick" : ""}" ${!o.mm || o.reach ? "disabled" : ""}>Pick</button>
            <button data-place="${o.id}" class="${state.place === o.id ? "on place" : ""}" ${!o.mm || o.reach ? "disabled" : ""}>Place on</button>
            <button data-del="${o.id}" aria-label="Remove ${o.label}">✕</button>
          </div></div>`,
      )
      .join("");
  }
  list.querySelectorAll("[data-pick]").forEach((b) => (b.onclick = () => choose("pick", +b.dataset.pick)));
  list.querySelectorAll("[data-place]").forEach((b) => (b.onclick = () => choose("place", +b.dataset.place)));
  list.querySelectorAll("[data-del]").forEach((b) => (b.onclick = () => remove(+b.dataset.del)));
  const ready = state.pick && state.place;
  $("#publish").disabled = !ready;
  $("#task-line").textContent = ready ? `Pick the ${obj(state.pick).label} and put it on the ${obj(state.place).label}.` : "Choose one object to pick and one to place it on.";
}
const obj = (id) => state.objects.find((o) => o.id === id);
function choose(role, id) {
  if (role === "pick") {
    state.pick = id;
    if (state.place === id) state.place = null;
  } else {
    state.place = id;
    if (state.pick === id) state.pick = null;
  }
  draw();
  renderList();
}
function remove(id) {
  state.objects = state.objects.filter((o) => o.id !== id);
  if (state.pick === id) state.pick = null;
  if (state.place === id) state.place = null;
  draw();
  renderList();
}

// ---- the task ---------------------------------------------------------------------------

export function sceneFrom(s) {
  const pick = s.objects.find((o) => o.id === s.pick), place = s.objects.find((o) => o.id === s.place);
  return {
    format: "thenar-scene/1",
    scanned_at: new Date().toISOString(),
    calibration: { method: "a4-homography", sheet_gap_mm: A4_GAP_MM, corners_px: s.corners.map((p) => [Math.round(p.x), Math.round(p.y)]) },
    image: { width: canvas.width, height: canvas.height },
    instruction: `Pick the ${pick.label} and put it on the ${place.label}.`,
    pick: { label: pick.label, colour: pick.colour, x_mm: Math.round(pick.mm.x), y_mm: Math.round(pick.mm.y) },
    place: { label: place.label, colour: place.colour, x_mm: Math.round(place.mm.x), y_mm: Math.round(place.mm.y) },
    others: s.objects.filter((o) => o.mm && o.id !== s.pick && o.id !== s.place).map((o) => ({ label: o.label, colour: o.colour, x_mm: Math.round(o.mm.x), y_mm: Math.round(o.mm.y) })),
  };
}

async function publish() {
  const scene = sceneFrom(state);
  const reward = $("#reward").value.trim();
  $("#publish").disabled = true;
  say("Sending the task to the station…");
  let res, body;
  try {
    res = await fetch("api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ scene, reward }) });
    body = await res.json().catch(() => ({}));
  } catch {
    $("#publish").disabled = false;
    return say("The station is not answering. Start it on the Mac with `pnpm relay`.", "bad");
  }
  $("#publish").disabled = false;
  if (!res.ok) return say(body.error ?? `The station refused the task (${res.status}).`, "bad");
  say(`Published on Monad as task #${body.task.id}. The headset has it now.`, "good");
  $("#published").innerHTML = `<a href="${body.task.explorer}" target="_blank" rel="noreferrer">See the transaction on Monadscan</a> · <a href="./">Open the arm</a>`;
}

$("#start").onclick = startCamera;
$("#freeze").onclick = freeze;
$("#rescan").onclick = () => (state.stream ? freeze() : startCamera());
$("#file").onchange = (e) => upload(e.target.files[0]);
$("#publish").onclick = publish;
$("#reset-corners").onclick = () => {
  state.corners = [];
  state.H = null;
  state.mode = "corners";
  measure();
  draw();
  renderList();
  say(`Click the sheet's ${CORNERS[0].name} corner.`);
};
renderList();
say("Start the camera, or upload a photo of the table.");
loadDetector().catch(() => {}); // warm the model while the user sets up
window.scan = { state, sceneFrom: () => sceneFrom(state) };
