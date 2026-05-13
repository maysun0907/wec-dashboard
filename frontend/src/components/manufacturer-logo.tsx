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

// next/image variant hint. Generous (2x the pill) so the upscaled
// asset under `scale-[1.3]` + retina pixels stays sharp instead of
// pulling a 32 px variant and CSS-zooming it to ~50 px (which is
// what made Porsche / Audi / Aston read as blurry).
const IMG_SIZES: Record<NonNullable<Props["size"]>, string> = {
  sm: "40px",
  md: "64px",
  lg: "96px",
  xl: "160px",
};

// FIA's brand PNGs ship with a transparent margin baked in, but the
// amount varies per file. 1.2 is the safe baseline; a handful of
// brands need an explicit override either because their PNG has
// almost no margin (Aston Martin wings + Genesis wings already touch
// the bounding box, so 1.2 starts clipping the tips) or because the
// mark sits inside a lot of extra whitespace (BMW roundel reads tiny
// at 1.2). Matched by substring on the `name` prop — works for both
// "BMW" (manufacturer name) and "BMW M Team WRT" (team name).
const BRAND_SCALE_OVERRIDES: Array<{ match: RegExp; scale: number }> = [
  { match: /bmw/i, scale: 1.5 },
  // Audi's PNG centres the four rings in roughly the middle 50 % of
  // a square canvas, so the rings read tiny at 1.2× — bump to 1.6×.
  { match: /audi/i, scale: 1.6 },
  { match: /aston\s*martin/i, scale: 1.0 },
  { match: /genesis/i, scale: 1.0 },
];
const DEFAULT_SCALE = 1.2;

function scaleForName(name: string | null | undefined): number {
  const n = name ?? "";
  for (const { match, scale } of BRAND_SCALE_OVERRIDES) {
    if (match.test(n)) return scale;
  }
  return DEFAULT_SCALE;
}

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
        className="object-contain"
        style={{ transform: `scale(${scaleForName(name)})` }}
        loading="lazy"
      />
    </span>
  );
}
