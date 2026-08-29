/**
 * Both samples the /verify page offers must actually verify against the live
 * deployment. A sample that fails turns the page's own demonstration into
 * evidence against it, so this runs in the suite rather than by hand.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { MONAD } from "../services/log/src/anchorer.ts";

const c = Object.fromEntries(readFileSync(".env.contracts", "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const pub = createPublicClient({ chain: MONAD, transport: http() });
const abi = parseAbi([
  "function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)",
  "function episodeFacts(bytes preimage) view returns (bytes32 taskId, uint64 worldSeed, bool success, uint16 qualityScore)",
]);

let fails = 0;
const ok = (c_, m, x = "") => { if (!c_) fails++; console.log(`${c_ ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

for (const [file, kind, bytes] of [["sample-proof.json", "capture", 154], ["sample-episode.json", "episode", 197]]) {
  const s = JSON.parse(readFileSync(`apps/web/${file}`, "utf8"));
  ok(s.log?.toLowerCase() === c.GRASP_LOG.toLowerCase(), `${file} names the current log`);
  ok((s.preimage.length - 2) / 2 === bytes, `${file} preimage is ${bytes} bytes`);
  const v = await pub.readContract({ address: c.LEAF_VERIFIER, abi, functionName: "verifyLeaf",
    args: [BigInt(s.anchorIndex), s.preimage, s.proof, BigInt(s.leafIndex)] });
  ok(v === true, `the ${kind} sample verifies on chain`, `anchor ${s.anchorIndex}, leaf ${s.leafIndex}`);

  // Altering one byte must flip it, or the commitment means nothing.
  const last = s.preimage.slice(-2);
  const flipped = s.preimage.slice(0, -2) + (last === "06" ? "07" : "06");
  let refused = false;
  try {
    refused = (await pub.readContract({ address: c.LEAF_VERIFIER, abi, functionName: "verifyLeaf",
      args: [BigInt(s.anchorIndex), flipped, s.proof, BigInt(s.leafIndex)] })) === false;
  } catch { refused = true; }
  ok(refused, `a one-byte change to the ${kind} is refused`);
}

const ep = JSON.parse(readFileSync("apps/web/sample-episode.json", "utf8"));
const facts = await pub.readContract({ address: c.LEAF_VERIFIER, abi, functionName: "episodeFacts",
  args: [ep.preimage] });
ok(facts[0] === ep.taskId && Number(facts[1]) === ep.worldSeed && facts[3] === ep.qualityScore,
   "the episode sample's advertised facts match what the chain decodes",
   `seed ${facts[1]}, ${facts[3]} bps`);

console.log(fails === 0 ? "\nboth published samples verify against the live deployment\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
