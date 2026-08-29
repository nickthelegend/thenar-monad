/** The browser scorer must equal the exporter's, exactly — it is committed on chain. */
import { scoreTrajectory as b, canonicalTrajectory as bc, meanJerk as bj } from "../score.js";
import { scoreTrajectory as n, canonicalTrajectory as nc, meanJerk as nj } from "../../../packages/protocol/src/score.ts";

let fails = 0;
const ok = (c, m, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const HZ = 20;
function path(from, to, secs, jitter = 0, endOffsetMm = 0) {
  const cnt = Math.round(secs * HZ), out = [];
  for (let i = 0; i <= cnt; i++) {
    const u = i / cnt, e = u < 0.5 ? 2*u*u : 1 - Math.pow(-2*u+2, 2)/2;
    const w = jitter * Math.sin(u * 37) * 0.001;
    out.push({ t: +(i/HZ).toFixed(4), q: [0.1*e, 0.5*e, 0.9*e, 0, 1.2*e, 0],
      grip: u > 0.05 && u < 0.95 ? 6 : 42,
      object: [from[0]+(to[0]-from[0])*e+w, from[1]+(to[1]-from[1])*e+w, 0] });
  }
  const l = out[out.length-1];
  l.object = [to[0] + endOffsetMm/1000, to[1], 0];
  return out;
}
const GOAL = [0.17, -0.24];
const mk = (s, par = 90) => ({ samples: s, goal: GOAL, parSeconds: par, toleranceMm: 25 });

const cases = [
  ["dead centre", mk(path([0.3,0.2], GOAL, 90))],
  ["just inside", mk(path([0.3,0.2], GOAL, 90, 0, 24))],
  ["a miss", mk(path([0.3,0.2], GOAL, 90, 0, 40))],
  ["snatchy", mk(path([0.3,0.2], GOAL, 90, 260))],
  ["quick", mk(path([0.3,0.2], GOAL, 45), 90)],
  ["slow", mk(path([0.3,0.2], GOAL, 180), 90)],
  ["short", mk(path([0.3,0.2], GOAL, 2))],
];
let same = true, canonSame = true, jerkSame = true;
for (const [name, t] of cases) {
  if (JSON.stringify(b(t)) !== JSON.stringify(n(t))) { same = false; console.log(`    "${name}" scores differently`); }
  if (bc(t) !== nc(t)) { canonSame = false; console.log(`    "${name}" canonicalises differently`); }
  if (bj(t.samples) !== nj(t.samples)) { jerkSame = false; console.log(`    "${name}" jerk differs`); }
}
ok(same, "every case scores identically", `${cases.length} cases`);
ok(canonSame, "and canonicalises identically");
ok(jerkSame, "and measures the same jerk");

// 200 randomised trajectories, because agreeing on chosen cases proves little.
let rnd = true;
for (let i = 0; i < 200; i++) {
  const t = mk(path([0.2 + Math.random()*0.2, 0.1 + Math.random()*0.2], GOAL,
    5 + Math.random()*120, Math.random()*300, Math.random()*60), 30 + Math.random()*120);
  if (JSON.stringify(b(t)) !== JSON.stringify(n(t))) { rnd = false; break; }
}
ok(rnd, "and on 200 randomised trajectories");

let bt = false, nt = false;
try { b(mk([])); } catch { bt = true; }
try { n(mk([])); } catch { nt = true; }
ok(bt && nt, "both refuse an episode with no samples");

console.log(fails === 0 ? "\nscorer: browser and exporter agree\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
