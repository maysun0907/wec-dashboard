import Link from "next/link";
import { ChampionshipSimulator } from "@/components/simulator";
import {
  getDriverStandings,
  getDrivers,
  getEvents,
} from "@/lib/api";

export const metadata = { title: "Championship simulator" };

export default async function SimulatorPage() {
  const [events, drivers, hyperStandings, lmgt3Standings] = await Promise.all([
    getEvents(),
    getDrivers(),
    getDriverStandings("HYPERCAR"),
    getDriverStandings("LMGT3"),
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
          Pick a winner for each remaining round and see how the drivers&rsquo;
          championship shifts. Points: 25 / 18 / 15 / … for 6-hour rounds, 38 /
          27 / 23 / … for endurance rounds (Le Mans, Bahrain 8h, Qatar 1812 km).
        </p>
      </header>

      <ChampionshipSimulator
        events={events}
        drivers={drivers}
        currentByClass={{
          HYPERCAR: hyperStandings,
          LMP2: [],
          LMGT3: lmgt3Standings,
        }}
      />
    </div>
  );
}
