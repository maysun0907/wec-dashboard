import Link from "next/link";
import { Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DriverPhoto } from "@/components/driver-photo";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { SeasonComparePicker } from "@/components/season-compare-picker";
import {
  getDriverStandings,
  getDrivers,
  getEvents,
  getManufacturerStandings,
  getSeasons,
  type DriverEntry,
  type Event,
  type StandingDriver,
  type StandingManufacturer,
} from "@/lib/api";

export const metadata = { title: "Compare seasons" };

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
};

/** WEC's top class flipped from LMP1 to Hypercar in 2021. Use the right
 *  one for the season being compared so 2014 doesn't render an empty
 *  Hypercar column. */
function topClassFor(year: number) {
  return year >= 2021 ? "HYPERCAR" : "LMP1";
}

async function fetchSeason(year: number): Promise<SeasonData> {
  const cls = topClassFor(year);
  const [events, drivers, manufacturers, driverEntries] = await Promise.all([
    getEvents(year).catch(() => [] as Event[]),
    getDriverStandings(cls as never, year).catch(
      () => [] as StandingDriver[],
    ),
    getManufacturerStandings(cls as never, year).catch(
      () => [] as StandingManufacturer[],
    ),
    getDrivers(year).catch(() => [] as DriverEntry[]),
  ]);
  return { year, topClass: cls, events, drivers, manufacturers, driverEntries };
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

  return (
    <div className="space-y-6">
      <Link
        href="/standings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Standings
      </Link>

      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Compare seasons</h1>
        <p className="text-muted-foreground">
          Drivers&rsquo; champion, manufacturers&rsquo; champion, and the top
          standings of two or three seasons side by side. Top class
          auto-switches from LMP1 (pre-2021) to Hypercar.
        </p>
      </header>

      <SeasonComparePicker selected={years} catalog={seasons} />

      {data.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Pick at least one season above.
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
  const champion = data.drivers.find((d) => d.position === 1) ?? null;
  const otherChamps = data.drivers.filter(
    (d) => d.position === 1 && d.driverId !== champion?.driverId,
  );
  const mfrChamp = data.manufacturers.find((m) => m.position === 1) ?? null;
  const photoById = new Map(
    data.driverEntries.map((d) => [d.id, d.photoUrl]),
  );

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-mono text-2xl tabular-nums">
            {data.year}
          </CardTitle>
          <span className="text-xs text-muted-foreground">
            {data.events.length} rounds
          </span>
        </div>
        <CardDescription>
          {data.topClass === "HYPERCAR" ? "Hypercar" : "LMP1"} championship
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {champion && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Drivers&rsquo; champion
            </div>
            <Link
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
            </Link>
            {otherChamps.map((c) => (
              <Link
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
              </Link>
            ))}
          </div>
        )}

        {mfrChamp && (
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              Manufacturers&rsquo; champion
            </div>
            <Link
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
            </Link>
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
                  <Link
                    href={`/drivers/${d.driverId}`}
                    className="min-w-0 flex-1 truncate hover:text-[var(--racing-red)]"
                  >
                    {d.driverName}
                  </Link>
                  <span className="font-mono tabular-nums">{d.points}</span>
                </li>
              ))}
            </ul>
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
                  <Link
                    href={`/manufacturers/${m.manufacturerId}`}
                    className="min-w-0 flex-1 truncate hover:text-[var(--racing-red)]"
                  >
                    {m.manufacturerName}
                  </Link>
                  <span className="font-mono tabular-nums">{m.points}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
