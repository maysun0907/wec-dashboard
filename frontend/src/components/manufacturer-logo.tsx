import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  name: string | null | undefined;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "size-5",
  md: "size-8",
  lg: "size-12",
  xl: "size-20",
};

const PADDING: Record<NonNullable<Props["size"]>, string> = {
  sm: "p-0.5",
  md: "p-1",
  lg: "p-1.5",
  xl: "p-2",
};

/** Renders a manufacturer logo with a name-initial fallback for missing
 *  images. Sits on a white pill so brand colors render naturally on the
 *  dark theme (no invert filter — it would mangle multi-color logos like
 *  McLaren's speedmark or Toyota's red oval).
 */
export function ManufacturerLogo({ src, name, size = "sm", className }: Props) {
  if (!src) {
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    return (
      <span
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded bg-secondary/40",
          "font-mono text-[10px] font-semibold text-muted-foreground",
          SIZE[size],
          className,
        )}
        aria-label={name ?? "Unknown manufacturer"}
      >
        {initial}
      </span>
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-white",
        SIZE[size],
        className,
      )}
    >
      <img
        src={src}
        alt={name ?? ""}
        className={cn("size-full object-contain", PADDING[size])}
        loading="lazy"
      />
    </span>
  );
}
