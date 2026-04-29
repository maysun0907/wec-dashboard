import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassBadge } from "@/components/class-badge";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import {
  RACE_CLASSES,
  getTeams,
  raceClassLabel,
  type RaceClass,
  type TeamEntry,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Teams" };

type TeamCardEntry = {
  id: number;
  name: string;
  raceClass: RaceClass;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  carNumbers: string[];
};

function groupByTeam(teams: TeamEntry[]): TeamCardEntry[] {
  const map = new Map<string, TeamCardEntry>();
  for (const t of teams) {
    const key = `${t.raceClass}::${t.id}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        id: t.id,
        name: t.name,
        raceClass: t.raceClass,
        manufacturer: t.manufacturer,
        manufacturerLogoUrl: t.manufacturerLogoUrl,
        carNumbers: [],
      };
      map.set(key, entry);
    }
    entry.carNumbers.push(t.carNumber);
  }
  for (const e of map.values()) {
    e.carNumbers.sort((a, b) => Number(a) - Number(b));
  }
  return Array.from(map.values());
}

export default async function TeamsPage() {
  const year = await getSelectedSeason();
  const teams = await getTeams(year);
  const all = groupByTeam(teams);
  const present = RACE_CLASSES.filter((c) => all.some((t) => t.raceClass === c));

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="text-muted-foreground">
          {all.length} teams · {teams.length} cars
        </p>
      </header>

      <Tabs defaultValue={present[0] ?? "HYPERCAR"}>
        <TabsList>
          {present.map((c) => (
            <TabsTrigger key={c} value={c}>
              {raceClassLabel(c)} · {all.filter((t) => t.raceClass === c).length}
            </TabsTrigger>
          ))}
        </TabsList>
        {present.map((c) => {
          const inClass = all
            .filter((t) => t.raceClass === c)
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <TabsContent key={c} value={c} className="mt-4">
              {inClass.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No teams in this class.
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {inClass.map((t) => (
                    <TeamCard key={`${t.raceClass}-${t.id}`} entry={t} />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function TeamCard({ entry }: { entry: TeamCardEntry }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <ManufacturerLogo
          src={entry.manufacturerLogoUrl}
          name={entry.manufacturer ?? entry.name}
          size="md"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="truncate">
            <Link
              href={`/teams/${entry.id}`}
              className="hover:text-[var(--racing-red)]"
            >
              {entry.name}
            </Link>
          </CardTitle>
          <CardDescription>
            {entry.manufacturer ?? "Independent"}
          </CardDescription>
        </div>
        <ClassBadge raceClass={entry.raceClass} />
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          Entries · {entry.carNumbers.length}
        </p>
        <ul className="flex flex-wrap gap-2 text-sm">
          {entry.carNumbers.map((n) => (
            <li
              key={n}
              className="rounded-md border px-2 py-1 font-mono tabular-nums"
            >
              #{n}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
