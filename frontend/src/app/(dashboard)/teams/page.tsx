import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TeamsTableFilter } from "@/components/teams-table-filter";
import {
  RACE_CLASSES,
  getTeams,
  raceClassLabel,
  type RaceClass,
  type TeamEntry,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Teams" };

function groupByClass(teams: TeamEntry[]): Record<RaceClass, TeamEntry[]> {
  const out: Record<RaceClass, TeamEntry[]> = {
    HYPERCAR: [],
    LMP1: [],
    LMP2: [],
    LMGT3: [],
    LMGTE_PRO: [],
    LMGTE_AM: [],
  };
  for (const t of teams) {
    if (out[t.raceClass]) out[t.raceClass].push(t);
  }
  return out;
}

export default async function TeamsPage() {
  const year = await getSelectedSeason();
  const teams = await getTeams(year);
  const byClass = groupByClass(teams);
  const presentClasses = RACE_CLASSES.filter((c) => byClass[c].length > 0);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="text-muted-foreground">{teams.length} entries</p>
      </header>

      <Tabs defaultValue={presentClasses[0] ?? "HYPERCAR"}>
        <TabsList>
          {presentClasses.map((c) => (
            <TabsTrigger key={c} value={c}>
              {raceClassLabel(c)} · {byClass[c].length}
            </TabsTrigger>
          ))}
        </TabsList>
        {presentClasses.map((c) => (
          <TabsContent key={c} value={c} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Entries</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <TeamsTableFilter teams={byClass[c]} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
