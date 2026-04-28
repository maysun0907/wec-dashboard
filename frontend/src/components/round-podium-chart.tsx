"use client";

import { useMemo } from "react";
import {
  CartesianGrid,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
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
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  drivers: string;
};

type ManufSeries = {
  manufacturer: string;
  color: string;
  data: Point[];
};

function bucketByManufacturer(rows: RoundPodium[]): ManufSeries[] {
  const buckets = new Map<string, Point[]>();
  for (const r of rows) {
    for (const p of r.podium) {
      const key = p.manufacturer ?? p.team;
      const arr = buckets.get(key) ?? [];
      arr.push({
        round: r.round,
        position: p.classPosition,
        carNumber: p.carNumber,
        team: p.team,
        manufacturer: p.manufacturer,
        manufacturerLogoUrl: p.manufacturerLogoUrl,
        drivers: p.drivers,
      });
      buckets.set(key, arr);
    }
  }
  // Color order is stable across renders by sorting alphabetically.
  const keys = Array.from(buckets.keys()).sort();
  return keys.map((k, i) => ({
    manufacturer: k,
    color: COLORS[i % COLORS.length]!,
    data: buckets.get(k)!,
  }));
}

type TooltipPayload = { payload?: Point; color?: string };

function PodiumTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md">
      <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Round {p.round} · P{p.position}
      </div>
      <div className="flex items-center gap-2">
        {p.manufacturerLogoUrl && (
          <span className="inline-flex size-5 shrink-0 items-center justify-center rounded bg-white p-0.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={p.manufacturerLogoUrl}
              alt=""
              className="size-full object-contain"
            />
          </span>
        )}
        <div className="min-w-0">
          <div className="font-medium text-foreground">
            <span className="font-mono text-[10px] text-muted-foreground">
              #{p.carNumber}
            </span>{" "}
            {p.team}
          </div>
          {p.drivers && (
            <div className="text-[10px] text-muted-foreground">
              {p.drivers}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RoundPodiumChart({
  rows,
  height = 160,
}: {
  rows: RoundPodium[];
  height?: number;
}) {
  const series = useMemo(() => bucketByManufacturer(rows), [rows]);
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
        <ScatterChart margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
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
            <Scatter
              key={s.manufacturer}
              name={s.manufacturer}
              data={s.data}
              fill={s.color}
              shape="circle"
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 text-[10px]">
        {series.map((s) => (
          <span
            key={s.manufacturer}
            className="inline-flex items-center gap-1 text-muted-foreground"
          >
            <span
              className="inline-block size-2 rounded-full"
              style={{ background: s.color }}
            />
            {s.manufacturer}
          </span>
        ))}
      </div>
    </div>
  );
}
