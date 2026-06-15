"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

import type { ChampionProgressionMini } from "./champion-progression-mini";

// recharts is a heavy dependency and this season-recap chart sits below
// the fold on the home page (the most-visited route), so we keep it out
// of the initial JS and load it on the client after mount. The reserved
// min-height keeps the layout shift down while the chunk loads.
const Chart = dynamic(
  () =>
    import("./champion-progression-mini").then(
      (m) => m.ChampionProgressionMini,
    ),
  {
    ssr: false,
    loading: () => <div className="min-h-[320px]" aria-hidden />,
  },
);

export function ChampionProgressionMiniLazy(
  props: ComponentProps<typeof ChampionProgressionMini>,
) {
  return <Chart {...props} />;
}
