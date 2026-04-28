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
import { DriverPhoto } from "@/components/driver-photo";
import { Flag } from "@/components/flag";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import {
  describeRounds,
  getManufacturer,
  raceClassLabel,
  type ManufacturerDetail,
  type ManufacturerResult,
  type ManufacturerSeason,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

type Params = { id: string };

async function fetchManufacturer(
  id: string,
  year: number | null,
): Promise<ManufacturerDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getManufacturer(numId, year);
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
  const m = await fetchManufacturer(id, year);
  return { title: m?.name ?? "Manufacturer" };
}

export default async function ManufacturerDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const year = await getSelectedSeason();
  const manufacturer = await fetchManufacturer(id, year);
  if (manufacturer === null) notFound();

  const totalCars = manufacturer.cars.length;
  const totalDrivers = new Set(
    manufacturer.cars.flatMap((c) => c.drivers.map((d) => d.id)),
  ).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/standings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← Standings
        </Link>
        <Link
          href={`/manufacturers/compare?ids=${manufacturer.id}`}
          className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          Compare →
        </Link>
      </div>

      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
          <ManufacturerLogo
            src={manufacturer.logoUrl}
            name={manufacturer.name}
            size="lg"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl sm:text-3xl">
              {manufacturer.country && (
                <Flag
                  code={manufacturer.country}
                  flagOnly
                  className="text-2xl"
                />
              )}
              <span>{manufacturer.name}</span>
              <ChampionBadge
                titles={manufacturer.seasons.filter(
                  (s) => s.championshipPosition === 1,
                ).length}
                size="md"
              />
            </CardTitle>
            <CardDescription>
              {`${totalCars} cars · ${totalDrivers} drivers`}
            </CardDescription>
          </div>
        </CardHeader>
        {manufacturer.standings.length > 0 && (
          <CardContent>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 text-sm">
              {manufacturer.standings.map((s) => (
                <Stat
                  key={s.raceClass}
                  label={`${s.raceClass} championship`}
                  value={`P${s.position} · ${s.points} pts`}
                />
              ))}
            </div>
          </CardContent>
        )}
      </Card>

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {manufacturer.cars.map((c) => (
          <Card key={c.carId}>
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  <Link
                    href={`/teams/${c.teamId}`}
                    className="hover:text-[var(--racing-red)]"
                  >
                    {c.teamName}
                  </Link>
                </CardTitle>
                <ClassBadge raceClass={c.raceClass} />
              </div>
              <CardDescription className="flex items-center gap-2">
                <span className="font-mono text-xs text-foreground">
                  #{c.carNumber}
                </span>
                {c.model && <span>{c.model}</span>}
              </CardDescription>
            </CardHeader>
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
      </section>

      {manufacturer.seasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Career</CardTitle>
            <CardDescription>
              {manufacturerCareerSummary(manufacturer.seasons)}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ManufacturerCareerTable rows={manufacturer.seasons} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Race results</CardTitle>
          <CardDescription>
            {manufacturer.results.length === 0
              ? "No completed races yet this season."
              : `Every ${manufacturer.name} car's class finish per round.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {manufacturer.results.length > 0 && (
            <ResultsTable rows={manufacturer.results} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function manufacturerCareerSummary(seasons: ManufacturerSeason[]): string {
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

function ManufacturerCareerTable({ rows }: { rows: ManufacturerSeason[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 pl-4">Year</TableHead>
          <TableHead className="w-20">Class</TableHead>
          <TableHead className="w-16 text-right">Pos</TableHead>
          <TableHead className="w-20 text-right">Pts</TableHead>
          <TableHead className="hidden w-12 text-right sm:table-cell">Cars</TableHead>
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
              key={`${s.year}-${s.raceClass}-${i}`}
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
              <TableCell
                className={
                  "text-right font-mono tabular-nums " +
                  (isTitle ? "font-semibold text-[var(--racing-yellow)]" : "")
                }
              >
                {s.championshipPosition !== null ? `P${s.championshipPosition}` : "—"}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {s.points !== null ? s.points : "—"}
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                {s.cars}
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground md:table-cell">
                {s.races}
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                {s.wins > 0 ? s.wins : "—"}
              </TableCell>
              <TableCell className="pr-4 text-right font-mono tabular-nums">
                {s.podiums > 0 ? s.podiums : "—"}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function ResultsTable({ rows }: { rows: ManufacturerResult[] }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 pl-4">Rd</TableHead>
          <TableHead>Event</TableHead>
          <TableHead className="hidden md:table-cell">Team</TableHead>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead className="w-16 text-right">Class</TableHead>
          <TableHead className="hidden w-14 text-right sm:table-cell">
            Pos
          </TableHead>
          <TableHead className="pr-4 text-right">Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
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
            <TableCell className="hidden text-muted-foreground md:table-cell">
              {r.teamName}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {r.carNumber}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              P{r.classPosition}
            </TableCell>
            <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
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
              {r.pointsAwarded > 0 ? r.pointsAwarded : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
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
