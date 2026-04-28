import Link from "next/link";
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
        <p className="text-muted-foreground">
          {teams.length} entries
        </p>
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
                  <TableCell className="font-medium">
                    <Link
                      href={`/teams/${t.id}`}
                      className="hover:text-[var(--racing-red)]"
                    >
                      {t.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    <span className="inline-flex items-center gap-2">
                      <ManufacturerLogo
                        src={t.manufacturerLogoUrl}
                        name={t.manufacturer}
                      />
                      {t.manufacturer ?? "—"}
                    </span>
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
