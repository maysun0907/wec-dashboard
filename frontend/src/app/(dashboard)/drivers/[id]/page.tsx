import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { ChampionBadge } from "@/components/champion-badge";
import { ClassBadge } from "@/components/class-badge";
import { DriverPhoto } from "@/components/driver-photo";
import { localDriverImage } from "@/lib/driver-image";
import { CarModelLink, Dash, TeamLink } from "@/components/entity-link";
import { Flag } from "@/components/flag";
import { FormChart } from "@/components/form-chart";
import {
  describeRounds,
  getDriver,
  raceClassLabel,
  type DriverDetail,
  type DriverResult,
  type DriverSeason,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { ManufacturerLogo } from "@/components/manufacturer-logo";

type Params = { id: string };

async function fetchDriver(
  id: string,
  year: number | null,
): Promise<DriverDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getDriver(numId, year);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const year = await getSelectedSeason();
  const d = await fetchDriver(id, year);
  return { title: d?.name ?? "Driver" };
}

export default async function DriverDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const year = await getSelectedSeason();
  const driver = await fetchDriver(id, year);
  if (driver === null) notFound();
  const t = await getTranslations("drivers");

  return (
    <div className="space-y-6">
      <Link
        href="/drivers"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("title")}
      </Link>

      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
          <DriverPhoto
            src={localDriverImage(driver.id) ?? driver.photoUrl}
            name={driver.name}
            size="xl"
            className="mt-1"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-3 text-xs font-semibold tracking-widest uppercase">
              {driver.raceClass && <ClassBadge raceClass={driver.raceClass} />}
              {driver.carNumber && (
                <span className="font-mono text-muted-foreground">
                  #{driver.carNumber}
                </span>
              )}
              {driver.team && (
                <TeamLink
                  id={driver.teamId}
                  className="text-muted-foreground"
                >
                  {driver.team}
                </TeamLink>
              )}
            </div>
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl sm:text-3xl">
              {driver.nationality && (
                <Flag code={driver.nationality} flagOnly className="text-2xl" />
              )}
              <span>{driver.name}</span>
              <ChampionBadge
                titles={driver.seasons.filter(
                  (s) => s.championshipPosition === 1,
                ).length}
                size="md"
              />
            </CardTitle>
            <CardDescription>
              {driver.manufacturer && <span>{driver.manufacturer}</span>}
              {driver.manufacturer && driver.carModel && <span> · </span>}
              {driver.carModel && (
                <CarModelLink slug={driver.carModelSlug}>
                  {driver.carModel}
                </CarModelLink>
              )}
              {!driver.manufacturer && !driver.carModel && "—"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 text-sm">
            {driver.standing && (
              <>
                <Stat
                  label={t("championshipPos")}
                  value={`P${driver.standing.position}`}
                />
                <Stat
                  label={t("points")}
                  value={driver.standing.points.toString()}
                />
              </>
            )}
            <Stat
              label={t("racesFinished")}
              value={driver.results.length.toString()}
            />
            {driver.results.length > 0 && (
              <>
                <Stat
                  label={t("bestClassResult")}
                  value={`P${bestClassPosition(driver.results)}`}
                />
                <Stat
                  label={t("avgClassResult")}
                  value={averageClassPosition(driver.results).toFixed(1)}
                />
                {!driver.standing && (
                  <Stat
                    label={t("pointsScored")}
                    value={pointsScored(driver.results).toString()}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {driver.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("form")}</CardTitle>
            <CardDescription>
              {t("formSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <FormChart
              data={driver.results.map((r) => ({
                round: r.round,
                classPosition: r.classPosition,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {driver.seasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("career")}</CardTitle>
            <CardDescription>
              {careerSummary(driver.seasons)}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <CareerTable rows={driver.seasons} />
          </CardContent>
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("coDrivers")}</CardTitle>
            <CardDescription>
              {t("coDriversSubtitle", { count: driver.coDrivers.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {driver.coDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noCoDrivers")}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {driver.coDrivers.map((c) => {
                  const tag = describeRounds(c.rounds);
                  return (
                    <li key={c.id} className="flex items-center gap-2">
                      <DriverPhoto src={c.photoUrl} name={c.name} size="sm" />
                      <Link
                        href={`/drivers/${c.id}`}
                        className="hover:text-[var(--racing-red)]"
                      >
                        {c.name}
                      </Link>
                      {tag && (
                        <span className="rounded bg-secondary px-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {tag}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Race results</CardTitle>
            <CardDescription>
              {driver.results.length === 0
                ? "No completed races yet this season."
                : "Overall finishing position per round."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {driver.results.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 pl-4">Rd</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="w-16 text-right">Class</TableHead>
                    <TableHead className="w-14 text-right">Pos</TableHead>
                    <TableHead className="hidden w-16 text-right sm:table-cell">
                      Laps
                    </TableHead>
                    <TableHead className="pr-4 text-right">Pts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driver.results.map((r) => (
                    <TableRow key={r.eventId}>
                      <TableCell className="pl-4 font-mono tabular-nums">
                        {r.round}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/races/${r.eventId}`}
                          className="hover:text-[var(--racing-red)]"
                        >
                          {r.eventName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        P{r.classPosition}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        P{r.position}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                        {r.laps ?? "—"}
                      </TableCell>
                      <TableCell
                        className={
                          "pr-4 text-right font-mono tabular-nums " +
                          (r.pointsAwarded > 0
                            ? "text-foreground"
                            : "text-muted-foreground")
                        }
                      >
                        {r.pointsAwarded > 0 ? r.pointsAwarded : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function careerSummary(seasons: DriverSeason[]): string {
  const titles = seasons.filter((s) => s.championshipPosition === 1).length;
  const totalRaces = seasons.reduce((s, r) => s + r.races, 0);
  const totalWins = seasons.reduce((s, r) => s + r.wins, 0);
  const totalPodiums = seasons.reduce((s, r) => s + r.podiums, 0);
  const span =
    seasons.length > 1
      ? `${seasons[seasons.length - 1]!.year}–${seasons[0]!.year}`
      : `${seasons[0]!.year}`;
  const titlesText = titles > 0 ? `${titles} title${titles === 1 ? "" : "s"} · ` : "";
  return `${span} · ${titlesText}${totalRaces} races · ${totalWins} wins · ${totalPodiums} podiums`;
}

function CareerTable({ rows }: { rows: DriverSeason[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 pl-4">Year</TableHead>
          <TableHead className="w-20">Class</TableHead>
          <TableHead>Team</TableHead>
          <TableHead className="hidden w-12 text-right sm:table-cell">#</TableHead>
          <TableHead className="w-16 text-right">Pos</TableHead>
          <TableHead className="w-16 text-right">Pts</TableHead>
          <TableHead className="hidden w-12 text-right md:table-cell">R</TableHead>
          <TableHead className="hidden w-12 text-right md:table-cell">W</TableHead>
          <TableHead className="w-14 pr-4 text-right">P</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s, i) => {
          const isTitle = s.championshipPosition === 1;
          return (
            <TableRow
              key={`${s.year}-${s.carNumber}-${i}`}
              className={isTitle ? "bg-[var(--racing-yellow)]/5" : undefined}
            >
              <TableCell className="pl-4 font-mono tabular-nums">
                {s.year}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-muted-foreground">
                  {raceClassLabel(s.raceClass)}
                </span>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <ManufacturerLogo
                    src={s.manufacturerLogoUrl}
                    name={s.manufacturer ?? s.team}
                  />
                  <TeamLink id={s.teamId} className="truncate">
                    {s.team}
                  </TeamLink>
                </span>
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                #{s.carNumber}
              </TableCell>
              <TableCell
                className={
                  "text-right font-mono tabular-nums " +
                  (isTitle ? "font-semibold text-[var(--racing-yellow)]" : "")
                }
              >
                {s.championshipPosition !== null ? (
                  `P${s.championshipPosition}`
                ) : (
                  <Dash />
                )}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {s.points !== null ? s.points : <Dash />}
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground md:table-cell">
                {s.races > 0 ? s.races : <Dash />}
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                {s.wins > 0 ? s.wins : <Dash />}
              </TableCell>
              <TableCell className="pr-4 text-right font-mono tabular-nums">
                {s.podiums > 0 ? s.podiums : <Dash />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function bestClassPosition(results: DriverResult[]): number {
  return Math.min(...results.map((r) => r.classPosition));
}

function averageClassPosition(results: DriverResult[]): number {
  if (results.length === 0) return 0;
  return (
    results.reduce((sum, r) => sum + r.classPosition, 0) / results.length
  );
}

function pointsScored(results: DriverResult[]): number {
  return results.reduce((sum, r) => sum + r.pointsAwarded, 0);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}
