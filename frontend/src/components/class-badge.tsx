import { cn } from "@/lib/utils";
import { raceClassLabel, type RaceClass } from "@/lib/api";

// Match each modern class to a brand color CSS variable. Older classes
// (LMP1, LMGTE Pro/Am) reuse the closest tier's color since the dashboard
// only adds them for past-season backfill.
const STYLES: Record<RaceClass, string> = {
  HYPERCAR: "bg-[var(--class-hypercar)]/15 text-[var(--class-hypercar)]",
  LMP1: "bg-[var(--class-hypercar)]/15 text-[var(--class-hypercar)]",
  LMP2: "bg-[var(--class-lmp2)]/15 text-[var(--class-lmp2)]",
  LMGT3: "bg-[var(--class-lmgt3)]/15 text-[var(--class-lmgt3)]",
  LMGTE_PRO: "bg-[var(--class-lmgt3)]/15 text-[var(--class-lmgt3)]",
  LMGTE_AM: "bg-[var(--class-lmgt3)]/15 text-[var(--class-lmgt3)]",
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
        "inline-flex h-5 items-center whitespace-nowrap rounded px-1.5 text-[10px] font-semibold tracking-wider uppercase",
        STYLES[raceClass],
        className,
      )}
    >
      {raceClassLabel(raceClass)}
    </span>
  );
}
