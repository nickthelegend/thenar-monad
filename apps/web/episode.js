/* episode.js — the 197-byte episode preimage, in the browser.
 *
 * A mirror of packages/protocol/src/episode.ts. The layout must be identical
 * byte for byte or a leaf built in the browser will not verify against the log;
 * `episode.test.mjs` encodes the same episodes through both and compares.
 */
import { keccak256 } from "./keccak.js";

export const EPISODE_PREIMAGE_BYTES = 197;
export const EPISODE_VERSION = 2;

const b = (v, bytes) => {
  const n = BigInt(v);
  if (n < 0n) throw new Error("negative values do not encode");
  const hex = n.toString(16);
  if (hex.length > bytes * 2) throw new Error(`value ${n} does not fit in ${bytes} bytes`);
  return hex.padStart(bytes * 2, "0");
};
const strip = (h) => {
  const s = String(h).replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]*$/.test(s)) throw new Error(`not hex: ${h}`);
  return s;
};
const word = (h, name) => {
  const s = strip(h);
  if (s.length !== 64) throw new Error(`${name} must be 32 bytes, got ${s.length / 2}`);
  return s;
};

export function encodeEpisode(e) {
  if (e.qualityScore > 10000) throw new Error(`qualityScore ${e.qualityScore} exceeds 10000 bps`);
  const out =
    b(EPISODE_VERSION, 1) +
    word(e.payloadHash, "payloadHash") +
    word(e.manifestHash, "manifestHash") +
    word(e.consentCommitment, "consentCommitment") +
    word(e.termsId, "termsId") +
    word(e.taskId, "taskId") +
    b(e.capturedAt, 8) + b(e.submittedAt, 8) +
    b(e.durationMs, 4) + b(e.scopeBits, 4) + b(e.channels, 1) +
    b(e.worldSeed, 8) + b(e.successFlag, 1) + b(e.qualityScore, 2);
  if (out.length / 2 !== EPISODE_PREIMAGE_BYTES) {
    throw new Error(`episode preimage must be ${EPISODE_PREIMAGE_BYTES} bytes, got ${out.length / 2}`);
  }
  return `0x${out}`;
}

/** RFC 6962 leaf hash, domain-separated so no interior node can pose as a leaf. */
export const hashEpisodeLeaf = (preimage) => keccak256(`0x00${strip(preimage)}`);

/** The fields a buyer filters on, decoded from the preimage. */
export function episodeFacts(preimage) {
  const raw = strip(preimage);
  if (raw.length / 2 !== EPISODE_PREIMAGE_BYTES) throw new Error("wrong preimage length");
  const at = (off, len) => `0x${raw.slice(off * 2, (off + len) * 2)}`;
  return {
    taskId: at(129, 32),
    worldSeed: BigInt(at(186, 8)),
    success: Number(BigInt(at(194, 1))) === 1,
    qualityScore: Number(BigInt(at(195, 2))),
  };
}
