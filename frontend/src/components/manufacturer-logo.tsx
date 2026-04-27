import { cn } from "@/lib/utils";

type Props = {
  src: string | null | undefined;
  name: string | null | undefined;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZE: Record<NonNullable<Props["size"]>, string> = {
  sm: "size-5",
  md: "size-8",
  lg: "size-12",
};

/** Renders a manufacturer logo with a name-initial fallback for missing
 *  images. Wikipedia logos vary in dimensions, so we use object-contain
 *  with a brightness filter that keeps them legible on the dark theme.
 */
export function ManufacturerLogo({ src, name, size = "sm", className }: Props) {
  const cls = cn(
    "inline-flex shrink-0 items-center justify-center rounded bg-secondary/40",
    SIZE[size],
    className,
  );
  if (!src) {
    const initial = (name?.trim()[0] ?? "?").toUpperCase();
    return (
      <span
        className={cn(
          cls,
          "font-mono text-[10px] font-semibold text-muted-foreground",
        )}
        aria-label={name ?? "Unknown manufacturer"}
      >
        {initial}
      </span>
    );
  }
  return (
    <span className={cls}>
      <img
        src={src}
        alt={name ?? ""}
        className="size-full object-contain p-0.5 brightness-0 invert"
        loading="lazy"
      />
    </span>
  );
}
