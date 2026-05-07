"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  raceClassLabel,
  type DriverProgression,
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

/** Mini progression chart for the season recap. Plots top 5 drivers
 *  per class, x = round, y = cumulative points. Read-only — full
 *  detail lives on /standings. */
export function ChampionProgressionMini({
  classes,
}: {
  classes: { raceClass: RaceClass; rows: DriverProgression[] }[];
}) {
  if (classes.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Championship progression</CardTitle>
        <CardDescription>
          Cumulative points per round — top 5 drivers per class.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {classes.map(({ raceClass, rows }) => (
          <ProgressionPanel
            key={raceClass}
            raceClass={raceClass}
            rows={rows}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function ProgressionPanel({
  raceClass,
  rows,
}: {
  raceClass: RaceClass;
  rows: DriverProgression[];
}) {
  if (rows.length === 0) return null;
  const stroke = CLASS_COLOR[raceClass] ?? "currentColor";
  const maxRound = Math.max(
    1,
    ...rows.flatMap((r) => r.points.map((p) => p.round)),
  );
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
          {raceClassLabel(raceClass)}
        </span>
      </div>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--border)"
              opacity={0.4}
            />
            <XAxis
              type="number"
              dataKey="round"
              domain={[1, maxRound]}
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
              label={{
                value: "Round",
                position: "insideBottomRight",
                offset: -2,
                fontSize: 11,
                fill: "var(--muted-foreground)",
              }}
            />
            <YAxis
              type="number"
              tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
              stroke="var(--border)"
              width={36}
            />
            <Tooltip
              cursor={{
                stroke: "var(--muted-foreground)",
                strokeOpacity: 0.4,
              }}
              content={({ active, payload, label }) => {
                if (!active || !payload?.length) return null;
                const sorted = [...payload].sort(
                  (a, b) =>
                    Number(b.value ?? 0) - Number(a.value ?? 0),
                );
                return (
                  <div className="rounded-md border border-border bg-popover/95 px-3 py-2 text-xs shadow-md backdrop-blur">
                    <div className="mb-1 font-semibold">Round {label}</div>
                    {sorted.slice(0, 6).map((p) => (
                      <div
                        key={String(p.name)}
                        className="flex items-center gap-2 py-0.5"
                      >
                        <span
                          className="size-2 rounded-full"
                          style={{ background: stroke }}
                        />
                        <span className="truncate">{p.name}</span>
                        <span className="ml-auto font-mono tabular-nums">
                          {p.value}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {rows.map((r, i) => (
              <Line
                key={r.driverId}
                data={r.points.map((p) => ({
                  round: p.round,
                  [r.driverName]: p.cumulativePoints,
                }))}
                type="monotone"
                dataKey={r.driverName}
                stroke={stroke}
                strokeOpacity={1 - i * 0.12}
                strokeWidth={i === 0 ? 2.5 : 1.4}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
