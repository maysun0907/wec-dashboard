"use client";

import { useTranslations } from "next-intl";
import {
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { round: number; classPosition: number };

export function FormChart({ data }: { data: Point[] }) {
  const t = useTranslations("raceDetail");
  if (data.length === 0) return null;
  const yMax = Math.max(5, ...data.map((p) => p.classPosition));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart
        data={data.map((p) => ({ ...p, classPosition: p.classPosition > 0 ? p.classPosition : null }))}
        margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
      >
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
          width={36}
        />
        <Tooltip
          contentStyle={{
            background: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 6,
            fontSize: 12,
          }}
          formatter={(value) => [`P${value}`, t("classPosition")]}
          labelFormatter={(label) => t("roundN", { round: label as number })}
        />
        <Line
          type="monotone"
          dataKey="classPosition"
          stroke="var(--racing-red)"
          strokeWidth={2}
          dot={{ fill: "var(--racing-red)", r: 4, strokeWidth: 0 }}
          activeDot={{ r: 6 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
