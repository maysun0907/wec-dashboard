import Image from "next/image";

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

// next/image hint for which optimized variant to request — matches
// the rendered pixel size so we don't pull an 80 px asset for a 20 px
// table cell.
const IMG_SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "20px",
  md: "32px",
  lg: "48px",
  xl: "80px",
};

// FIA's brand PNGs ship with a generous transparent margin baked in,
// so the mark itself only occupies ~50-60 % of the file. Counter that
// with a CSS scale on the image element — the pill stays the chosen
// size, the brand mark blows up to fill it. overflow-hidden on the
// parent clips any sliver that crosses the rounded corners.

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
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded bg-white",
        SIZE[size],
        className,
      )}
    >
      <Image
        src={src}
        alt={name ?? ""}
        fill
        sizes={IMG_SIZES[size]}
        className="object-contain scale-[1.5]"
        loading="lazy"
      />
    </span>
  );
}
