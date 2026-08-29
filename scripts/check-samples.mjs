/**
 * Both samples the /verify page offers must actually verify against the live
 * deployment. A sample that fails turns the page's own demonstration into
 * evidence against it, so this runs in the suite rather than by hand.
 */
import { readFileSync } from "node:fs";
import { createPublicClient, http, parseAbi } from "viem";
import { CHAIN } from "../services/log/src/chain.ts";

const c = Object.fromEntries(readFileSync(".env.contracts", "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const pub = createPublicClient({ chain: CHAIN, transport: http() });
const abi = parseAbi([
  "function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)",
  "function episodeFacts(bytes preimage) view returns (bytes32 taskId, uint64 worldSeed, bool success, uint16 qualityScore)",
]);

let fails = 0;
const ok = (c_, m, x = "") => { if (!c_) fails++; console.log(`${c_ ? "  ok  " : " FAIL "} ${m}${x ? ` — ${x}` : ""}`); };

for (const [file, kind, bytes] of [["sample-proof.json", "capture", 154], ["sample-episode.json", "episode", 197], ["sample-recorded.json", "recorded episode", 197]]) {
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

/* The recorded sample is the one that claims to be a real capture, so it is
   held to more than the others: the published trajectory has to earn the score
   the chain reports, and commit to the payload hash inside the leaf. Otherwise
   "recorded" is a word on a page rather than a property of the data. */
{
  const rec = JSON.parse(readFileSync("apps/web/sample-recorded.json", "utf8"));
  const bundle = JSON.parse(readFileSync("apps/web/samples/episode-c8571734.json", "utf8"));
  const chainFacts = await pub.readContract({ address: c.LEAF_VERIFIER, abi,
    functionName: "episodeFacts", args: [rec.preimage] });

  const { scoreTrajectory, canonicalTrajectory } = await import("../packages/protocol/src/score.ts");
  const { keccak256, toHex } = await import("viem");
  const again = scoreTrajectory(bundle.trajectory);

  ok(bundle.leaf === (await import("../packages/protocol/src/episode.ts"))
       .hashEpisodeLeaf(rec.preimage), "the published trajectory belongs to the anchored leaf");
  ok(again.totalBps === Number(chainFacts[3]),
     "and re-scoring it gives the score the chain reports",
     `${again.totalBps} bps`);
  ok(keccak256(toHex(canonicalTrajectory(bundle.trajectory))).toLowerCase()
       === String(bundle.episode.payloadHash).toLowerCase(),
     "and the payload hash still commits to every sample");
  ok(bundle.trajectory.samples.length === rec.recorded.samples,
     "and the sample count is the one advertised", `${bundle.trajectory.samples.length}`);
}

console.log(fails === 0 ? "\nevery published sample verifies against the live deployment\n" : `\n${fails} check(s) failed\n`);
process.exit(fails ? 1 : 0);
