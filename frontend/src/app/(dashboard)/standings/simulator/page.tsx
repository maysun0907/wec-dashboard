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

export const metadata = { title: "Championship simulator" };

export default async function SimulatorPage() {
  const [
    events,
    drivers,
    teams,
    hyperDrivers,
    lmgt3Drivers,
    hyperManufacturers,
    lmgt3Teams,
  ] = await Promise.all([
    getEvents(),
    getDrivers(),
    getTeams(),
    getDriverStandings("HYPERCAR"),
    getDriverStandings("LMGT3"),
    getManufacturerStandings("HYPERCAR"),
    getTeamStandings("LMGT3"),
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
          Pick a winner per remaining round and switch between Drivers,
          Manufacturers (Hypercar), and Teams (LMGT3) trophies. Endurance
          rounds (Le Mans, Bahrain 8h, Qatar 1812 km) score 38 to the winner;
          standard 6h rounds score 25.
        </p>
      </header>

      <ChampionshipSimulator
        events={events}
        drivers={drivers}
        teams={teams}
        driversByClass={{
          HYPERCAR: hyperDrivers,
          LMP2: [],
          LMGT3: lmgt3Drivers,
        }}
        manufacturersByClass={{ HYPERCAR: hyperManufacturers }}
        teamsByClass={{ LMGT3: lmgt3Teams }}
      />
    </div>
  );
}
