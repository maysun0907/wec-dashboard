import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DriverPhoto } from "@/components/driver-photo";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PageHeader } from "@/components/page-header";
import { PublicLink } from "@/components/public-link";
import {
  getCarModels,
  getDrivers,
  getManufacturerStandings,
  getTeams,
  type CarModelSummary,
  type DriverEntry,
  type StandingManufacturer,
  type TeamEntry,
} from "@/lib/api";
import { buildGenesisTracker } from "@/lib/championship-content";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";
import { localDriverImage } from "@/lib/driver-image";
import { getSelectedSeason } from "@/lib/season";

export async function generateMetadata() {
  const [metadata, year] = await Promise.all([
    dashboardPageMetadata("genesis", "/genesis-wec"),
    getSelectedSeason(),
  ]);
  const [drivers, standings] = await Promise.all([
    getDrivers(year).catch(() => [] as DriverEntry[]),
    getManufacturerStandings("HYPERCAR", year).catch(
      () => [] as StandingManufacturer[],
    ),
  ]);
  const hasPublishedEntry = buildGenesisTracker(drivers, standings) !== null;
  return !hasPublishedEntry
    ? { ...metadata, robots: { index: false, follow: true } }
    : metadata;
}

const isGenesis = (value: string | null | undefined) =>
  value != null && /genesis/i.test(value);

export default async function GenesisWecPage() {
  const year = await getSelectedSeason();
  const seasonYear = year ?? new Date().getUTCFullYear();
  const [drivers, teams, cars, manufacturerStandings] = await Promise.all([
    getDrivers(year).catch(() => [] as DriverEntry[]),
    getTeams(year).catch(() => [] as TeamEntry[]),
    getCarModels(year).catch(() => [] as CarModelSummary[]),
    getManufacturerStandings("HYPERCAR", year).catch(
      () => [] as StandingManufacturer[],
    ),
  ]);
  const tracker = buildGenesisTracker(drivers, manufacturerStandings);
  const genesisTeams = teams.filter(
    (team) =>
      isGenesis(team.name) ||
      isGenesis(team.manufacturer) ||
      isGenesis(team.model),
  );
  const genesisCars = cars.filter(
    (car) => isGenesis(car.name) || isGenesis(car.manufacturer),
  );
  const t = await getTranslations("genesis");

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title", { year: seasonYear })}
        description={t("description", { year: seasonYear })}
      />

      {tracker ? (
        <>
          <section
            aria-labelledby="genesis-entries-title"
            className="space-y-3"
          >
            <div>
              <h2
                id="genesis-entries-title"
                className="font-heading text-2xl font-bold uppercase tracking-tight"
              >
                {t("entriesTitle")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t("entriesDescription", { year: seasonYear })}
              </p>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {tracker.entries.map((entry) => {
                const team = genesisTeams.find(
                  (item) => item.carNumber === entry.carNumber,
                );
                const car = genesisCars.find(
                  (item) =>
                    item.slug === team?.carModelSlug ||
                    item.name === team?.model,
                );
                const entryDrivers = tracker.drivers.filter(
                  (driver) => driver.carNumber === entry.carNumber,
                );

                return (
                  <Card key={`${entry.raceClass}-${entry.carNumber}`}>
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <CardTitle>
                            {t("carEntry", { number: entry.carNumber })}
                          </CardTitle>
                          <CardDescription>
                            {team?.model ?? car?.name ?? t("modelFallback")}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary">{entry.raceClass}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex items-center gap-3">
                        <ManufacturerLogo
                          src={
                            team?.manufacturerLogoUrl ??
                            car?.manufacturerLogoUrl ??
                            null
                          }
                          name={team?.manufacturer ?? car?.manufacturer ?? "Genesis"}
                          size="lg"
                        />
                        <div>
                          {team ? (
                            <PublicLink
                              href={`/teams/${team.id}`}
                              className="font-medium hover:text-[var(--racing-red)]"
                            >
                              {team.name}
                            </PublicLink>
                          ) : (
                            <p className="font-medium">{entry.team}</p>
                          )}
                          {car?.slug && (
                            <p>
                              <PublicLink
                                href={`/cars/${car.slug}`}
                                className="text-sm text-muted-foreground hover:text-foreground"
                              >
                                {t("carProfile")} →
                              </PublicLink>
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                          {t("driversTitle")}
                        </p>
                        {entryDrivers.map((driver) => {
                          const source = drivers.find(
                            (item) => item.id === driver.id,
                          );
                          return (
                            <PublicLink
                              key={driver.id}
                              href={`/drivers/${driver.id}`}
                              className="flex items-center gap-2 rounded-md py-1 hover:text-[var(--racing-red)]"
                            >
                              <DriverPhoto
                                src={
                                  localDriverImage(driver.id) ??
                                  source?.photoUrl ??
                                  null
                                }
                                name={driver.name}
                                size="sm"
                              />
                              <span className="font-medium">{driver.name}</span>
                            </PublicLink>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </section>

          <Card>
            <CardHeader>
              <CardTitle>{t("standingTitle")}</CardTitle>
              <CardDescription>
                {t("standingDescription", { year: seasonYear })}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {tracker.manufacturerStanding ? (
                <PublicLink
                  href={`/manufacturers/${tracker.manufacturerStanding.manufacturerId}`}
                  className="flex flex-wrap items-center gap-4 rounded-lg border border-border/60 p-4 hover:border-foreground/30"
                >
                  <ManufacturerLogo
                    src={tracker.manufacturerStanding.manufacturerLogoUrl}
                    name={tracker.manufacturerStanding.manufacturerName}
                    size="xl"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-heading text-2xl font-bold uppercase">
                      {tracker.manufacturerStanding.manufacturerName}
                    </p>
                    <p className="text-muted-foreground">
                      {t("standingValue", {
                        position: tracker.manufacturerStanding.position,
                        points: tracker.manufacturerStanding.points,
                      })}
                    </p>
                  </div>
                  <span aria-hidden>→</span>
                </PublicLink>
              ) : (
                <p className="text-muted-foreground">{t("standingPending")}</p>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="py-4 text-muted-foreground">
            {t("noPublishedEntry", { year: seasonYear })}
          </CardContent>
        </Card>
      )}

      <section className="rounded-xl border border-border/60 bg-secondary/20 p-5">
        <h2 className="font-heading text-xl font-bold uppercase">
          {t("dataScopeTitle")}
        </h2>
        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-muted-foreground">
          {t("dataScopeDescription")}
        </p>
        <nav className="mt-4 flex flex-wrap gap-4 text-sm font-medium">
          <PublicLink
            href="/standings"
            seasonYear={seasonYear}
            className="hover:text-[var(--racing-red)]"
          >
            {t("allStandings")} →
          </PublicLink>
          <PublicLink
            href="/drivers"
            seasonYear={seasonYear}
            className="hover:text-[var(--racing-red)]"
          >
            {t("allDrivers")} →
          </PublicLink>
          <PublicLink
            href="/teams"
            seasonYear={seasonYear}
            className="hover:text-[var(--racing-red)]"
          >
            {t("allTeams")} →
          </PublicLink>
          <PublicLink
            href="/cars"
            seasonYear={seasonYear}
            className="hover:text-[var(--racing-red)]"
          >
            {t("allCars")} →
          </PublicLink>
        </nav>
      </section>
    </div>
  );
}
