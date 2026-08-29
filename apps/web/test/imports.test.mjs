/**
 * Every module a page imports must exist.
 *
 * gl.js was deleted once as an "orphan" because no HTML referenced it, while
 * two modules imported it. A failed import kills the whole page module, so the
 * reveal animations, the grasp trace, the chain reader and the contact form all
 * stopped attaching at once, and the site shipped that way. This is the guard.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
let fails = 0;
const ok = (c, m, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const files = readdirSync(web).filter((f) => f.endsWith(".js") || f.endsWith(".html"));
const referenced = new Set();
let checked = 0;

for (const f of files) {
  const src = readFileSync(join(web, f), "utf8");
  const specs = [
    ...src.matchAll(/from\s+"\.\/([a-zA-Z0-9._-]+\.js)"/g),
    ...src.matchAll(/import\s*\(\s*"\.\/([a-zA-Z0-9._-]+\.js)"/g),
    ...src.matchAll(/src="\.\/([a-zA-Z0-9._-]+\.js)"/g),
  ].map((m) => m[1]);
  for (const spec of specs) {
    checked++;
    referenced.add(spec);
    ok(existsSync(join(web, spec)), `${f} imports ${spec}`);
  }
}
ok(checked > 0, "found imports to check", `${checked}`);

// A module nothing reaches is dead weight — but only report it, because
// deleting on that signal alone is what caused the outage.
const shipped = readdirSync(web).filter((f) => f.endsWith(".js"));
const unreferenced = shipped.filter((f) => !referenced.has(f));
ok(unreferenced.length === 0, "no shipped module is unreachable",
   unreferenced.length ? unreferenced.join(", ") : "");

// Every stylesheet a page links must exist too.
for (const f of files.filter((x) => x.endsWith(".html"))) {
  const src = readFileSync(join(web, f), "utf8");
  for (const m of src.matchAll(/href="\.\/([a-zA-Z0-9._-]+\.css)"/g)) {
    ok(existsSync(join(web, m[1])), `${f} links ${m[1]}`);
  }
}


/* A module that exists but does not export the name being imported fails in
 * exactly the same way — the whole importing module dies. thenar-avax shipped
 * a corpus page that imported readCorpora from a grasp-chain.js which, being
 * per-chain and therefore exempt from byte-parity, had drifted and never
 * exported it. Checking the file exists was not enough. */
const exportsOf = (src) => {
  const names = new Set();
  for (const m of src.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s+(?:const|let|var|class)\s+([A-Za-z0-9_$]+)/g)) names.add(m[1]);
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(",")) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
};

for (const f of files) {
  const src = readFileSync(join(web, f), "utf8");
  for (const m of src.matchAll(/import\s*\{([^}]+)\}\s*from\s+"\.\/([a-zA-Z0-9._-]+\.js)"/g)) {
    const wanted = m[1].split(",").map((x) => x.split(/\s+as\s+/)[0].trim()).filter(Boolean);
    const target = join(web, m[2]);
    if (!existsSync(target)) continue;            // already reported above
    const have = exportsOf(readFileSync(target, "utf8"));
    const missing = wanted.filter((w) => !have.has(w));
    ok(missing.length === 0, `${f} imports ${wanted.join(", ")} from ${m[2]}`,
       missing.length ? `missing: ${missing.join(", ")}` : "");
  }
}

console.log(fails === 0 ? "\nweb imports: all resolve\n" : `\n${fails} broken reference(s)\n`);
process.exit(fails ? 1 : 0);
