/**
 * The audit itself, with no CRE in it, so it can be tested in Node.
 *
 * A node fetches the episodes Thenar serves for each task and builds each
 * task's Merkle root itself (the construction lib/merkle.ts uses: leaves
 * sorted and deduplicated, pairs sorted before keccak256, an odd node carried
 * up). The DON agrees on the result, reads what the verifier committed to
 * CorpusManifest, and each task gets a verdict. The verdicts go on chain as
 * one report CorpusAudit.sol decodes.
 */
import { concat, decodeFunctionResult, encodeAbiParameters, encodeFunctionData, keccak256, parseAbi, type Hex } from "viem";

/** CorpusAudit.Verdict, by ordinal. */
export const Verdict = { Uncommitted: 0, Matches: 1, Grown: 2, Short: 3, Altered: 4 } as const;
export type VerdictCode = (typeof Verdict)[keyof typeof Verdict];

/** What one node saw for one task, and what the DON agrees on. */
export type Served = { taskId: number; episodes: number; root: Hex };
export type Committed = { root: Hex; episodes: number } | null;
export type Finding = {
  taskId: bigint; servedRoot: Hex; committedRoot: Hex; served: number; committed: number; verdict: VerdictCode;
};

const ZERO = `0x${"0".repeat(64)}` as Hex;
const HASH = /^0x[0-9a-fA-F]{64}$/;

const order = (a: Hex, b: Hex) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0);

/** The Merkle root of a set of episode hashes, zero for none. */
export function merkleRoot(episodeHashes: string[]): Hex {
  let layer = [...new Set(episodeHashes.map((h) => h.toLowerCase() as Hex))].sort(order);
  if (!layer.length) return ZERO;
  while (layer.length > 1) {
    const next: Hex[] = [];
    for (let i = 0; i < layer.length; i += 2) {
      if (i + 1 >= layer.length) { next.push(layer[i]); continue; }
      const [a, b] = order(layer[i], layer[i + 1]) < 0 ? [layer[i], layer[i + 1]] : [layer[i + 1], layer[i]];
      next.push(keccak256(concat([a, b])));
    }
    layer = next;
  }
  return layer[0];
}

/**
 * The /api/corpus/episodes answer, checked and reduced to roots. Anything
 * malformed throws, so a node that was served garbage disagrees with the rest
 * rather than reporting it.
 */
export function servedFrom(body: unknown, expectedChainId: number): Served[] {
  const b = body as { chainId?: unknown; tasks?: unknown };
  if (b?.chainId !== expectedChainId) throw new Error(`the server is on chain ${String(b?.chainId)}, not ${expectedChainId}`);
  if (!Array.isArray(b.tasks)) throw new Error("the server sent no task list");
  return b.tasks
    .map((t: { taskId?: unknown; episodes?: unknown }) => {
      if (!Number.isInteger(t.taskId) || (t.taskId as number) < 0) throw new Error("a task id is not a whole number");
      if (!Array.isArray(t.episodes) || !t.episodes.every((h) => typeof h === "string" && HASH.test(h))) {
        throw new Error(`task ${String(t.taskId)} has an episode that is not a 32-byte hash`);
      }
      const unique = new Set((t.episodes as string[]).map((h) => h.toLowerCase()));
      return { taskId: t.taskId as number, episodes: unique.size, root: merkleRoot([...unique]) };
    })
    .filter((s) => s.episodes > 0)
    .sort((a, b) => a.taskId - b.taskId);
}

export function verdictOf(served: Served, committed: Committed): VerdictCode {
  if (!committed) return Verdict.Uncommitted;
  if (served.root.toLowerCase() === committed.root.toLowerCase()) return Verdict.Matches;
  if (served.episodes > committed.episodes) return Verdict.Grown;
  if (served.episodes < committed.episodes) return Verdict.Short;
  return Verdict.Altered;
}

export function findingsOf(served: Served[], committed: Committed[]): Finding[] {
  return served.map((s, i) => ({
    taskId: BigInt(s.taskId),
    servedRoot: s.root,
    committedRoot: committed[i]?.root ?? ZERO,
    served: s.episodes,
    committed: committed[i]?.episodes ?? 0,
    verdict: verdictOf(s, committed[i] ?? null),
  }));
}

/** abi.encode(uint64 observedAt, Finding[]), as CorpusAudit._processReport decodes it. */
export function encodeReport(observedAt: bigint, findings: Finding[]): Hex {
  return encodeAbiParameters(
    [
      { type: "uint64", name: "observedAt" },
      {
        type: "tuple[]", name: "findings",
        components: [
          { type: "uint256", name: "taskId" },
          { type: "bytes32", name: "servedRoot" },
          { type: "bytes32", name: "committedRoot" },
          { type: "uint32", name: "served" },
          { type: "uint32", name: "committed" },
          { type: "uint8", name: "verdict" },
        ],
      },
    ],
    [observedAt, findings],
  );
}

// ---------------------------------------------------------------------------
// The one chain read: every task's committed root through Multicall3, where a
// task nobody has committed simply fails (CorpusManifest reverts NoCommitment).

const MANIFEST_ABI = parseAbi(["function latest(uint256 taskId) view returns ((bytes32 root, uint32 episodes, uint64 at))"]);
const MULTICALL_ABI = parseAbi([
  "struct Call3 { address target; bool allowFailure; bytes callData; }",
  "struct Result { bool success; bytes returnData; }",
  "function aggregate3(Call3[] calls) payable returns (Result[] returnData)",
]);
export const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

export function committedCall(manifest: Hex, taskIds: number[]): Hex {
  return encodeFunctionData({
    abi: MULTICALL_ABI, functionName: "aggregate3",
    args: [taskIds.map((t) => ({
      target: manifest, allowFailure: true,
      callData: encodeFunctionData({ abi: MANIFEST_ABI, functionName: "latest", args: [BigInt(t)] }),
    }))],
  });
}

export function committedFrom(data: Hex): Committed[] {
  const results = decodeFunctionResult({ abi: MULTICALL_ABI, functionName: "aggregate3", data }) as readonly { success: boolean; returnData: Hex }[];
  return results.map((r) => {
    if (!r.success) return null;
    const c = decodeFunctionResult({ abi: MANIFEST_ABI, functionName: "latest", data: r.returnData }) as { root: Hex; episodes: number };
    return { root: c.root, episodes: Number(c.episodes) };
  });
}
