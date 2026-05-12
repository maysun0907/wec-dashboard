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

// FIA's brand PNGs ship with a transparent margin baked in. Scale
// 1.2 trims that margin while staying inside the pill's clip radius
// for the widest marks (Aston Martin wings, Audi rings, Alpine A).
// Going higher started eating their horizontal extent.

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
        className="object-contain scale-[1.2]"
        loading="lazy"
      />
    </span>
  );
}
