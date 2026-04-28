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

export type CarProgressionSeries = {
  /** Unique line key — typically `${teamId}-${carNumber}`. */
  key: string;
  /** Short legend label like 'Toyota #8' or 'AF Corse #51'. */
  label: string;
  /** Line color (uses LINE_COLORS by index when omitted). */
  team: string;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  carNumber: string;
  drivers: Array<{ id: number; name: string }>;
  points: { round: number; cumulativePoints: number }[];
};

type Row = { round: number } & Record<string, number | null>;

function pivot(series: CarProgressionSeries[]): Row[] {
  const rounds = new Set<number>();
  for (const s of series) for (const p of s.points) rounds.add(p.round);
  return Array.from(rounds)
    .sort((a, b) => a - b)
    .map((round) => {
      const row: Row = { round };
      for (const s of series) {
        const pt = s.points.find((x) => x.round === round);
        row[s.label] = pt?.cumulativePoints ?? null;
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
  series: CarProgressionSeries[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const byLabel = new Map(series.map((s) => [s.label, s]));
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md">
      <div className="mb-1.5 font-mono font-semibold text-muted-foreground">
        Round {label}
      </div>
      <ul className="space-y-2">
        {payload.map((p) => {
          const meta = byLabel.get(p.dataKey ?? "");
          if (meta === undefined || p.value === null || p.value === undefined)
            return null;
          return (
            <li key={meta.key} className="flex items-start gap-2">
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: p.color }}
              />
              {meta.manufacturerLogoUrl && (
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-white p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={meta.manufacturerLogoUrl}
                    alt={meta.manufacturer ?? meta.team}
                    className="size-full object-contain"
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{meta.carNumber}
                  </span>
                  <span className="font-medium text-foreground">
                    {meta.team}
                  </span>
                </div>
                {meta.drivers.length > 0 && (
                  <div className="text-[10px] text-muted-foreground">
                    {meta.drivers.map((d) => d.name).join(" / ")}
                  </div>
                )}
              </div>
              <span className="font-mono font-semibold tabular-nums text-foreground">
                {p.value} pts
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function CarProgressionCard({
  series,
  height = 200,
}: {
  series: CarProgressionSeries[];
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
            key={s.key}
            type="monotone"
            dataKey={s.label}
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
