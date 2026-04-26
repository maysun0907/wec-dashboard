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
  CURRENT_SEASON,
  EVENTS,
  RACE_CLASSES,
  STANDINGS,
  type ClassStandings,
  type RaceClass,
  type StandingRow,
} from "@/lib/mock-data";

export const metadata = { title: "Standings" };

export default function StandingsPage() {
  const completedRounds = EVENTS.filter((e) => e.status === "completed").length;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Standings</h1>
          <p className="text-muted-foreground">
            {CURRENT_SEASON} season · After R{completedRounds}
          </p>
        </div>
      </header>

      <Tabs defaultValue="HYPERCAR">
        <TabsList>
          {RACE_CLASSES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>

        {RACE_CLASSES.map((c) => (
          <TabsContent key={c} value={c} className="mt-4">
            <ClassStandingsView raceClass={c} data={STANDINGS[c]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function ClassStandingsView({
  raceClass,
  data,
}: {
  raceClass: RaceClass;
  data: ClassStandings;
}) {
  const cols = data.manufacturers ? 3 : 2;
  return (
    <div
      className={
        cols === 3
          ? "grid gap-6 xl:grid-cols-3"
          : "grid gap-6 xl:grid-cols-2"
      }
    >
      <StandingsTable
        title="Drivers"
        raceClass={raceClass}
        rows={data.drivers}
      />
      <StandingsTable title="Teams" raceClass={raceClass} rows={data.teams} />
      {data.manufacturers && (
        <StandingsTable
          title="Manufacturers"
          raceClass={raceClass}
          rows={data.manufacturers}
        />
      )}
    </div>
  );
}

function StandingsTable({
  title,
  raceClass,
  rows,
}: {
  title: string;
  raceClass: RaceClass;
  rows: StandingRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          <ClassBadge raceClass={raceClass} />
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">Pos</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="pr-4 text-right">Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.entityId}>
                <TableCell className="pl-4 font-mono tabular-nums">
                  {row.position}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{row.name}</div>
                  {row.detail && (
                    <div className="text-xs text-muted-foreground">
                      {row.detail}
                    </div>
                  )}
                </TableCell>
                <TableCell className="pr-4 text-right font-mono tabular-nums">
                  {row.points}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
