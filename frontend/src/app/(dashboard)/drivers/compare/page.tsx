import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DriverComparePicker } from "@/components/driver-compare-picker";
import { FormCompareChart, type FormSeries } from "@/components/form-compare-chart";
import {
  ProgressionChart,
  type Series as ProgressionSeries,
} from "@/components/progression-chart";
import {
  getDriver,
  getDriverStandings,
  getDrivers,
  type DriverDetail,
  type RaceClass,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Compare drivers" };

const VALID_CLASSES: RaceClass[] = [
  "HYPERCAR",
  "LMP1",
  "LMP2",
  "LMGT3",
  "LMGTE_PRO",
  "LMGTE_AM",
];

function parseIds(raw: string | string[] | undefined): number[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const out: number[] = [];
  for (const part of text.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 5);
}

function parseClass(raw: string | string[] | undefined): RaceClass {
  const v = (Array.isArray(raw) ? raw[0] : raw) ?? "HYPERCAR";
  return (VALID_CLASSES as string[]).includes(v) ? (v as RaceClass) : "HYPERCAR";
}

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{
    ids?: string | string[];
    class?: string | string[];
  }>;
}) {
  const sp = await searchParams;
  const raceClass = parseClass(sp.class);
  let ids = parseIds(sp.ids);
  const year = await getSelectedSeason();

  // Default: top 3 in the chosen class so the page is useful on first load.
  if (ids.length === 0) {
    try {
      const standings = await getDriverStandings(raceClass, year);
      ids = standings.slice(0, 3).map((s) => s.driverId);
    } catch {
      ids = [];
    }
  }

  const [allDrivers, ...selectedRaw] = await Promise.all([
    getDrivers(year),
    ...ids.map((id) =>
      getDriver(id, year).catch(() => null as DriverDetail | null),
    ),
  ]);
  const selected = selectedRaw.filter(
    (d): d is DriverDetail => d !== null,
  );

  const formSeries: FormSeries[] = selected.map((d) => ({
    key: `d-${d.id}`,
    label: d.name,
    points: d.results.map((r) => ({
      round: r.round,
      classPosition: r.classPosition,
    })),
  }));

  const progressionSeries: ProgressionSeries[] = selected.map((d) => {
    let cumulative = 0;
    const points = d.results
      .slice()
      .sort((a, b) => a.round - b.round)
      .map((r) => {
        cumulative += r.pointsAwarded;
        return { round: r.round, cumulativePoints: cumulative };
      });
    return { key: `d-${d.id}`, label: d.name, points };
  });

  return (
    <div className="space-y-6">
      <Link
        href="/drivers"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Drivers
      </Link>

      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Compare drivers</h1>
        <p className="text-muted-foreground">
          Up to 5 drivers from the same class. Lines drop to a gap when a
          driver missed that round.
        </p>
      </header>

      <DriverComparePicker
        selected={selected.map((d) => ({
          id: d.id,
          name: d.name,
          team: d.team,
          carNumber: d.carNumber,
          photoUrl: d.photoUrl,
        }))}
        catalog={allDrivers}
        raceClass={raceClass}
      />

      {selected.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Pick at least one driver to start comparing.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Stats</CardTitle>
              <CardDescription>
                Class results across {raceClass} rounds completed so far.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <StatsTable drivers={selected} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Form</CardTitle>
              <CardDescription>
                Class position by round — lower is better.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <FormCompareChart series={formSeries} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Championship progression</CardTitle>
              <CardDescription>
                Cumulative WEC points after each completed round.
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <ProgressionChart series={progressionSeries} />
            </CardContent>
          </Card>

          {selected.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle>Head to head</CardTitle>
                <CardDescription>
                  {selected.length === 2
                    ? "Round-by-round class finish — lower wins."
                    : "Pairwise wins across rounds both drivers contested."}
                </CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                {selected.length === 2 ? (
                  <HeadToHeadRounds drivers={selected} />
                ) : (
                  <HeadToHeadMatrix drivers={selected} />
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function StatsTable({ drivers }: { drivers: DriverDetail[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left">Driver</th>
            <th className="px-2 py-2 text-right">Champ. pos.</th>
            <th className="px-2 py-2 text-right">Points</th>
            <th className="px-2 py-2 text-right">Races</th>
            <th className="px-2 py-2 text-right">Best</th>
            <th className="px-4 py-2 text-right">Avg</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => {
            const races = d.results.length;
            const best = races > 0
              ? Math.min(...d.results.map((r) => r.classPosition))
              : null;
            const avg = races > 0
              ? d.results.reduce((s, r) => s + r.classPosition, 0) / races
              : null;
            return (
              <tr key={d.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-medium">{d.name}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {d.standing ? `P${d.standing.position}` : "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {d.standing?.points ?? "—"}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {races}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums">
                  {best !== null ? `P${best}` : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {avg !== null ? avg.toFixed(1) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

type ClassPosByRound = Map<number, number>;

function classPosByRound(d: DriverDetail): ClassPosByRound {
  const m = new Map<number, number>();
  for (const r of d.results) m.set(r.round, r.classPosition);
  return m;
}

function HeadToHeadRounds({ drivers }: { drivers: DriverDetail[] }) {
  const [a, b] = drivers;
  if (!a || !b) return null;
  const aMap = classPosByRound(a);
  const bMap = classPosByRound(b);
  const rounds = Array.from(new Set([...aMap.keys(), ...bMap.keys()])).sort(
    (x, y) => x - y,
  );

  let aWins = 0;
  let bWins = 0;
  let ties = 0;
  for (const r of rounds) {
    const av = aMap.get(r);
    const bv = bMap.get(r);
    if (av === undefined || bv === undefined) continue;
    if (av < bv) aWins++;
    else if (bv < av) bWins++;
    else ties++;
  }
  const both = aWins + bWins + ties;

  return (
    <div>
      <div className="border-b border-border bg-secondary/30 px-4 py-2 text-xs uppercase tracking-wider text-muted-foreground">
        <span className="font-mono text-foreground">{aWins}</span>
        <span> · </span>
        <span className="font-medium text-foreground">{a.name}</span>
        <span className="mx-3">vs</span>
        <span className="font-medium text-foreground">{b.name}</span>
        <span> · </span>
        <span className="font-mono text-foreground">{bWins}</span>
        {ties > 0 && (
          <span className="ml-3 text-muted-foreground">
            ({ties} tied · {both} shared rounds)
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="w-16 px-4 py-2 text-left">Round</th>
            <th className="py-2 text-right">{a.name}</th>
            <th className="w-12 py-2 text-center">vs</th>
            <th className="py-2 text-left">{b.name}</th>
            <th className="w-20 px-4 py-2 text-right">Edge</th>
          </tr>
        </thead>
        <tbody>
          {rounds.map((r) => {
            const av = aMap.get(r);
            const bv = bMap.get(r);
            const winner =
              av !== undefined && bv !== undefined
                ? av < bv
                  ? "a"
                  : bv < av
                    ? "b"
                    : "tie"
                : null;
            return (
              <tr key={r} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-mono tabular-nums text-muted-foreground">
                  R{r}
                </td>
                <td
                  className={
                    "py-2 text-right font-mono tabular-nums " +
                    (winner === "a"
                      ? "font-semibold text-[var(--racing-yellow)]"
                      : "")
                  }
                >
                  {av !== undefined ? `P${av}` : "—"}
                </td>
                <td className="py-2 text-center text-xs text-muted-foreground">
                  vs
                </td>
                <td
                  className={
                    "py-2 font-mono tabular-nums " +
                    (winner === "b"
                      ? "font-semibold text-[var(--racing-yellow)]"
                      : "")
                  }
                >
                  {bv !== undefined ? `P${bv}` : "—"}
                </td>
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {winner === "tie"
                    ? "tie"
                    : winner !== null
                      ? `+${Math.abs((av ?? 0) - (bv ?? 0))}`
                      : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function HeadToHeadMatrix({ drivers }: { drivers: DriverDetail[] }) {
  const maps = drivers.map(classPosByRound);
  // wins[i][j] = number of rounds driver i beat driver j (lower class pos)
  const wins: number[][] = drivers.map(() => drivers.map(() => 0));
  for (let i = 0; i < drivers.length; i++) {
    for (let j = 0; j < drivers.length; j++) {
      if (i === j) continue;
      for (const [r, pi] of maps[i]!) {
        const pj = maps[j]!.get(r);
        if (pj !== undefined && pi < pj) wins[i]![j] = (wins[i]![j] ?? 0) + 1;
      }
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left">Driver</th>
            {drivers.map((d) => (
              <th key={d.id} className="px-2 py-2 text-center font-medium">
                {d.name.split(" ").slice(-1)[0]}
              </th>
            ))}
            <th className="px-4 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d, i) => {
            const total = wins[i]!.reduce((s, n) => s + n, 0);
            return (
              <tr key={d.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-medium">{d.name}</td>
                {drivers.map((_, j) => (
                  <td
                    key={j}
                    className={
                      "px-2 py-2 text-center font-mono tabular-nums " +
                      (i === j ? "text-muted-foreground/40" : "")
                    }
                  >
                    {i === j ? "—" : wins[i]![j]}
                  </td>
                ))}
                <td className="px-4 py-2 text-right font-mono tabular-nums">
                  {total}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
