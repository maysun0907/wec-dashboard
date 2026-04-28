import Link from "next/link";
import { ChampionshipSimulator } from "@/components/simulator";
import {
  getDriverStandings,
  getDrivers,
  getEvents,
  getManufacturerStandings,
  getTeamStandings,
  getTeams,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Championship simulator" };

export default async function SimulatorPage() {
  const year = await getSelectedSeason();
  const [
    events,
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

  return (
    <div className="space-y-6">
      <Link
        href="/standings"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Standings
      </Link>

      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          Championship simulator
        </h1>
        <p className="text-muted-foreground">
          Pick the podium and pole-sitter for each remaining round, then
          switch between Drivers, Manufacturers (Hypercar), and Teams
          (LMGT3) trophies. Endurance rounds (Le Mans, Bahrain 8h, Qatar
          1812 km) score 38/27/23 to the podium; standard 6h rounds score
          25/18/15. Pole adds +1 to the pole-sitter&rsquo;s drivers.
        </p>
      </header>

      <ChampionshipSimulator
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
