/**
 * The web pages call contracts by hand-written selector so they can ship
 * without a web3 bundle. A wrong selector returns empty data that decodes to
 * false, which looks exactly like "not in the log" — so it is checked here
 * rather than discovered in a demo.
 */
import { readFileSync } from "node:fs";
import { keccak256, toHex } from "viem";

let fails = 0;
const ok = (c: boolean, m: string, x = "") => { if (!c) fails++; console.log(`${c ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

const sel = (sig: string) => keccak256(toHex(sig)).slice(0, 10);

const EXPECTED: Record<string, string> = {
  "anchorCount()": sel("anchorCount()"),
  "anchorAt(uint256)": sel("anchorAt(uint256)"),
  "receiptCount()": sel("receiptCount()"),
  "verifyLeaf(uint256,bytes,bytes32[],uint64)": sel("verifyLeaf(uint256,bytes,bytes32[],uint64)"),
};

const chainJs = readFileSync("apps/web/grasp-chain.js", "utf8");
for (const [sig, want] of Object.entries(EXPECTED)) {
  const name = sig.split("(")[0];
  if (!new RegExp(`${name}:\\s*"0x`).test(chainJs)) continue;
  const m = chainJs.match(new RegExp(`${name}:\\s*"(0x[0-9a-fA-F]{8})"`));
  ok(m?.[1] === want, `grasp-chain.js ${sig}`, `${m?.[1]} vs ${want}`);
}

const verifyHtml = readFileSync("apps/web/verify.html", "utf8");
const m = verifyHtml.match(/const SELECTOR = "(0x[0-9a-fA-F]{8})"/);
ok(m?.[1] === EXPECTED["verifyLeaf(uint256,bytes,bytes32[],uint64)"],
   "verify.html SELECTOR is verifyLeaf", `${m?.[1]} vs ${EXPECTED["verifyLeaf(uint256,bytes,bytes32[],uint64)"]}`);

// The addresses the pages use must be the ones the deployment recorded.
const env = Object.fromEntries(readFileSync(".env.contracts", "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
for (const [key, field] of [["GRASP_LOG", "log"], ["LEAF_VERIFIER", "verifier"],
                            ["TASK_REGISTRY", "registry"], ["FOUNDRY_MARKET", "market"]] as const) {
  const found = chainJs.match(new RegExp(`${field}:\\s*"(0x[0-9a-fA-F]{40})"`))?.[1];
  ok(found?.toLowerCase() === env[key]?.toLowerCase(), `grasp-chain.js ${field} matches the deployment`,
     `${found?.slice(0, 12)}… vs ${env[key]?.slice(0, 12)}…`);
}

console.log(fails === 0 ? "\nselectors and addresses agree with the deployment\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
