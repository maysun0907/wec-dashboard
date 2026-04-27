"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  Legend,
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
  "var(--racing-yellow)",
  "var(--class-lmgt3)",
  "var(--class-lmp2)",
];

export type Series = {
  key: string;
  label: string;
  points: { round: number; cumulativePoints: number }[];
};

type ChartRow = { round: number } & Record<string, number>;

function pivot(series: Series[]): ChartRow[] {
  const rounds = new Set<number>();
  for (const s of series) {
    for (const pt of s.points) rounds.add(pt.round);
  }
  return Array.from(rounds)
    .sort((a, b) => a - b)
    .map((round) => {
      const row: ChartRow = { round };
      for (const s of series) {
        const pt = s.points.find((x) => x.round === round);
        row[s.label] = pt?.cumulativePoints ?? 0;
      }
      return row;
    });
}

export function ProgressionChart({ series }: { series: Series[] }) {
  const data = useMemo(() => pivot(series), [series]);

  if (series.length === 0 || data.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        No completed rounds yet — chart will fill in as the season runs.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
        <XAxis
          dataKey="round"
          tickFormatter={(v) => `R${v}`}
          stroke="var(--color-border)"
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
        />
        <YAxis
          stroke="var(--color-border)"
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 12,
          }}
          labelFormatter={(label) => `Round ${label}`}
          formatter={(value, name) => [`${value} pts`, name]}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" iconSize={14} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.label}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            dot={{
              r: 3,
              fill: LINE_COLORS[i % LINE_COLORS.length],
              strokeWidth: 0,
            }}
            activeDot={{ r: 5 }}
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}
