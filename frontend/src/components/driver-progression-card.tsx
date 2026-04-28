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

const LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export type DriverProgressionSeries = {
  driverId: number;
  driverName: string;
  team: string | null;
  carNumber: string | null;
  photoUrl: string | null;
  points: { round: number; cumulativePoints: number }[];
};

type Row = { round: number } & Record<string, number | null>;

function pivot(series: DriverProgressionSeries[]): Row[] {
  const rounds = new Set<number>();
  for (const s of series) for (const p of s.points) rounds.add(p.round);
  return Array.from(rounds)
    .sort((a, b) => a - b)
    .map((round) => {
      const row: Row = { round };
      for (const s of series) {
        const pt = s.points.find((x) => x.round === round);
        row[s.driverName] = pt?.cumulativePoints ?? null;
      }
      return row;
    });
}

type TooltipPayloadItem = {
  dataKey?: string;
  value?: number;
  color?: string;
};

function CustomTooltip({
  active,
  payload,
  label,
  series,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
  series: DriverProgressionSeries[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const byName = new Map(series.map((s) => [s.driverName, s]));
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md">
      <div className="mb-1 font-mono font-semibold text-muted-foreground">
        Round {label}
      </div>
      <ul className="space-y-1">
        {payload.map((p) => {
          const meta = byName.get(p.dataKey ?? "");
          if (meta === undefined || p.value === null || p.value === undefined)
            return null;
          return (
            <li
              key={meta.driverId}
              className="flex items-center gap-2"
            >
              <span
                className="size-2 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground">
                  {meta.driverName}
                </div>
                {meta.team && (
                  <div className="truncate text-[10px] text-muted-foreground">
                    {meta.team}
                    {meta.carNumber ? ` · #${meta.carNumber}` : ""}
                  </div>
                )}
              </div>
              <span className="font-mono tabular-nums text-foreground">
                {p.value} pts
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function DriverProgressionCard({
  series,
  height = 200,
}: {
  series: DriverProgressionSeries[];
  height?: number;
}) {
  const data = useMemo(() => pivot(series), [series]);
  if (series.length === 0 || data.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        No completed rounds yet.
      </div>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="round"
          tickFormatter={(v) => `R${v}`}
          stroke="var(--color-border)"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
        />
        <YAxis
          stroke="var(--color-border)"
          tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          width={36}
        />
        <Tooltip
          content={<CustomTooltip series={series} />}
          cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
        />
        {series.map((s, i) => (
          <Line
            key={s.driverId}
            type="monotone"
            dataKey={s.driverName}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            connectNulls={false}
            dot={{
              r: 2.5,
              fill: LINE_COLORS[i % LINE_COLORS.length],
              strokeWidth: 0,
            }}
            activeDot={{ r: 4 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
