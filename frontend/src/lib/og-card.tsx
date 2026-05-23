/* eslint-disable @typescript-eslint/no-explicit-any */
// Shared 1200x630 social card used by every route's opengraph-image.tsx.
//
// Strict subset of JSX (no Tailwind, no CSS modules - only inline `style`)
// because `next/og`'s renderer is Satori. See
//   node_modules/next/dist/docs/01-app/03-api-reference/04-functions/image-response.md
// for the supported style surface.

import type { ReactElement } from "react";

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = "image/png" as const;

// Colour tokens - keep in sync with src/app/globals.css `:root` palette.
const BG = "#0b0a08";
const INK = "#f1ebdf";
const INK_DIM = "#8a8275";
const FLAME = "#ff5b1f";

// True when the string contains any non-Latin character. Used to fall back
// from Instrument Serif (Latin-only) to Geist sans for the big title.
// Range U+0020..U+024F covers Basic Latin + Latin-1 Supplement +
// Latin Extended-A/B, which includes accented letters used in driver
// names. Anything outside that - CJK, Cyrillic, Arabic - forces the
// fallback because Instrument Serif lacks those glyphs.
function hasNonLatin(s: string): boolean {
  return /[^ -ɏ]/.test(s);
}

// Pick a comfortable font size for the title. Shorter strings = bigger.
function titleFontSize(title: string): number {
  const len = title.length;
  if (len <= 12) return 200;
  if (len <= 18) return 168;
  if (len <= 26) return 132;
  if (len <= 36) return 104;
  if (len <= 48) return 84;
  return 72;
}

export type OgCardProps = {
  title: string;
  tagline: string;
};

export function OgCard({ title, tagline }: OgCardProps): ReactElement {
  const titleIsLatin = !hasNonLatin(title);
  const titleFontFamily = titleIsLatin ? "Instrument Serif" : "Geist";
  const titleFontStyle: "italic" | "normal" = titleIsLatin ? "italic" : "normal";
  const titleFontWeight = titleIsLatin ? 400 : 500;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: BG,
        color: INK,
        fontFamily: "Geist",
        position: "relative",
      }}
    >
      {/* Wordmark, top-left */}
      <div
        style={{
          position: "absolute",
          top: 40,
          left: 48,
          display: "flex",
          alignItems: "baseline",
          fontSize: 36,
          letterSpacing: -1,
        }}
      >
        <span
          style={{
            fontFamily: "Instrument Serif",
            fontStyle: "italic",
            color: INK,
          }}
        >
          wec
        </span>
        <span style={{ width: 6 }} />
        <span style={{ fontFamily: "Geist", color: INK, fontWeight: 500 }}>
          dash
        </span>
        <span style={{ color: FLAME, fontFamily: "Geist", fontWeight: 500 }}>
          .
        </span>
      </div>

      {/* Title + tagline block */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 168,
          marginLeft: 64,
          marginRight: 64,
          gap: 40,
          flex: 1,
          justifyContent: "center",
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: titleFontFamily,
            fontStyle: titleFontStyle,
            fontWeight: titleFontWeight as any,
            fontSize: titleFontSize(title),
            lineHeight: 0.95,
            letterSpacing: -2,
            color: INK,
            maxWidth: 1072,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: "flex",
            fontFamily: "Geist Mono",
            fontSize: 26,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: INK_DIM,
            maxWidth: 1072,
          }}
        >
          {tagline}
        </div>
      </div>

      {/* Site mark, bottom-right */}
      <div
        style={{
          position: "absolute",
          right: 48,
          bottom: 40,
          display: "flex",
          fontFamily: "Geist Mono",
          fontSize: 22,
          color: INK_DIM,
          letterSpacing: 2,
        }}
      >
        wecdash.com
      </div>

      {/* Flame accent bar across the bottom */}
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: 3,
          background: FLAME,
        }}
      />
    </div>
  );
}
