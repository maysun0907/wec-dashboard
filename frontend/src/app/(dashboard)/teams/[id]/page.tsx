import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { CarModelLink, Dash } from "@/components/entity-link";
import { DriverPhoto } from "@/components/driver-photo";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import {
  describeRounds,
  getTeam,
  raceClassLabel,
  type TeamDetail,
  type TeamSeason,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

type Params = { id: string };

async function fetchTeam(
  id: string,
  year: number | null,
): Promise<TeamDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getTeam(numId, year);
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
  const t = await fetchTeam(id, year);
  return { title: t?.name ?? "Team" };
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const year = await getSelectedSeason();
  const team = await fetchTeam(id, year);
  if (team === null) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/teams"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Teams
      </Link>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
          {team.manufacturerId !== null ? (
            <Link
              href={`/manufacturers/${team.manufacturerId}`}
              className="shrink-0"
              aria-label={`${team.manufacturer ?? "Manufacturer"} page`}
            >
              <ManufacturerLogo
                src={team.manufacturerLogoUrl}
                name={team.manufacturer}
                size="lg"
              />
            </Link>
          ) : (
            <ManufacturerLogo
              src={team.manufacturerLogoUrl}
              name={team.manufacturer}
              size="lg"
            />
          )}
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl sm:text-3xl">
              <span>{team.name}</span>
              <ChampionBadge
                titles={team.seasons.filter(
                  (s) => s.championshipPosition === 1,
                ).length}
                size="md"
              />
            </CardTitle>
            <CardDescription>
              {team.manufacturerId !== null && team.manufacturer ? (
                <Link
                  href={`/manufacturers/${team.manufacturerId}`}
                  className="hover:text-foreground"
                >
                  {team.manufacturer}
                </Link>
              ) : (
                team.manufacturer ?? "Independent"
              )}
              {" · "}
              {team.cars.length}{" "}
              {team.cars.length === 1 ? "car" : "cars"} this season
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      <section className="space-y-6">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-muted-foreground">
          Entries
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {team.cars.map((c) => (
            <Card key={c.carId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      <span className="font-mono">#{c.number}</span>{" "}
                      <CarModelLink
                        slug={c.carModelSlug}
                        className="text-muted-foreground"
                      >
                        {c.model ?? ""}
                      </CarModelLink>
                    </CardTitle>
                    <CardDescription>
                      {c.drivers.length} drivers
                    </CardDescription>
                  </div>
                  <ClassBadge raceClass={c.raceClass} />
                </div>
              </CardHeader>
              {c.carModelImageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.carModelImageUrl}
                  alt={c.model ?? `#${c.number}`}
                  className="mx-auto h-24 w-auto px-4"
                  loading="lazy"
                />
              )}
              <CardContent>
                {c.drivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No drivers listed yet.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {c.drivers.map((d) => {
                      const tag = describeRounds(d.rounds);
                      return (
                        <li key={d.id} className="flex items-center gap-2">
                          <DriverPhoto src={d.photoUrl} name={d.name} size="sm" />
                          <Link
                            href={`/drivers/${d.id}`}
                            className="hover:text-[var(--racing-red)]"
                          >
                            {d.name}
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
          ))}
        </div>
      </section>

      {team.seasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Career</CardTitle>
            <CardDescription>{teamCareerSummary(team.seasons)}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <TeamCareerTable rows={team.seasons} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Race results</CardTitle>
          <CardDescription>
            {team.results.length === 0
              ? "No completed races yet this season."
              : "Across all team cars, sorted by round."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {team.results.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4">Rd</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-16">Class</TableHead>
                  <TableHead className="w-14 text-right">Cls</TableHead>
                  <TableHead className="w-12 text-right text-muted-foreground">
                    Pos
                  </TableHead>
                  <TableHead className="pr-4 text-right">Pts</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.results.map((r) => (
                  <TableRow key={`${r.eventId}-${r.carNumber}`}>
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
                    <TableCell className="font-mono tabular-nums">
                      {r.carNumber}
                    </TableCell>
                    <TableCell>
                      <ClassBadge raceClass={r.raceClass} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      P{r.classPosition}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                      P{r.position}
                    </TableCell>
                    <TableCell
                      className={
                        "pr-4 text-right font-mono tabular-nums " +
                        (r.pointsAwarded > 0
                          ? "text-foreground"
                          : "text-muted-foreground")
                      }
                    >
                      {r.pointsAwarded > 0 ? r.pointsAwarded : <Dash />}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function teamCareerSummary(seasons: TeamSeason[]): string {
  const titles = seasons.filter((s) => s.championshipPosition === 1).length;
  const totalRaces = seasons.reduce((s, r) => s + r.races, 0);
  const totalWins = seasons.reduce((s, r) => s + r.wins, 0);
  const totalPodiums = seasons.reduce((s, r) => s + r.podiums, 0);
  const years = Array.from(new Set(seasons.map((s) => s.year))).sort();
  const span =
    years.length > 1
      ? `${years[0]}–${years[years.length - 1]}`
      : `${years[0]}`;
  const titlesText = titles > 0 ? `${titles} title${titles === 1 ? "" : "s"} · ` : "";
  return `${span} · ${titlesText}${totalRaces} car-races · ${totalWins} wins · ${totalPodiums} podiums`;
}

function TeamCareerTable({ rows }: { rows: TeamSeason[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 pl-4">Year</TableHead>
          <TableHead className="w-20">Class</TableHead>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead className="w-16 text-right">Pos</TableHead>
          <TableHead className="w-20 text-right">Pts</TableHead>
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
              key={`${s.year}-${s.raceClass}-${s.carNumber}-${i}`}
              className={isTitle ? "bg-[var(--racing-yellow)]/5" : undefined}
            >
              <TableCell className="pl-4 font-mono tabular-nums">{s.year}</TableCell>
              <TableCell>
                <span className="font-mono text-xs text-muted-foreground">
                  {raceClassLabel(s.raceClass)}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
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
