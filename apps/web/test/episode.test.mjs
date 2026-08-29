/** The browser encoder must produce the same bytes as the exporter's — a leaf
 *  built in one and verified by the other is the whole point. */
import { encodeEpisode as be, hashEpisodeLeaf as bh, episodeFacts as bf, EPISODE_PREIMAGE_BYTES } from "../episode.js";
import { encodeEpisode as ne, hashEpisodeLeaf as nh, episodeFacts as nf } from "../../../packages/protocol/src/episode.ts";

let fails = 0;
const ok = (c, m, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const w = (n) => "0x" + n.toString(16).padStart(64, "0");
const base = {
  payloadHash: w(1), manifestHash: w(2), consentCommitment: w(3), termsId: w(4), taskId: w(5),
  capturedAt: 1756000000n, submittedAt: 1756000091n, durationMs: 91000, scopeBits: 11,
  channels: 3, worldSeed: 42n, successFlag: 1, qualityScore: 8123,
};
ok(be(base) === ne(base), "the same episode encodes to the same bytes");
ok(be(base).length / 2 - 1 === EPISODE_PREIMAGE_BYTES, "and is 197 bytes", `${be(base).length / 2 - 1}`);
ok(bh(be(base)) === nh(ne(base)), "and hashes to the same leaf", bh(be(base)).slice(0, 18));
const sameFacts = (a, b) =>
  a.taskId === b.taskId && a.worldSeed === b.worldSeed &&
  a.success === b.success && a.qualityScore === b.qualityScore;
ok(sameFacts(bf(be(base)), nf(ne(base))), "and decodes to the same facts");

// Extremes: every field at its ceiling, which is where a size mistake shows.
const max = { ...base, capturedAt: 2n ** 64n - 1n, submittedAt: 2n ** 64n - 1n,
  durationMs: 2 ** 32 - 1, scopeBits: 2 ** 32 - 1, channels: 255,
  worldSeed: 2n ** 64n - 1n, successFlag: 1, qualityScore: 10000 };
ok(be(max) === ne(max), "every field at its ceiling still agrees");
const zero = { ...base, capturedAt: 0n, submittedAt: 0n, durationMs: 0, scopeBits: 0,
  channels: 0, worldSeed: 0n, successFlag: 0, qualityScore: 0 };
ok(be(zero) === ne(zero), "and every field at zero");

// 300 randomised episodes.
let rnd = true, why = "";
const r64 = () => BigInt(Math.floor(Math.random() * 2 ** 32)) * 4294967296n + BigInt(Math.floor(Math.random() * 2 ** 32));
for (let i = 0; i < 300; i++) {
  const e = { payloadHash: w(BigInt(i) * 7919n), manifestHash: w(BigInt(i) + 1n),
    consentCommitment: w(r64()), termsId: w(r64()), taskId: w(r64()),
    capturedAt: r64(), submittedAt: r64(), durationMs: Math.floor(Math.random() * 2 ** 32),
    scopeBits: Math.floor(Math.random() * 2 ** 32), channels: Math.floor(Math.random() * 256),
    worldSeed: r64(), successFlag: Math.random() < 0.5 ? 0 : 1,
    qualityScore: Math.floor(Math.random() * 10001) };
  if (be(e) !== ne(e)) { rnd = false; why = JSON.stringify(e, (k, v) => typeof v === "bigint" ? String(v) : v); break; }
  if (bh(be(e)) !== nh(ne(e))) { rnd = false; why = "leaf differs"; break; }
}
ok(rnd, "and 300 randomised episodes agree, bytes and leaf", why.slice(0, 90));

let bt = false, nt = false;
try { be({ ...base, qualityScore: 10001 }); } catch { bt = true; }
try { ne({ ...base, qualityScore: 10001 }); } catch { nt = true; }
ok(bt && nt, "both refuse a score above 100%");

let short = false;
try { be({ ...base, payloadHash: "0xdead" }); } catch { short = true; }
ok(short, "the browser refuses a short hash rather than padding it silently");

console.log(fails === 0 ? "\nepisode: browser and exporter agree\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
