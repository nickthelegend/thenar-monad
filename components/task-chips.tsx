import { cn } from "@/lib/cn";
import { EMBODIMENTS } from "@/lib/embodiment";
import type { ArmKind, ScannedScene } from "@/lib/scan";

const mm = (v: number) => Math.round(v * 1000);

/**
 * What a task's name carries besides its sentence: the arm it is for, when it
 * is not the station's own, and whether its bench was measured off a real
 * table. Both are read from the name on chain, so a chip here is never a
 * claim the contract does not make.
 */
export function TaskChips({ task, className }: {
  task: { arm: ArmKind; scanned: ScannedScene | null };
  className?: string;
}) {
  if (task.arm === "thenar6" && !task.scanned) return null;
  const chip = "border px-1.5 py-px font-mono text-[11px] uppercase tracking-[0.12em] whitespace-nowrap";
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5", className)}>
      {task.arm === "so101" ? (
        <span className={cn(chip, "border-probe/60 text-probe")} title={EMBODIMENTS.so101.blurb}>
          {EMBODIMENTS.so101.label}
        </span>
      ) : null}
      {task.scanned ? (
        <span
          className={cn(chip, "border-go/60 text-go")}
          title={`Measured off a real table: the payload starts at ${mm(task.scanned.pick[0])}, ${mm(task.scanned.pick[1])} mm and goes to ${mm(task.scanned.place[0])}, ${mm(task.scanned.place[1])} mm from the arm's base.`}
        >
          Scanned
        </span>
      ) : null}
    </span>
  );
}
