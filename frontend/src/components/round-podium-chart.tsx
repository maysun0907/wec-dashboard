"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type RoundPodium } from "@/lib/api";

const COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--racing-yellow)",
  "var(--class-lmgt3)",
  "var(--class-lmp2)",
];

type Point = {
  round: number;
  position: number;
  carNumber: string;
  team: string;
  teamId: number;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  drivers: string;
};

type CarSeries = {
  /** Unique key per (team, car number). */
  key: string;
  label: string;
  manufacturerName: string;
  color: string;
  data: Point[];
};

function bucket(rows: RoundPodium[]): {
  series: CarSeries[];
  legend: Array<{ manufacturer: string; color: string }>;
} {
  // Group podium points by (teamId, carNumber). Same manufacturer cars
  // share a color so multi-car brands read as one team visually.
  const carData = new Map<string, Point[]>();
  const carManuf = new Map<string, string>();
  const carLabel = new Map<string, string>();
  for (const r of rows) {
    for (const p of r.podium) {
      const key = `${p.teamId}-${p.carNumber}`;
      const point: Point = {
        round: r.round,
        position: p.classPosition,
        carNumber: p.carNumber,
        team: p.team,
        teamId: p.teamId,
        manufacturer: p.manufacturer,
        manufacturerLogoUrl: p.manufacturerLogoUrl,
        drivers: p.drivers,
      };
      carData.set(key, [...(carData.get(key) ?? []), point]);
      carManuf.set(key, p.manufacturer ?? p.team);
      carLabel.set(key, `${p.team} #${p.carNumber}`);
    }
  }
  const manufs = Array.from(new Set(carManuf.values())).sort();
  const colorByManuf = new Map(
    manufs.map((m, i) => [m, COLORS[i % COLORS.length]!]),
  );
  const series: CarSeries[] = Array.from(carData.entries()).map(
    ([key, data]) => {
      const manuf = carManuf.get(key)!;
      return {
        key,
        label: carLabel.get(key) ?? key,
        manufacturerName: manuf,
        color: colorByManuf.get(manuf)!,
        data: data.sort((a, b) => a.round - b.round),
      };
    },
  );
  const legend = manufs.map((m) => ({
    manufacturer: m,
    color: colorByManuf.get(m)!,
  }));
  return { series, legend };
}

type TooltipPayloadItem = {
  payload?: Point;
  color?: string;
  value?: number;
};

function PodiumTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  // payload may include multiple series intersecting this round; sort
  // them by finishing position so P1 sits on top of the tooltip card.
  const items = [...payload]
    .filter((p) => p.payload !== undefined)
    .sort((a, b) => (a.payload!.position ?? 99) - (b.payload!.position ?? 99));
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Round {label}
      </div>
      <ul className="space-y-1.5">
        {items.map((it, i) => {
          const p = it.payload!;
          return (
            <li
              key={`${p.teamId}-${p.carNumber}-${i}`}
              className="flex items-start gap-2"
            >
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: it.color }}
              />
              <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                P{p.position}
              </span>
              {p.manufacturerLogoUrl && (
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-white p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.manufacturerLogoUrl}
                    alt=""
                    className="size-full object-contain"
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-foreground">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{p.carNumber}
                  </span>{" "}
                  <span className="font-medium">{p.team}</span>
                </div>
                {p.drivers && (
                  <div className="text-[10px] text-muted-foreground">
                    {p.drivers}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function RoundPodiumChart({
  rows,
  height = 180,
}: {
  rows: RoundPodium[];
  height?: number;
}) {
  const { series, legend } = useMemo(() => bucket(rows), [rows]);
  if (series.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        No completed rounds yet.
      </div>
    );
  }
  const rounds = rows.map((r) => r.round);
  const minRound = Math.min(...rounds);
  const maxRound = Math.max(...rounds);

  return (
    <div className="space-y-1">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="round"
            domain={[minRound - 0.4, maxRound + 0.4]}
            ticks={Array.from(
              { length: maxRound - minRound + 1 },
              (_, i) => minRound + i,
            )}
            tickFormatter={(v) => `R${v}`}
            stroke="var(--color-border)"
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            allowDuplicatedCategory={false}
          />
          <YAxis
            type="number"
            dataKey="position"
            domain={[0.5, 3.5]}
            ticks={[1, 2, 3]}
            reversed
            tickFormatter={(v) => `P${v}`}
            stroke="var(--color-border)"
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            width={32}
          />
          <Tooltip
            content={<PodiumTooltip />}
            cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              data={s.data}
              type="linear"
              dataKey="position"
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={{
                r: 4,
                fill: s.color,
                strokeWidth: 0,
              }}
              activeDot={{ r: 6 }}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px]">
        {legend.map((l) => (
          <span
            key={l.manufacturer}
            className="inline-flex items-center gap-1 text-muted-foreground"
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: l.color }}
            />
            {l.manufacturer}
          </span>
        ))}
      </div>
    </div>
  );
}
