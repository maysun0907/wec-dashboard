"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CartesianGrid,
  Label,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassBadge } from "@/components/class-badge";
import {
  RACE_CLASSES,
  raceClassLabel,
  type LapChart,
  type LapChartCar,
  type RaceClass,
} from "@/lib/api";

const CLASS_COLOR: Partial<Record<RaceClass, string>> = {
  HYPERCAR: "var(--class-hypercar)",
  LMP1: "var(--class-hypercar)",
  LMP2: "var(--class-lmp2)",
  LMGT3: "var(--class-lmgt3)",
  LMGTE_PRO: "var(--class-lmgt3)",
  LMGTE_AM: "var(--class-lmgt3)",
};

type Mode = "overall" | "class";

export function RaceLapChart({
  sessionId,
  revalidate,
}: {
  sessionId: number;
  revalidate: number;
}) {
  const t = useTranslations("raceDetail");
  const [loaded, setLoaded] = useState<{ sessionId: number; chart: LapChart } | null>(null);
  const chart = loaded?.sessionId === sessionId ? loaded.chart : null;
  const [failedSessionId, setFailedSessionId] = useState<number | null>(null);
  const [classes, setClasses] = useState<Set<RaceClass>>(new Set());
  const [mode, setMode] = useState<Mode>("overall");
  const [hovered, setHovered] = useState<string | null>(null);

  const error = failedSessionId === sessionId;
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 10_000);
    fetch(`/api/lap-chart/${sessionId}?revalidate=${revalidate}`, {
      signal: controller.signal,
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<LapChart>;
      })
      .then((data) => {
        if (cancelled) return;
        setFailedSessionId(null);
        setLoaded({ sessionId, chart: data });
        // Default: show every class in the field.
        const present = new Set<RaceClass>(
          data.cars.map((c) => c.raceClass),
        );
        setClasses(present);
      })
      .catch(() => {
        if (!cancelled) setFailedSessionId(sessionId);
      })
      .finally(() => window.clearTimeout(timeout));
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [sessionId, revalidate]);

  const visibleCars = useMemo(() => {
    if (!chart) return [];
    return chart.cars.filter((c) => classes.has(c.raceClass));
  }, [chart, classes]);

  const yMax = useMemo(() => {
    if (!chart) return 1;
    if (mode === "overall") return chart.cars.length;
    let cap = 1;
    for (const c of visibleCars) {
      for (const p of c.classPositions) cap = Math.max(cap, p);
    }
    return cap;
  }, [chart, visibleCars, mode]);

  if (error || !chart || chart.cars.length === 0 || chart.totalLaps === 0) {
    const message = error || chart ? t("lapDataUnavailable") : t("loadingLapData");
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("positionChart")}</CardTitle>
        </CardHeader>
        <CardContent className="flex h-[452px] items-center justify-center text-center text-sm text-muted-foreground">
          {message}
        </CardContent>
      </Card>
    );
  }

  const presentClasses = RACE_CLASSES.filter((c) =>
    chart.cars.some((car) => car.raceClass === c),
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <CardTitle>{t("positionChart")}</CardTitle>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <div className="inline-flex rounded-md border border-border bg-secondary/40 p-0.5">
            {(["overall", "class"] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={
                  "rounded px-2 py-1 font-medium transition-colors " +
                  (mode === m
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground")
                }
              >
                {m === "overall" ? t("modeOverall") : t("modeByClass")}
              </button>
            ))}
          </div>
          <span className="hidden h-4 border-l border-border md:inline-block" />
          <div className="flex flex-wrap items-center gap-1">
            {presentClasses.map((c) => {
              const active = classes.has(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    setClasses((prev) => {
                      const next = new Set(prev);
                      if (next.has(c)) {
                        if (next.size > 1) next.delete(c);
                      } else next.add(c);
                      return next;
                    });
                  }}
                  className={
                    "transition-opacity " + (active ? "" : "opacity-30")
                  }
                  aria-pressed={active}
                >
                  <ClassBadge raceClass={c} />
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="min-h-[452px] px-2">
        <div className="h-[420px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              margin={{ top: 8, right: 24, left: 8, bottom: 4 }}
              onMouseLeave={() => setHovered(null)}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="var(--border)"
                opacity={0.4}
              />
              <XAxis
                type="number"
                dataKey="lap"
                domain={[1, chart.totalLaps]}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                label={{
                  value: t("lap"),
                  position: "insideBottomRight",
                  offset: -2,
                  fontSize: 11,
                  fill: "var(--muted-foreground)",
                }}
              />
              <YAxis
                type="number"
                dataKey="position"
                reversed
                domain={[1, yMax]}
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                stroke="var(--border)"
                width={32}
              />
              <Tooltip
                cursor={{
                  stroke: "var(--muted-foreground)",
                  strokeOpacity: 0.4,
                }}
                content={(p) => (
                  <ChartTooltip
                    active={p.active}
                    payload={p.payload}
                    label={p.label as number | string | undefined}
                    cars={visibleCars}
                    mode={mode}
                  />
                )}
              />
              {/* Race-control incident shading. Source data is not yet
                  wired up — the array is currently always empty. When a
                  curated incidents pipeline lands, each entry renders
                  here as a yellow (SC) or red (red-flag) band. */}
              {chart.incidents.map((inc, i) => (
                <ReferenceArea
                  key={`inc-${i}`}
                  x1={inc.startLap}
                  x2={inc.endLap}
                  ifOverflow="visible"
                  fill="var(--racing-yellow)"
                  fillOpacity={0.08}
                  stroke="var(--racing-yellow)"
                  strokeOpacity={0.25}
                  strokeDasharray="3 3"
                >
                  {inc.endLap - inc.startLap >= 2 && (
                    <Label
                      value={`SC L${inc.startLap}–${inc.endLap}`}
                      position="insideTop"
                      fill="var(--racing-yellow)"
                      fontSize={10}
                      offset={4}
                    />
                  )}
                </ReferenceArea>
              ))}
              {visibleCars.map((car) => {
                const data = car.lapNumbers.map((lap, i) => ({
                  lap,
                  position:
                    mode === "class"
                      ? car.classPositions[i]
                      : car.positions[i],
                }));
                const stroke = CLASS_COLOR[car.raceClass] ?? "currentColor";
                const isHovered = hovered === car.carNumber;
                return (
                  <Line
                    key={car.carNumber}
                    data={data}
                    type="monotone"
                    dataKey="position"
                    stroke={stroke}
                    strokeWidth={isHovered ? 2.5 : 1.2}
                    strokeOpacity={
                      hovered === null ? 0.7 : isHovered ? 1 : 0.18
                    }
                    dot={false}
                    isAnimationActive={false}
                    onMouseEnter={() => setHovered(car.carNumber)}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 px-2 text-xs text-muted-foreground">
          {t("lapChartFootnote")}
          {chart.incidents.length > 0 && (
            <>
              {" "}
              {t("yellowBands")}{" "}
              <span className="text-[var(--racing-yellow)]">
                {t("scFcyPeriods")}
              </span>
              .
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}

function ChartTooltip(props: {
  active?: boolean;
  payload?: readonly { payload?: { lap?: number } }[];
  label?: number | string;
  cars: LapChartCar[];
  mode: Mode;
}) {
  const { active, payload, label, cars, mode } = props;
  if (!active || !payload?.length) return null;
  // Recharts hands us the points actually on top at the cursor lap; we
  // re-derive who's at what position so the tooltip lists the leaders.
  const lap =
    typeof label === "number"
      ? label
      : Number(label ?? payload[0]?.payload?.lap ?? 0);
  const pos: { car: LapChartCar; position: number }[] = [];
  for (const car of cars) {
    const idx = car.lapNumbers.indexOf(lap);
    if (idx < 0) continue;
    const p = mode === "class" ? car.classPositions[idx] : car.positions[idx];
    pos.push({ car, position: p });
  }
  pos.sort((a, b) => a.position - b.position);
  const top = pos.slice(0, 5);
  return (
    <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-md backdrop-blur">
      <div className="mb-1 font-semibold">Lap {lap}</div>
      {top.map(({ car, position }) => (
        <div
          key={car.carNumber}
          className="flex items-center gap-2 py-0.5 leading-tight"
        >
          <span className="w-5 font-mono tabular-nums text-muted-foreground">
            {position}
          </span>
          <span className="w-7 font-mono tabular-nums">#{car.carNumber}</span>
          <span className="truncate">{car.team}</span>
          <span className="ml-auto text-muted-foreground">
            {raceClassLabel(car.raceClass)}
          </span>
        </div>
      ))}
      {pos.length > 5 && (
        <div className="pt-1 text-[10px] text-muted-foreground">
          + {pos.length - 5} more
        </div>
      )}
    </div>
  );
}
