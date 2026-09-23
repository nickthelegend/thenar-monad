/**
 * Cut the short take into demo/simple/out/thenar-demo.mp4.
 *
 *   node demo/simple/make.mjs
 *
 * Reads the take's frames and beat marks, drops silent stretches (waiting on a
 * signature, a lookup, a page) down to the last 2.5 seconds before the next
 * line so the result that ends the wait stays in shot, lays each narration
 * line at its own mark on the remapped clock, and encodes 1920x1080 at 30 fps.
 * The station beat is never trimmed: the arm moving is the point of it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";

const D = "demo/simple", TAKE = `${D}/take`, AUDIO = `${D}/audio`, OUT = `${D}/out`;
mkdirSync(OUT, { recursive: true });
const take = JSON.parse(readFileSync(`${TAKE}/take.json`, "utf8"));
if (take.failed) throw new Error(`TAKE_FAILED: ${take.failed}`);
const frames = JSON.parse(readFileSync(`${TAKE}/frames.json`, "utf8"));
const durations = JSON.parse(readFileSync(`${AUDIO}/durations.json`, "utf8"));
const narration = JSON.parse(readFileSync(`${D}/narration.json`, "utf8"));
const at = Object.fromEntries(take.marks.map((m) => [m.id, m.ms]));
for (const n of narration) {
  if (!(n.id in at)) throw new Error(`MISSING_MARK:${n.id}`);
  if (!existsSync(`${AUDIO}/${n.id}.wav`)) throw new Error(`MISSING_AUDIO:${n.id}`);
}

const START = at.intro - 300;
const END = at.END;
const KEEP_BEFORE_NEXT = 2500, AFTER_LINE = 1000, MIN_CUT = 2000;
const NO_TRIM = new Set(["station"]);

// Silent stretches between the end of one line and the next line's mark.
const order = narration.map((n) => n.id);
const cuts = [];
for (let i = 0; i < order.length - 1; i++) {
  const id = order[i];
  if (NO_TRIM.has(id)) continue;
  const from = at[id] + durations[id] * 1000 + AFTER_LINE;
  const to = at[order[i + 1]] - KEEP_BEFORE_NEXT;
  if (to - from > MIN_CUT) cuts.push([from, to]);
}
const removedBefore = (t) => cuts.reduce((n, [a, b]) => n + (t >= b ? b - a : t > a ? t - a : 0), 0);
const inCut = (t) => cuts.some(([a, b]) => t > a && t < b);
const remap = (t) => t - START - removedBefore(t);

// Video: each kept frame shown until the next kept frame, on the remapped clock.
const kept = frames.filter((f) => f.ms >= START && f.ms <= END && !inCut(f.ms));
let list = "ffconcat version 1.0\n";
for (let i = 0; i < kept.length; i++) {
  const t = remap(kept[i].ms);
  const next = i + 1 < kept.length ? remap(kept[i + 1].ms) : remap(END);
  list += `file '../take/frames/${kept[i].name}'\nduration ${Math.max(0.001, (next - t) / 1000).toFixed(4)}\n`;
}
list += `file '../take/frames/${kept[kept.length - 1].name}'\n`;
writeFileSync(`${OUT}/frames.ffconcat`, list);

// Audio: every line at its remapped mark.
const inputs = [], filters = [];
narration.forEach((n, i) => {
  inputs.push("-i", `${AUDIO}/${n.id}.wav`);
  const delay = Math.round(remap(at[n.id]));
  filters.push(`[${i + 1}:a]aresample=48000,adelay=${delay}|${delay}[a${i}]`);
});
const mix = `${filters.join(";")};${narration.map((_, i) => `[a${i}]`).join("")}amix=inputs=${narration.length}:normalize=0:dropout_transition=0,apad[aout]`;
const total = remap(END) / 1000;

execFileSync("ffmpeg", [
  "-y", "-hide_banner", "-loglevel", "error",
  "-f", "concat", "-safe", "0", "-i", `${OUT}/frames.ffconcat`,
  ...inputs,
  "-filter_complex", `[0:v]scale=1920:1080:flags=lanczos,fps=30,format=yuv420p[vout];${mix}`,
  "-map", "[vout]", "-map", "[aout]", "-t", total.toFixed(3),
  "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
  `${OUT}/thenar-demo.mp4`,
], { stdio: "inherit" });

const probe = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", `${OUT}/thenar-demo.mp4`]).toString();
console.log(`cuts: ${cuts.map(([a, b]) => `${((b - a) / 1000).toFixed(1)}s`).join(", ") || "none"}`);
console.log(`kept ${kept.length} frames, ${total.toFixed(1)}s`);
console.log(probe);
