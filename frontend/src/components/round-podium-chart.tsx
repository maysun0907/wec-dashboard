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

type CarMeta = {
  key: string;
  label: string;
  team: string;
  carNumber: string;
  manufacturer: string;
  manufacturerLogoUrl: string | null;
  color: string;
};

type RoundContext = {
  round: number;
  /** Per-car podium info for this round, keyed by car key. */
  cars: Map<string, { position: number; drivers: string }>;
};

type Row = { round: number } & Record<string, number | null>;

function buildSeries(rows: RoundPodium[]): {
  metas: CarMeta[];
  data: Row[];
  context: Map<number, RoundContext>;
} {
  // Pass 1: collect every car that hits a podium and group by manufacturer.
  const seen = new Map<string, CarMeta>();
  const carManuf = new Map<string, string>();
  for (const r of rows) {
    for (const p of r.podium) {
      const key = `${p.teamId}-${p.carNumber}`;
      if (!seen.has(key)) {
        carManuf.set(key, p.manufacturer ?? p.team);
        seen.set(key, {
          key,
          label: `${p.team} #${p.carNumber}`,
          team: p.team,
          carNumber: p.carNumber,
          manufacturer: p.manufacturer ?? p.team,
          manufacturerLogoUrl: p.manufacturerLogoUrl,
          color: "",
        });
      }
    }
  }
  // Color map: same manufacturer → same color.
  const manufs = Array.from(new Set(carManuf.values())).sort();
  const colorByManuf = new Map(
    manufs.map((m, i) => [m, COLORS[i % COLORS.length]!]),
  );
  const metas = Array.from(seen.values()).map((m) => ({
    ...m,
    color: colorByManuf.get(m.manufacturer)!,
  }));

  // Pass 2: pivot — one row per round with each car's position (or null).
  const rounds = rows.map((r) => r.round).sort((a, b) => a - b);
  const data: Row[] = rounds.map((round) => {
    const r = rows.find((x) => x.round === round)!;
    const row: Row = { round };
    for (const m of metas) {
      const hit = r.podium.find(
        (p) => `${p.teamId}-${p.carNumber}` === m.key,
      );
      row[m.key] = hit?.classPosition ?? null;
    }
    return row;
  });

  // Per-round driver context for the tooltip.
  const context = new Map<number, RoundContext>();
  for (const r of rows) {
    const cars = new Map<string, { position: number; drivers: string }>();
    for (const p of r.podium) {
      cars.set(`${p.teamId}-${p.carNumber}`, {
        position: p.classPosition,
        drivers: p.drivers,
      });
    }
    context.set(r.round, { round: r.round, cars });
  }

  return { metas, data, context };
}

type TooltipPayloadItem = {
  dataKey?: string;
  value?: number | null;
  color?: string;
};

function PodiumTooltip({
  active,
  payload,
  label,
  metas,
  context,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number;
  metas: CarMeta[];
  context: Map<number, RoundContext>;
}) {
  if (!active || !payload || payload.length === 0 || label === undefined)
    return null;
  const ctx = context.get(label);
  if (!ctx) return null;
  const metaByKey = new Map(metas.map((m) => [m.key, m]));
  const rows = payload
    .filter(
      (p) =>
        p.dataKey !== undefined &&
        p.value !== null &&
        p.value !== undefined,
    )
    .map((p) => {
      const meta = metaByKey.get(p.dataKey!);
      const ctxCar = ctx.cars.get(p.dataKey!);
      return { meta, value: p.value as number, color: p.color, drivers: ctxCar?.drivers ?? "" };
    })
    .filter((r) => r.meta !== undefined)
    .sort((a, b) => a.value - b.value);
  if (rows.length === 0) return null;
  return (
    <div className="rounded-md border border-border bg-popover p-2 text-xs shadow-md">
      <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
        Round {label}
      </div>
      <ul className="space-y-1.5">
        {rows.map((r, i) => {
          const m = r.meta!;
          return (
            <li
              key={`${m.key}-${i}`}
              className="flex items-start gap-2"
            >
              <span
                className="mt-1 size-2 shrink-0 rounded-full"
                style={{ background: r.color }}
              />
              <span className="font-mono text-[10px] font-semibold text-muted-foreground">
                P{r.value}
              </span>
              {m.manufacturerLogoUrl && (
                <span className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded bg-white p-0.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={m.manufacturerLogoUrl}
                    alt=""
                    className="size-full object-contain"
                  />
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-foreground">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    #{m.carNumber}
                  </span>{" "}
                  <span className="font-medium">{m.team}</span>
                </div>
                {r.drivers && (
                  <div className="text-[10px] text-muted-foreground">
                    {r.drivers}
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
  const { metas, data, context } = useMemo(() => buildSeries(rows), [rows]);
  if (metas.length === 0 || data.length === 0) {
    return (
      <div className="px-2 py-6 text-center text-xs text-muted-foreground">
        No completed rounds yet.
      </div>
    );
  }
  const legend = useMemo(() => {
    const seen = new Map<string, string>();
    for (const m of metas) seen.set(m.manufacturer, m.color);
    return Array.from(seen.entries()).map(([manufacturer, color]) => ({
      manufacturer,
      color,
    }));
  }, [metas]);

  return (
    <div className="space-y-1">
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
          <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" />
          <XAxis
            dataKey="round"
            tickFormatter={(v) => `R${v}`}
            stroke="var(--color-border)"
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
          />
          <YAxis
            type="number"
            domain={[0.5, 3.5]}
            ticks={[1, 2, 3]}
            reversed
            tickFormatter={(v) => `P${v}`}
            stroke="var(--color-border)"
            tick={{ fontSize: 10, fill: "var(--color-muted-foreground)" }}
            width={32}
          />
          <Tooltip
            content={<PodiumTooltip metas={metas} context={context} />}
            cursor={{ stroke: "var(--color-border)", strokeWidth: 1 }}
          />
          {metas.map((m) => (
            <Line
              key={m.key}
              type="linear"
              dataKey={m.key}
              name={m.label}
              stroke={m.color}
              strokeWidth={2}
              dot={{ r: 4, fill: m.color, strokeWidth: 0 }}
              activeDot={{ r: 6 }}
              connectNulls={true}
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
