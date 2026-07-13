import Link from "next/link";
import { connection } from "next/server";
import { getLocale, getTranslations } from "next-intl/server";
import { ChampionshipSimulator } from "@/components/simulator";
import { PageHeader } from "@/components/page-header";
import { localizeEvent } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
import {
  getDriverStandings,
  getDrivers,
  getEvents,
  getManufacturerStandings,
  getTeamStandings,
  getTeams,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({
  title: "Championship simulator",
  path: "/standings/simulator",
});

export default async function SimulatorPage({
  searchParams,
}: {
  searchParams: Promise<{ p?: string | string[] }>;
}) {
  const { p } = await searchParams;
  const initialPicksParam = Array.isArray(p) ? (p[0] ?? null) : (p ?? null);
  await connection();
  const todayIso = new Date().toISOString().slice(0, 10);
  const year = await getSelectedSeason();
  const [
    eventsRaw,
    drivers,
    teams,
    hyperDrivers,
    lmgt3Drivers,
    hyperManufacturers,
    lmgt3Teams,
  ] = await Promise.all([
    getEvents(year),
    getDrivers(year),
    getTeams(year),
    getDriverStandings("HYPERCAR", year),
    getDriverStandings("LMGT3", year),
    getManufacturerStandings("HYPERCAR", year),
    getTeamStandings("LMGT3", year),
  ]);
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const events = eventsRaw.map((e) => localizeEvent(e, locale));
  const t = await getTranslations("simulator");

  return (
    <div className="space-y-6">
      <Link
        href="/standings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        {t("back")}
      </Link>

      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <ChampionshipSimulator
        key={initialPicksParam ?? ""}
        initialPicksParam={initialPicksParam}
        todayIso={todayIso}
        events={events}
        drivers={drivers}
        teams={teams}
        driversByClass={{
          HYPERCAR: hyperDrivers,
          LMP1: [],
          LMP2: [],
          LMGT3: lmgt3Drivers,
          LMGTE_PRO: [],
          LMGTE_AM: [],
        }}
        manufacturersByClass={{ HYPERCAR: hyperManufacturers }}
        teamsByClass={{ LMGT3: lmgt3Teams }}
      />
    </div>
  );
}
