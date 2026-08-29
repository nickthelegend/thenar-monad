/**
 * The two chain repositories must carry the same protocol, contracts and web
 * app. Only the chain config, the deployment record and anything naming a live
 * deployment may differ.
 *
 * thenar-avax fell 27 files behind once — missing the exporter, the corpus page
 * and the scene renderer — and separately kept an old grasp.js whose loop never
 * restarted. Neither showed up until its suite was run by hand.
 */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";

const A = process.argv[2] ?? "..";
const B = process.argv[3] ?? "../thenar-avax";
let fails = 0;
const ok = (c, m, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

/** Per-chain by design; drift here is expected, not a fault. */
const EXEMPT = new Set([
  "apps/web/grasp-chain.js",      // addresses and RPC
  "package.json",                 // deploy scripts and suite list
  "README.md",
  "foundry.toml",
  "packages/contracts/foundry.toml",
  "apps/web/sample-proof.json",
  "apps/web/sample-episode.json",
  "apps/web/sample-task.json",
  "apps/web/sample-recorded.json",   // names an anchor on one chain
  // Pages that name the chain in their prose. These cannot be byte-identical
  // by definition, and pretending they can is how the Monad site ended up
  // describing Avalanche on three pages while its contracts sat on Monad.
  "apps/web/products.html",
  "apps/web/protocol.html",
  "apps/web/company.html",
  "apps/web/verify.html",
  "packages/protocol/test/selectors.ts",
  "scripts/check-samples.mjs",
  "scripts/check-parity.mjs",
  ".env.contracts",
  "apps/web/.vercel/project.json",   // links a directory to its own Vercel project
  "services/log/src/chain.ts",      // the chain itself
]);

const SHARED = ["packages/protocol/src", "packages/contracts/src", "services", "apps/web"];

function walk(root, dir, out = []) {
  const full = join(root, dir);
  if (!existsSync(full)) return out;
  for (const e of readdirSync(full)) {
    const rel = join(dir, e);
    // An exported corpus belongs to the deployment that produced it.
    // A recorded episode is anchored on one chain; each repo carries its own.
    if (/node_modules|\.git|^out$|^cache$|^lib$|^broadcast$|^corpus-\d+$|^samples$|\.glb$|\.png$/.test(e)) continue;
    const p = join(root, rel);
    if (statSync(p).isDirectory()) walk(root, rel, out);
    else out.push(rel);
  }
  return out;
}

const digest = (p) => createHash("sha256").update(readFileSync(p)).digest("hex").slice(0, 12);

let compared = 0, missing = [], differing = [];
for (const area of SHARED) {
  for (const rel of walk(A, area)) {
    if (EXEMPT.has(rel)) continue;
    compared++;
    const b = join(B, rel);
    if (!existsSync(b)) { missing.push(rel); continue; }
    if (digest(join(A, rel)) !== digest(b)) differing.push(rel);
  }
}

ok(compared > 0, "found shared files to compare", `${compared}`);
ok(missing.length === 0, "every shared file exists in both repositories",
   missing.length ? missing.join(", ") : "");
ok(differing.length === 0, "and is byte-identical",
   differing.length ? differing.join(", ") : "");


/* Exempting a file from byte-parity creates a blind spot exactly where the
 * content is chain-specific, which is where it matters most. The Monad site
 * shipped three pages describing Avalanche — the right chain in the contracts,
 * the wrong chain in the prose — and byte-parity could never have caught it,
 * because the two repos are *meant* to differ there. This is the check that
 * would have: neither repository may name the other one's chain.
 */
const CHAIN_WORDS = {
  monad: [/\bMonad\b/i, /testnet-rpc\.monad/i, /\b10143\b/],
  avalanche: [/\bAvalanche\b/i, /\bC-Chain\b/i, /\bFuji\b/i, /\bAVAX\b/i, /\b43113\b/],
};
const chainOf = (root) => {
  const src = readFileSync(join(root, "services/log/src/chain.ts"), "utf8");
  return /43113/.test(src) ? "avalanche" : "monad";
};
const chainA = chainOf(A), chainB = chainOf(B);
ok(chainA !== chainB, "the two repositories target different chains", `${chainA} vs ${chainB}`);

for (const [root, own] of [[A, chainA], [B, chainB]]) {
  const foreign = own === "monad" ? "avalanche" : "monad";
  const offenders = [];
  for (const area of SHARED) {
    for (const rel of walk(root, area)) {
      if (!/\.(html|js|ts|md|json)$/.test(rel)) continue;
      // The generated deployment record and the chain file itself are allowed
      // to name addresses; prose is what this is about.
      if (/chain\.ts$|\.vercel\//.test(rel)) continue;
      const text = readFileSync(join(root, rel), "utf8");
      if (CHAIN_WORDS[foreign].some((re) => re.test(text))) offenders.push(rel);
    }
  }
  ok(offenders.length === 0, `the ${own} repository never names ${foreign}`,
     offenders.join(", "));
}

console.log(fails === 0 ? "\nrepositories are in parity\n" : `\n${fails} parity problem(s)\n`);
process.exit(fails ? 1 : 0);
