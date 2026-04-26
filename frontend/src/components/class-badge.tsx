import { cn } from "@/lib/utils";
import type { RaceClass } from "@/lib/mock-data";

const STYLES: Record<RaceClass, string> = {
  HYPERCAR: "bg-[var(--class-hypercar)]/15 text-[var(--class-hypercar)]",
  LMP2: "bg-[var(--class-lmp2)]/15 text-[var(--class-lmp2)]",
  LMGT3: "bg-[var(--class-lmgt3)]/15 text-[var(--class-lmgt3)]",
};

export function ClassBadge({
  raceClass,
  className,
}: {
  raceClass: RaceClass;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded px-1.5 text-[10px] font-semibold tracking-wider uppercase",
        STYLES[raceClass],
        className,
      )}
    >
      {raceClass}
    </span>
  );
}
