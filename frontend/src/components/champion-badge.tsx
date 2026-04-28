import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  /** Number of championship titles. Renders nothing when 0. */
  titles: number;
  /** Trophy size — defaults to compact for inline use next to a name. */
  size?: "sm" | "md";
  className?: string;
};

/** Pill rendered next to driver/manufacturer/team names that signals
 *  career championship totals. Goes "Nx champion" with a trophy. */
export function ChampionBadge({ titles, size = "sm", className }: Props) {
  if (titles <= 0) return null;
  const iconSize = size === "md" ? "size-3.5" : "size-3";
  const text = `${titles}× champion`;
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1 rounded-full border border-[var(--racing-yellow)]/40 bg-[var(--racing-yellow)]/10 px-2 py-0.5 text-[var(--racing-yellow)]",
        size === "md" ? "text-xs" : "text-[10px]",
        className,
      )}
      title={text}
    >
      <Trophy className={iconSize} fill="currentColor" />
      <span className="font-semibold">{text}</span>
    </span>
  );
}
