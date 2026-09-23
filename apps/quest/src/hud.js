// The in-headset panel: one canvas texture on one plane, redrawn a few times a
// second. No DOM in XR, and no font files to fetch on a headset.
import * as THREE from "three";

const W = 1024, H = 600;
const INK = "#f4f1ea", DIM = "#9aa3b2", AMBER = "#f2b845", RED = "#ff5a4f", GREEN = "#4fd18b", BLUE = "#6f9cf0";

export class Hud {
  constructor({ jointNames, limits }) {
    this.jointNames = jointNames;
    this.limits = limits;
    this.canvas = document.createElement("canvas");
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext("2d");
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    const mat = new THREE.MeshBasicMaterial({ map: this.texture, transparent: true, depthWrite: false, toneMapped: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.34, (0.34 * H) / W), mat);
    this.mesh.renderOrder = 10;
    this.last = 0;
  }

  draw(s, now = performance.now()) {
    if (now - this.last < 100) return;
    this.last = now;
    const c = this.ctx;
    c.clearRect(0, 0, W, H);
    round(c, 0, 0, W, H, 36);
    c.fillStyle = "rgba(12,15,22,0.86)";
    c.fill();
    c.strokeStyle = "rgba(255,255,255,0.14)";
    c.lineWidth = 3;
    c.stroke();

    c.fillStyle = INK;
    c.font = "700 40px ui-sans-serif, system-ui, sans-serif";
    c.fillText("THENAR", 44, 70);
    c.fillStyle = DIM;
    c.font = "500 26px ui-sans-serif, system-ui, sans-serif";
    c.fillText("SO-101 · MG996R follower", 214, 68);

    // Right-hand status pills.
    let x = W - 44;
    const pill = (text, color) => {
      c.font = "700 24px ui-sans-serif, system-ui, sans-serif";
      const w = c.measureText(text).width + 36;
      x -= w;
      round(c, x, 38, w, 44, 22);
      c.fillStyle = color + "33";
      c.fill();
      c.fillStyle = color;
      c.fillText(text, x + 18, 69);
      x -= 12;
    };
    if (s.recording) pill(`● REC ${s.recordSeconds.toFixed(1)}s`, RED);
    else if (s.replaying) pill("▶ REPLAY", BLUE);
    pill(s.source.toUpperCase(), s.source === "idle" ? DIM : AMBER);
    pill(s.linkLabel, s.linkColor === "green" ? GREEN : s.linkColor === "amber" ? AMBER : DIM);

    // Joint bars.
    const top = 118, rowH = 58;
    this.jointNames.forEach((name, i) => {
      const y = top + i * rowH;
      const [lo, hi] = this.limits[i];
      const v = s.q[i];
      c.fillStyle = DIM;
      c.font = "500 25px ui-sans-serif, system-ui, sans-serif";
      c.fillText(name, 44, y + 30);
      const bx = 330, bw = 520, by = y + 12, bh = 20;
      round(c, bx, by, bw, bh, 10);
      c.fillStyle = "rgba(255,255,255,0.08)";
      c.fill();
      const zero = bx + ((0 - lo) / (hi - lo)) * bw;
      const pos = bx + ((v - lo) / (hi - lo)) * bw;
      const atLimit = v <= lo + 0.5 || v >= hi - 0.5;
      c.fillStyle = atLimit ? RED : i === 5 ? BLUE : AMBER;
      const a = Math.min(zero, pos), w = Math.max(4, Math.abs(pos - zero));
      round(c, a, by, w, bh, 10);
      c.fill();
      c.fillStyle = INK;
      c.font = "600 26px ui-monospace, Menlo, monospace";
      c.textAlign = "right";
      c.fillText(`${v >= 0 ? " " : ""}${v.toFixed(1)}°`, W - 44, y + 31);
      c.textAlign = "left";
    });

    // Footer: numbers that say whether it is working, then what to press.
    const fy = top + 6 * rowH + 20;
    c.fillStyle = DIM;
    c.font = "500 24px ui-monospace, Menlo, monospace";
    c.fillText(`reach err ${s.ikError.toFixed(1)} mm   ${s.fps.toFixed(0)} fps   episodes ${s.episodes}`, 44, fy);
    c.fillStyle = INK;
    c.font = "500 23px ui-sans-serif, system-ui, sans-serif";
    c.fillText(s.hint, 44, fy + 44);
    this.texture.needsUpdate = true;
  }
}

function round(c, x, y, w, h, r) {
  c.beginPath();
  c.roundRect(x, y, w, h, r);
}
