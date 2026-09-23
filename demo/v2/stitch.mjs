/**
 * Drop the hand-recorded Selfie Check into the cut.
 *
 *   node demo/v2/stitch.mjs ~/Desktop/selfie.mov [--from 0:04] [--to 1:02]
 *
 * cut.mjs leaves a slot after the "Done for real" card and writes the video as
 * the two halves either side of it. This fits the recording to the same frame
 * (1920x1080, 30 fps, letterboxed on black, 48 kHz stereo — silence if it has
 * no sound), joins the three, and speeds the recording up only as far as it
 * takes to keep the whole video under five minutes.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const OUT = "demo/v2/out";
const P1 = `${OUT}/thenar-demo-part1.mp4`, P2 = `${OUT}/thenar-demo-part2.mp4`;
const LIMIT = 299, MAX_SPEED = 3;

const argv = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith("--")) flags[argv[i].slice(2)] = argv[++i];
  else positional.push(argv[i]);
}
const src = positional[0];
const FINAL = flags.out ?? `${OUT}/thenar-demo-final.mp4`;
if (!src || !existsSync(src)) {
  console.error("usage: node demo/v2/stitch.mjs <selfie-recording> [--from m:ss] [--to m:ss] [--out file.mp4]");
  process.exit(1);
}
for (const f of [P1, P2, `${OUT}/slot.json`]) if (!existsSync(f)) throw new Error(`MISSING_PART:${f} (run cut.mjs all first)`);

const run = (cmd, a) => execFileSync(cmd, a, { stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 }).toString();
const probe = (f, sel, entries) => run("ffprobe", ["-v", "error", ...sel, "-show_entries", entries, "-of", "csv=p=0", f]).trim();
const durOf = (f) => Number(probe(f, [], "format=duration"));
const secs = (s) => (s == null ? undefined : s.split(":").reduce((a, p) => a * 60 + Number(p), 0));
const mmss = (x) => `${Math.floor(x / 60)}:${String(Math.floor(x % 60)).padStart(2, "0")}`;

const slot = JSON.parse(readFileSync(`${OUT}/slot.json`, "utf8"));
const d1 = durOf(P1), d2 = durOf(P2);
const from = secs(flags.from) ?? 0;
const to = Math.min(durOf(src), secs(flags.to) ?? Infinity);
const raw = to - from;
if (!(raw > 1)) throw new Error(`EMPTY_RANGE: ${from}s to ${to}s`);
const budget = LIMIT - d1 - d2;
const speed = raw > budget ? raw / budget : 1;
if (speed > MAX_SPEED) {
  throw new Error(`TOO_LONG: ${raw.toFixed(0)}s of recording would need ${speed.toFixed(1)}x to fit five minutes. Trim it with --from/--to to under ${(budget * MAX_SPEED).toFixed(0)}s.`);
}
const hasAudio = probe(src, ["-select_streams", "a"], "stream=index") !== "";

const FRAME = "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0D0D0F,setsar=1,fps=30,format=yuv420p";
const STEREO = "aresample=48000,aformat=sample_fmts=fltp:sample_rates=48000:channel_layouts=stereo";
// atempo takes at most 2.0 per stage.
const tempo = (s) => { const out = []; let r = s; while (r > 2) { out.push("atempo=2"); r /= 2; } out.push(`atempo=${r.toFixed(4)}`); return out.join(","); };

const inputs = ["-i", P1, "-ss", from.toFixed(3), "-to", to.toFixed(3), "-i", src, "-i", P2];
if (!hasAudio) inputs.push("-f", "lavfi", "-t", raw.toFixed(3), "-i", "anullsrc=r=48000:cl=stereo");
const graph = [
  `[0:v]setsar=1,format=yuv420p[v0]`,
  `[0:a]${STEREO}[a0]`,
  `[1:v]setpts=(PTS-STARTPTS)/${speed.toFixed(4)},${FRAME}[v1]`,
  `[${hasAudio ? "1:a" : "3:a"}]asetpts=PTS-STARTPTS,${STEREO}${speed > 1.0001 ? `,${tempo(speed)}` : ""}[a1]`,
  `[2:v]setsar=1,format=yuv420p[v2]`,
  `[2:a]${STEREO}[a2]`,
  `[v0][a0][v1][a1][v2][a2]concat=n=3:v=1:a=1[v][a]`,
].join(";");

console.log(`recording ${raw.toFixed(1)}s${speed > 1.0001 ? ` at ${speed.toFixed(2)}x` : ""}${hasAudio ? "" : " (no sound in it; silence laid under)"}`);
run("ffmpeg", ["-y", "-hide_banner", "-loglevel", "error", ...inputs, "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
  "-c:v", "libx264", "-preset", "medium", "-crf", "16", "-pix_fmt", "yuv420p", "-r", "30",
  "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-movflags", "+faststart", FINAL]);

const total = durOf(FINAL);
const clip = total - d1 - d2;
console.log(`DONE ${FINAL} ${mmss(total)}`);
console.log(`Selfie Check recording runs ${mmss(slot.slotAt)}–${mmss(slot.slotAt + clip)}`);
for (const c of slot.afterSlot) console.log(`chapter ${mmss(d1 + clip + c.offset)} ${c.name}`);
if (total > 300) console.log(`WARNING: ${mmss(total)} is over five minutes`);
