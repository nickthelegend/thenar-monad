import "server-only";
import { formatEther } from "viem";
import { AXON_ABI } from "@/lib/abi";
import { AXON_ADDRESS, IS_DEPLOYED } from "@/lib/chain";
import { chainClient } from "@/lib/rpc";
import { armOf, instructionOf } from "@/lib/scan";

export type OpenTask = {
  id: number;
  instruction: string;
  arm: "so101" | "thenar6";
  rewardMon: number;
  slotsLeft: number;
  slotsTotal: number;
  escrowMon: number;
};

/** Every task on the protocol as the chain has it, and the totals across them. */
export async function openTasks(): Promise<{ tasks: OpenTask[]; escrowMon: number; slotsLeft: number } | null> {
  if (!IS_DEPLOYED) return null;
  try {
    const client = chainClient();
    const count = Number(await client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "taskCount" }));
    const raw = (await Promise.all(
      Array.from({ length: count }, (_, i) =>
        client.readContract({ address: AXON_ADDRESS, abi: AXON_ABI, functionName: "getTask", args: [BigInt(i)] }),
      ),
    )) as unknown as { name: string; rewardPerTrajectory: bigint; escrow: bigint; slotsTotal: number; slotsFilled: number }[];
    const tasks = raw.map((t, id) => ({
      id,
      instruction: instructionOf(t.name),
      arm: armOf(t.name),
      rewardMon: Number(formatEther(t.rewardPerTrajectory)),
      slotsLeft: Math.max(0, Number(t.slotsTotal) - Number(t.slotsFilled)),
      slotsTotal: Number(t.slotsTotal),
      escrowMon: Number(formatEther(t.escrow)),
    }));
    return {
      tasks,
      escrowMon: tasks.reduce((n, t) => n + t.escrowMon, 0),
      slotsLeft: tasks.reduce((n, t) => n + t.slotsLeft, 0),
    };
  } catch {
    return null;
  }
}
