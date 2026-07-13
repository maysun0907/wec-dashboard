"use client";

import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import type { ComponentProps } from "react";

import type { RaceLapChart } from "@/components/race-lap-chart";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function RaceLapChartFallback() {
  const t = useTranslations("raceDetail");

  return (
    <Card aria-busy="true" aria-live="polite">
      <CardHeader>
        <CardTitle>{t("positionChart")}</CardTitle>
      </CardHeader>
      <CardContent className="flex h-[452px] items-center justify-center text-center text-sm text-muted-foreground">
        <span role="status">{t("loadingLapData")}</span>
      </CardContent>
    </Card>
  );
}

// Recharts is only needed for completed race sessions. Keeping the dynamic
// import inside this Client Component removes the charting library from the
// race page's initial JavaScript while preserving the chart's layout space.
const Chart = dynamic(
  () => import("@/components/race-lap-chart").then((m) => m.RaceLapChart),
  {
    ssr: false,
    loading: RaceLapChartFallback,
  },
);

export function RaceLapChartLazy(
  props: ComponentProps<typeof RaceLapChart>,
) {
  return <Chart {...props} />;
}
