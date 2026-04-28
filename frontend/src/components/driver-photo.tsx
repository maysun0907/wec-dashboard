import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  name: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "size-7",
  md: "size-10",
  lg: "size-16",
  xl: "size-24",
};

const FALLBACK_TEXT: Record<NonNullable<Props["size"]>, string> = {
  sm: "text-[10px]",
  md: "text-xs",
  lg: "text-base",
  xl: "text-xl",
};

/** Round portrait avatar for a driver. Falls back to monogrammed initials
 *  when the Wikipedia article had no lead image. Photos come from the
 *  Wikipedia summary thumbnail (~330px wide) so we let CSS scale them.
 */
export function DriverPhoto({ src, name, size = "sm", className }: Props) {
  const initials = monogram(name ?? "");
  if (!src) {
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-full",
          "bg-secondary/60 font-semibold text-muted-foreground",
          SIZE[size],
          FALLBACK_TEXT[size],
          className,
        )}
        aria-label={name ?? "Driver"}
      >
        {initials}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-secondary/40",
        SIZE[size],
        className,
      )}
    >
      <img
        src={src}
        alt={name ?? ""}
        className="size-full object-cover"
        loading="lazy"
      />
    </span>
  );
}

function monogram(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}
