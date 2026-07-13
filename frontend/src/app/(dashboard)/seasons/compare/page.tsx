import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  CarProgressionCard,
  type CarProgressionSeries,
} from "@/components/car-progression-card";
import { DriverPhoto } from "@/components/driver-photo";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PageHeader } from "@/components/page-header";
import { PublicLink } from "@/components/public-link";
import { RoundPodiumChart } from "@/components/round-podium-chart";
import { SeasonComparePicker } from "@/components/season-compare-picker";
import {
  getDriverStandings,
  getDrivers,
  getEvents,
  getManufacturerStandings,
  getRoundPodiums,
  getSeasons,
  getTeamProgression,
  getTeams,
  type DriverEntry,
  type Event,
  type RoundPodium,
  type StandingDriver,
  type StandingManufacturer,
  type TeamEntry,
  type TeamProgression,
} from "@/lib/api";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";

export const generateMetadata = () =>
  dashboardPageMetadata("seasonCompare", "/seasons/compare");

function parseYears(raw: string | string[] | undefined): number[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const out: number[] = [];
  for (const part of text.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 1990 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 3);
}

type SeasonData = {
  year: number;
  topClass: string;
  events: Event[];
  drivers: StandingDriver[];
  manufacturers: StandingManufacturer[];
  driverEntries: DriverEntry[];
  teamEntries: TeamEntry[];
  carProgression: TeamProgression[];
  podiums: RoundPodium[];
};

/** WEC's top class flipped from LMP1 to Hypercar in 2021. Use the right
 *  one for the season being compared so 2014 doesn't render an empty
 *  Hypercar column. */
function topClassFor(year: number) {
  return year >= 2021 ? "HYPERCAR" : "LMP1";
}

async function fetchSeason(year: number): Promise<SeasonData> {
  const cls = topClassFor(year);
  const [
    events,
    drivers,
    manufacturers,
    driverEntries,
    teamEntries,
    carProgression,
    podiums,
  ] = await Promise.all([
    getEvents(year).catch(() => [] as Event[]),
    getDriverStandings(cls as never, year).catch(
      () => [] as StandingDriver[],
    ),
    getManufacturerStandings(cls as never, year).catch(
      () => [] as StandingManufacturer[],
    ),
    getDrivers(year).catch(() => [] as DriverEntry[]),
    getTeams(year).catch(() => [] as TeamEntry[]),
    // /api/v1/standings/teams/progression returns one row per (team_id,
    // car_number), which is exactly the unit we want — top 3 cars by
    // points instead of three drivers from the same trio.
    getTeamProgression(cls as never, 3, year).catch(
      () => [] as TeamProgression[],
    ),
    getRoundPodiums(cls as never, year).catch(() => [] as RoundPodium[]),
  ]);
  return {
    year,
    topClass: cls,
    events,
    drivers,
    manufacturers,
    driverEntries,
    teamEntries,
    carProgression,
    podiums,
  };
}

export default async function SeasonComparePage({
  searchParams,
}: {
  searchParams: Promise<{ years?: string | string[] }>;
}) {
  const sp = await searchParams;
  let years = parseYears(sp.years);
  const seasons = await getSeasons().catch(() => []);

  // Default: the two most recent ingested seasons.
  if (years.length === 0) {
    years = seasons.slice(0, 2).map((s) => s.year);
  }

  const data = await Promise.all(years.map((y) => fetchSeason(y)));
  const t = await getTranslations("seasons");
  const tStandings = await getTranslations("standings");

  return (
    <div className="space-y-6">
      <PublicLink
        href="/standings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {tStandings("title")}
      </PublicLink>

      <PageHeader
        eyebrow={t("sideBySide")}
        title={t("compareSeasons")}
        description={t("compareSeasonsDesc")}
      />

      <SeasonComparePicker selected={years} catalog={seasons} />

      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("pickAtLeastOneSeason")}
          </CardContent>
        </Card>
      ) : (
        <div
          className={
            data.length === 3
              ? "grid gap-6 lg:grid-cols-3"
              : "grid gap-6 lg:grid-cols-2"
          }
        >
          {data.map((d) => (
            <SeasonColumn key={d.year} data={d} />
          ))}
        </div>
      )}
    </div>
  );
}

function SeasonColumn({ data }: { data: SeasonData }) {
  const t = useTranslations("seasons");
  const champion = data.drivers.find((d) => d.position === 1) ?? null;
  const otherChamps = data.drivers.filter(
    (d) => d.position === 1 && d.driverId !== champion?.driverId,
  );
  const mfrChamp = data.manufacturers.find((m) => m.position === 1) ?? null;
  const photoById = new Map(
    data.driverEntries.map((d) => [d.id, d.photoUrl]),
  );
  // For each (team, carNumber) progression row, look up the
  // manufacturer logo from the team-entry list and the driver trio
  // from the driver-entry list. Hover card shows car + team + drivers.
  const teamMetaByCar = new Map(
    data.teamEntries.map((t) => [`${t.id}-${t.carNumber}`, t]),
  );
  const driversByCar = new Map<string, DriverEntry[]>();
  for (const d of data.driverEntries) {
    // driverEntries doesn't carry team_id directly — match by team name
    // + car number, which is unique for the season.
    const teamMatches = data.teamEntries.filter(
      (t) => t.name === d.team && t.carNumber === d.carNumber,
    );
    for (const t of teamMatches) {
      const k = `${t.id}-${t.carNumber}`;
      driversByCar.set(k, [...(driversByCar.get(k) ?? []), d]);
    }
  }
  const carSeries: CarProgressionSeries[] = data.carProgression.map((p) => {
    const k = `${p.teamId}-${p.carNumber}`;
    const meta = teamMetaByCar.get(k);
    const drivers = driversByCar.get(k) ?? [];
    return {
      key: k,
      label: `${p.teamName} #${p.carNumber}`,
      team: p.teamName,
      manufacturer: meta?.manufacturer ?? null,
      manufacturerLogoUrl: meta?.manufacturerLogoUrl ?? null,
      carNumber: p.carNumber,
      drivers: drivers.map((d) => ({ id: d.id, name: d.name })),
      points: p.points,
    };
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-2xl tabular-nums">
            {data.year}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {t("roundsCount", { count: data.events.length })}
          </span>
        </div>
        <CardDescription>
          {data.topClass === "HYPERCAR" ? t("hypercarChampionship") : t("lmp1Championship")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {champion && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Drivers&rsquo; champion
            </div>
            <PublicLink
              href={`/drivers/${champion.driverId}`}
              className="flex items-center gap-3 rounded-md p-2 hover:bg-secondary/40"
            >
              <DriverPhoto
                src={photoById.get(champion.driverId) ?? null}
                name={champion.driverName}
                size="md"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 truncate font-semibold">
                  <Trophy
                    className="size-3.5 shrink-0 text-[var(--racing-yellow)]"
                    fill="currentColor"
                  />
                  {champion.driverName}
                </div>
                {champion.team && (
                  <div className="truncate text-xs text-muted-foreground">
                    {champion.team}
                  </div>
                )}
              </div>
              <span className="font-mono text-sm tabular-nums">
                {champion.points}
              </span>
            </PublicLink>
            {otherChamps.map((c) => (
              <PublicLink
                key={c.driverId}
                href={`/drivers/${c.driverId}`}
                className="flex items-center gap-3 rounded-md p-2 hover:bg-secondary/40"
              >
                <DriverPhoto
                  src={photoById.get(c.driverId) ?? null}
                  name={c.driverName}
                  size="md"
                />
                <div className="min-w-0 flex-1 truncate text-sm">
                  + {c.driverName}
                </div>
                <span className="font-mono text-sm tabular-nums">
                  {c.points}
                </span>
              </PublicLink>
            ))}
          </div>
        )}

        {mfrChamp && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Manufacturers&rsquo; champion
            </div>
            <PublicLink
              href={`/manufacturers/${mfrChamp.manufacturerId}`}
              className="flex items-center gap-3 rounded-md p-2 hover:bg-secondary/40"
            >
              <ManufacturerLogo
                src={mfrChamp.manufacturerLogoUrl}
                name={mfrChamp.manufacturerName}
                size="md"
              />
              <div className="min-w-0 flex-1 truncate font-semibold">
                {mfrChamp.manufacturerName}
              </div>
              <span className="font-mono text-sm tabular-nums">
                {mfrChamp.points}
              </span>
            </PublicLink>
          </div>
        )}

        {data.drivers.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Top 5 drivers
            </div>
            <ul className="space-y-1 text-sm">
              {data.drivers.slice(0, 5).map((d) => (
                <li
                  key={d.driverId}
                  className="flex items-center gap-2 px-2 py-1"
                >
                  <span className="w-6 font-mono tabular-nums text-muted-foreground">
                    {d.position}
                  </span>
                  <PublicLink
                    href={`/drivers/${d.driverId}`}
                    className="min-w-0 flex-1 truncate hover:text-[var(--racing-red)]"
                  >
                    {d.driverName}
                  </PublicLink>
                  <span className="font-mono tabular-nums">{d.points}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {carSeries.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Title race · top 3 cars
            </div>
            <CarProgressionCard series={carSeries} />
          </div>
        )}

        {data.manufacturers.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Top manufacturers
            </div>
            <ul className="space-y-1 text-sm">
              {data.manufacturers.slice(0, 5).map((m) => (
                <li
                  key={m.manufacturerId}
                  className="flex items-center gap-2 px-2 py-1"
                >
                  <span className="w-6 font-mono tabular-nums text-muted-foreground">
                    {m.position}
                  </span>
                  <ManufacturerLogo
                    src={m.manufacturerLogoUrl}
                    name={m.manufacturerName}
                  />
                  <PublicLink
                    href={`/manufacturers/${m.manufacturerId}`}
                    className="min-w-0 flex-1 truncate hover:text-[var(--racing-red)]"
                  >
                    {m.manufacturerName}
                  </PublicLink>
                  <span className="font-mono tabular-nums">{m.points}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.podiums.length > 0 && (
          <div className="space-y-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Round podiums
            </div>
            <RoundPodiumChart rows={data.podiums} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
