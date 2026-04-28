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

// Match the order used by ProgressionChart so a driver shows the same
// color across both charts on the compare page.
const LINE_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export type FormSeries = {
  key: string;
  label: string;
  points: { round: number; classPosition: number }[];
};

type Row = { round: number } & Record<string, number | null>;

function pivot(series: FormSeries[]): Row[] {
  const rounds = new Set<number>();
  for (const s of series) for (const p of s.points) rounds.add(p.round);
  return Array.from(rounds)
    .sort((a, b) => a - b)
    .map((round) => {
      const row: Row = { round };
      for (const s of series) {
        const pt = s.points.find((x) => x.round === round);
        // Drivers who skipped a round get null so Recharts breaks the line
        // there instead of pulling it down to zero.
        row[s.label] = pt?.classPosition ?? null;
      }
      return row;
    });
}

export function FormCompareChart({ series }: { series: FormSeries[] }) {
  const data = useMemo(() => pivot(series), [series]);
  const yMax = useMemo(() => {
    let m = 5;
    for (const s of series) for (const p of s.points) m = Math.max(m, p.classPosition);
    return m;
  }, [series]);

  if (series.length === 0 || data.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-muted-foreground">
        No completed rounds for the selected drivers yet.
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
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          stroke="var(--color-border)"
        />
        <YAxis
          reversed
          domain={[1, yMax]}
          allowDecimals={false}
          tickFormatter={(v) => `P${v}`}
          tick={{ fontSize: 11, fill: "var(--color-muted-foreground)" }}
          stroke="var(--color-border)"
          width={40}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(value, name) => [`P${value}`, name]}
          labelFormatter={(label) => `Round ${label}`}
        />
        <Legend wrapperStyle={{ fontSize: 11 }} iconType="line" iconSize={14} />
        {series.map((s, i) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.label}
            stroke={LINE_COLORS[i % LINE_COLORS.length]}
            strokeWidth={2}
            connectNulls={false}
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

export const FORM_COLORS = LINE_COLORS;
