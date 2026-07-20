import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DriverComparePicker } from "@/components/driver-compare-picker";
import { FormCompareChart, type FormSeries } from "@/components/form-compare-chart";
import { PageHeader } from "@/components/page-header";
import { PublicLink } from "@/components/public-link";
import {
  ProgressionChart,
  type Series as ProgressionSeries,
} from "@/components/progression-chart";
import {
  getDriver,
  getDriverStandings,
  getDrivers,
  getEvents,
  isApiNotFound,
  type DriverDetail,
  type RaceClass,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";
import { seasonDataRevalidateSeconds } from "@/lib/cache-policy";

export const generateMetadata = () =>
  dashboardPageMetadata("driverCompare", "/drivers/compare");

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

async function loadDriver(
  id: number,
  year: number | null,
  revalidate: number,
): Promise<DriverDetail | null> {
  try {
    return await getDriver(id, year, { revalidate });
  } catch (error) {
    if (isApiNotFound(error)) return null;
    throw error;
  }
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
  const seasonYear = year ?? new Date().getUTCFullYear();
  const events = await getEvents(year);
  const revalidate = seasonDataRevalidateSeconds(events);

  // Default: top 3 in the chosen class so the page is useful on first load.
  if (ids.length === 0) {
    const standings = await getDriverStandings(raceClass, year, {
      revalidate,
    });
    ids = standings.slice(0, 3).map((s) => s.driverId);
  }

  const [allDrivers, ...selectedRaw] = await Promise.all([
    getDrivers(year),
    ...ids.map((id) => loadDriver(id, year, revalidate)),
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

  const t = await getTranslations("compare");
  const tSeasons = await getTranslations("seasons");
  const tDrivers = await getTranslations("drivers");
  return (
    <div className="space-y-6">
      <PublicLink
        href="/drivers"
        seasonYear={seasonYear}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {tDrivers("title")}
      </PublicLink>

      <PageHeader
        eyebrow={tSeasons("sideBySide")}
        title={t("compareDrivers")}
        description={t("compareDriversDesc")}
      />

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
            {t("pickAtLeastOneDriver")}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("stats")}</CardTitle>
              <CardDescription>
                {t("statsSubtitle", { raceClass })}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <StatsTable drivers={selected} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("form")}</CardTitle>
              <CardDescription>
                {t("formSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <FormCompareChart series={formSeries} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("championshipProgression")}</CardTitle>
              <CardDescription>
                {t("championshipProgressionSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <ProgressionChart series={progressionSeries} />
            </CardContent>
          </Card>

          {selected.length >= 2 && (
            <Card>
              <CardHeader>
                <CardTitle>{t("headToHead")}</CardTitle>
                <CardDescription>
                  {selected.length === 2
                    ? t("headToHeadPair")
                    : t("headToHeadMatrix")}
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
  const t = useTranslations("compare");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left">{t("colDriver")}</th>
            <th className="px-2 py-2 text-right">{t("colChampPos")}</th>
            <th className="px-2 py-2 text-right">{t("colPoints")}</th>
            <th className="px-2 py-2 text-right">{t("colRaces")}</th>
            <th className="px-2 py-2 text-right">{t("colBest")}</th>
            <th className="px-4 py-2 text-right">{t("colAvg")}</th>
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
                <td className="px-4 py-2 font-medium">
                  <PublicLink
                    href={`/drivers/${d.id}`}
                    className="hover:text-[var(--racing-red)]"
                  >
                    {d.name}
                  </PublicLink>
                </td>
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
  const t = useTranslations("compare");
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
        <span className="mx-3">{t("vs")}</span>
        <span className="font-medium text-foreground">{b.name}</span>
        <span> · </span>
        <span className="font-mono text-foreground">{bWins}</span>
        {ties > 0 && (
          <span className="ml-3 text-muted-foreground">
            {t("tiedSharedRounds", { ties, both })}
          </span>
        )}
      </div>
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="w-16 px-4 py-2 text-left">{t("colRound")}</th>
            <th className="py-2 text-right">{a.name}</th>
            <th className="w-12 py-2 text-center">{t("vs")}</th>
            <th className="py-2 text-left">{b.name}</th>
            <th className="w-20 px-4 py-2 text-right">{t("colEdge")}</th>
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
                  {t("vs")}
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
                    ? t("tie")
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
  const t = useTranslations("compare");
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
            <th className="px-4 py-2 text-left">{t("colDriver")}</th>
            {drivers.map((d) => (
              <th key={d.id} className="px-2 py-2 text-center font-medium">
                {d.name.split(" ").slice(-1)[0]}
              </th>
            ))}
            <th className="px-4 py-2 text-right">{t("colTotal")}</th>
          </tr>
        </thead>
        <tbody>
          {drivers.map((d, i) => {
            const total = wins[i]!.reduce((s, n) => s + n, 0);
            return (
              <tr key={d.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 font-medium">
                  <PublicLink
                    href={`/drivers/${d.id}`}
                    className="hover:text-[var(--racing-red)]"
                  >
                    {d.name}
                  </PublicLink>
                </td>
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
