/** Put a real capture leaf into the live log so /verify's capture sample works. */
import { readFileSync, writeFileSync } from "node:fs";
import { createPublicClient, http, parseAbi, keccak256, toHex } from "viem";
import { LogStore } from "../services/log/src/store.ts";
import { anchorHead, MONAD } from "../services/log/src/anchorer.ts";
import { encodeClip, hashLeaf, commitConsent } from "../packages/protocol/src/leaf.ts";

const c = Object.fromEntries(readFileSync(".env.contracts", "utf8").split("\n").filter(Boolean)
  .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1)]; }));
const pub = createPublicClient({ chain: MONAD, transport: http() });
const vAbi = parseAbi(["function verifyLeaf(uint256 index, bytes preimage, bytes32[] proof, uint64 leafIndex) view returns (bool)"]);
const h = (s) => keccak256(toHex(s));

const store = new LogStore(process.env.THENAR_LOG_DB ?? ".data/log.db");
const stamp = BigInt(Math.floor(Date.now() / 1000));
const clip = {
  payloadHash: h(`capture-payload-${stamp}`),
  manifestHash: h("band-manifest-v1"),
  consentCommitment: commitConsent(h(`consent-record-${stamp}`), h(`salt-${stamp}`)),
  termsId: h("thenar-licence-v1"),
  capturedAt: stamp - 600n, submittedAt: stamp - 300n,
  durationMs: 4200, scopeBits: 11, channels: 6,
};
const pre = encodeClip(clip);
const idx = store.append(hashLeaf(pre), { preimage: pre });
const a = await anchorHead(store, c.GRASP_LOG);
console.log(`capture at leaf ${idx}; anchor #${a.index} size ${a.size}`);

const proof = store.inclusionProof(idx, a.size);
const ok = await pub.readContract({ address: c.LEAF_VERIFIER, abi: vAbi, functionName: "verifyLeaf",
  args: [BigInt(a.index), pre, proof, BigInt(idx)] });
if (!ok) throw new Error("the capture does not verify — refusing to publish a sample that fails");
console.log("the chain confirms the capture is in the log");

writeFileSync("apps/web/sample-proof.json", JSON.stringify({
  network: "Monad Testnet (10143)", log: c.GRASP_LOG, verifier: c.LEAF_VERIFIER,
  anchorIndex: a.index, leafIndex: idx, preimage: pre, proof, expected: true,
  note: "Paste these into /verify. The contract should answer: in the log.",
}, null, 2));
store.close();
console.log("wrote apps/web/sample-proof.json");
