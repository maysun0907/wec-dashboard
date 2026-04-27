import {
  Card,
  CardContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassBadge } from "@/components/class-badge";
import {
  RACE_CLASSES,
  getTeams,
  type RaceClass,
  type TeamEntry,
} from "@/lib/api";

export const metadata = { title: "Teams" };

function groupByClass(teams: TeamEntry[]): Record<RaceClass, TeamEntry[]> {
  const out: Record<RaceClass, TeamEntry[]> = {
    HYPERCAR: [],
    LMP2: [],
    LMGT3: [],
  };
  for (const t of teams) out[t.raceClass].push(t);
  return out;
}

export default async function TeamsPage() {
  const teams = await getTeams();
  const byClass = groupByClass(teams);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="text-muted-foreground">
          {teams.length} entries · 2026 season
        </p>
      </header>

      <Tabs defaultValue="HYPERCAR">
        <TabsList>
          {RACE_CLASSES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c} · {byClass[c].length}
            </TabsTrigger>
          ))}
        </TabsList>
        {RACE_CLASSES.map((c) => (
          <TabsContent key={c} value={c} className="mt-4">
            <TeamsTable teams={byClass[c]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function TeamsTable({ teams }: { teams: TeamEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entries</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {teams.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No teams in this class yet.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead className="pr-4">Class</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow key={`${t.id}-${t.carNumber}`}>
                  <TableCell className="pl-4 font-mono tabular-nums">
                    {t.carNumber}
                  </TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.manufacturer ?? "—"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <ClassBadge raceClass={t.raceClass} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
