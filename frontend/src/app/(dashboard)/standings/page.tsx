import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassBadge } from "@/components/class-badge";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PageHeader } from "@/components/page-header";
import { ProgressionChart, type Series } from "@/components/progression-chart";
import {
  RACE_CLASSES,
  getDriverProgression,
  getDriverStandings,
  getEvents,
  getManufacturerProgression,
  getManufacturerStandings,
  getTeamProgression,
  getTeamStandings,
  type DriverProgression,
  type ManufacturerProgression,
  type RaceClass,
  type TeamProgression,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Standings" };

function groupByClass<T extends { raceClass: RaceClass }>(rows: T[]) {
  const out: Record<RaceClass, T[]> = {
    HYPERCAR: [],
    LMP1: [],
    LMP2: [],
    LMGT3: [],
    LMGTE_PRO: [],
    LMGTE_AM: [],
  };
  for (const r of rows) {
    if (out[r.raceClass]) out[r.raceClass].push(r);
  }
  return out;
}

export default async function StandingsPage() {
  const year = await getSelectedSeason();
  const [
    drivers,
    teams,
    manufacturers,
    events,
    hyperDriverProg,
    lmgt3DriverProg,
    hyperManufacturerProg,
    lmgt3TeamProg,
  ] = await Promise.all([
    getDriverStandings(undefined, year),
    getTeamStandings(undefined, year),
    getManufacturerStandings(undefined, year),
    getEvents(year),
    // Backend redeploy may lag the frontend build; fall back to empty so
    // the rest of /standings still prerenders.
    getDriverProgression("HYPERCAR", 5, year).catch(
      () => [] as DriverProgression[],
    ),
    getDriverProgression("LMGT3", 5, year).catch(
      () => [] as DriverProgression[],
    ),
    getManufacturerProgression("HYPERCAR", 8, year).catch(
      () => [] as ManufacturerProgression[],
    ),
    getTeamProgression("LMGT3", 8, year).catch(
      () => [] as TeamProgression[],
    ),
  ]);

  const driverProgByClass: Partial<Record<RaceClass, DriverProgression[]>> = {
    HYPERCAR: hyperDriverProg,
    LMGT3: lmgt3DriverProg,
  };
  const manufacturerProgByClass: Partial<
    Record<RaceClass, ManufacturerProgression[]>
  > = {
    HYPERCAR: hyperManufacturerProg,
  };
  const teamProgByClass: Partial<Record<RaceClass, TeamProgression[]>> = {
    LMGT3: lmgt3TeamProg,
  };

  const today = new Date().toISOString().slice(0, 10);
  const completedRounds = events.filter((e) => e.dateEnd < today).length;
  // A wrapped season's standings are final, not "as-of round X" —
  // dropping the "After Rn" suffix in that case keeps the header
  // honest.
  const isPastSeason =
    events.length > 0 &&
    events.every((e) => e.dateEnd < today);
  const tStandings = await getTranslations("standings");
  const tCommon = await getTranslations("common");
  const headerDescription = isPastSeason
    ? tStandings("final", { count: completedRounds })
    : tCommon("afterRound", { round: completedRounds });

  const driversByClass = groupByClass(drivers);
  const teamsByClass = groupByClass(teams);
  const manufacturersByClass = groupByClass(manufacturers);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow={tStandings("eyebrow")}
          title={tStandings("title")}
          description={headerDescription}
        />
        <div className="flex items-center gap-4 text-sm">
          <Link
            href="/seasons/compare"
            className="text-muted-foreground hover:text-foreground"
          >
            {tStandings("compareSeasons")} →
          </Link>
          {!isPastSeason && (
            <Link
              href="/standings/simulator"
              className="text-muted-foreground hover:text-foreground"
            >
              {tStandings("openSimulator")} →
            </Link>
          )}
        </div>
      </div>

      {(() => {
        const present = RACE_CLASSES.filter(
          (c) =>
            (driversByClass[c]?.length ?? 0) > 0 ||
            (teamsByClass[c]?.length ?? 0) > 0 ||
            (manufacturersByClass[c]?.length ?? 0) > 0,
        );
        return (
      <Tabs defaultValue={present[0] ?? "HYPERCAR"}>
        <TabsList>
          {present.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>

        {present.map((c) => {
          const d = driversByClass[c];
          const t = teamsByClass[c];
          const m = manufacturersByClass[c];
          // Render only championships that exist for the class. WEC has
          // Hypercar drivers + manufacturers (no teams' trophy), and LMGT3
          // drivers + teams (no manufacturers' cup).
          const cards = [d.length > 0, t.length > 0, m.length > 0].filter(
            Boolean,
          ).length;
          const gridClass =
            cards >= 3
              ? "grid gap-6 xl:grid-cols-3"
              : cards === 2
                ? "grid gap-6 xl:grid-cols-2"
                : "grid gap-6";
          const driverProg = driverProgByClass[c] ?? [];
          const manufacturerProg = manufacturerProgByClass[c] ?? [];
          const teamProg = teamProgByClass[c] ?? [];

          const driverSeries: Series[] = driverProg.map((p) => ({
            key: `d-${p.driverId}`,
            label: p.driverName,
            points: p.points,
          }));
          const manufacturerSeries: Series[] = manufacturerProg.map((p) => ({
            key: `m-${p.manufacturerId}`,
            label: p.manufacturerName,
            points: p.points,
          }));
          const teamSeries: Series[] = teamProg.map((p) => ({
            key: `t-${p.teamId}-${p.carNumber}`,
            label: `${p.teamName} #${p.carNumber}`,
            points: p.points,
          }));

          return (
            <TabsContent key={c} value={c} className="mt-4 space-y-6">
              {driverSeries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{tStandings("driversChampionshipTop5")}</CardTitle>
                    <CardDescription>
                      {tStandings("cumulativeByRound")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <ProgressionChart series={driverSeries} />
                  </CardContent>
                </Card>
              )}
              {manufacturerSeries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{tStandings("manufacturersChampionship")}</CardTitle>
                    <CardDescription>
                      {tStandings("cumulativeByRound")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <ProgressionChart series={manufacturerSeries} />
                  </CardContent>
                </Card>
              )}
              {teamSeries.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle>{tStandings("teamsTrophy")}</CardTitle>
                    <CardDescription>
                      {tStandings("cumulativeByRoundPerCar")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="pb-4">
                    <ProgressionChart series={teamSeries} />
                  </CardContent>
                </Card>
              )}
              <div className={gridClass}>
                {d.length > 0 && (
                  <StandingsTable
                    title={tStandings("driversHeading")}
                    titleKey="drivers"
                    raceClass={c}
                    rows={d.map((r) => ({
                      key: `d-${r.driverId}`,
                      position: r.position,
                      name: r.driverName,
                      href: `/drivers/${r.driverId}`,
                      logoUrl: r.manufacturerLogoUrl,
                      detail: undefined,
                      points: r.points,
                    }))}
                    emptyMessage=""
                  />
                )}
                {t.length > 0 && (
                  <StandingsTable
                    title={tStandings("teamsHeading")}
                    titleKey="teams"
                    raceClass={c}
                    rows={t.map((r) => ({
                      key: `t-${r.teamId}`,
                      position: r.position,
                      name: r.teamName,
                      href: `/teams/${r.teamId}`,
                      detail: r.manufacturer ?? undefined,
                      points: r.points,
                    }))}
                    emptyMessage=""
                  />
                )}
                {m.length > 0 && (
                  <StandingsTable
                    title={tStandings("manufacturersHeading")}
                    titleKey="manufacturers"
                    raceClass={c}
                    rows={m.map((r) => ({
                      key: `m-${r.manufacturerId}`,
                      position: r.position,
                      name: r.manufacturerName,
                      href: `/manufacturers/${r.manufacturerId}`,
                      logoUrl: r.manufacturerLogoUrl,
                      detail: undefined,
                      points: r.points,
                    }))}
                    emptyMessage=""
                  />
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
        );
      })()}
    </div>
  );
}

type Row = {
  key: string;
  position: number;
  name: string;
  href?: string;
  detail?: string;
  logoUrl?: string | null;
  points: number;
};

function StandingsTable({
  title,
  titleKey,
  raceClass,
  rows,
  emptyMessage,
}: {
  title: string;
  titleKey: "drivers" | "teams" | "manufacturers";
  raceClass: RaceClass;
  rows: Row[];
  emptyMessage: string;
}) {
  const t = useTranslations("standings");
  // The 2014-2020 LMP1 era had no overall Teams' World Championship —
  // factory teams competed for the Manufacturers' Cup, and only
  // privateers had a Teams trophy. Tagging the table avoids confusion
  // when the LMP1 Teams card looks short.
  const note =
    titleKey === "teams" && raceClass === "LMP1"
      ? t("lmp1TeamsNote")
      : null;
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <ClassBadge raceClass={raceClass} />
        </div>
        {note && (
          <p className="text-xs text-muted-foreground">{note}</p>
        )}
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">{t("colPos")}</TableHead>
                <TableHead>{t("colName")}</TableHead>
                <TableHead className="pr-4 text-right">{t("colPoints")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="pl-4 font-mono tabular-nums">
                    {r.position}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {r.logoUrl !== undefined && (
                        <ManufacturerLogo
                          src={r.logoUrl}
                          name={r.name}
                          size="md"
                        />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium">
                          {r.href ? (
                            <Link
                              href={r.href}
                              className="hover:text-[var(--racing-red)]"
                            >
                              {r.name}
                            </Link>
                          ) : (
                            r.name
                          )}
                        </div>
                        {r.detail && (
                          <div className="text-xs text-muted-foreground">
                            {r.detail}
                          </div>
                        )}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="pr-4 text-right font-mono tabular-nums">
                    {r.points}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
