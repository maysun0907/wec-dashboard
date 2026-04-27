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
  getDriverStandings,
  getEvents,
  getManufacturerStandings,
  getTeamStandings,
  type RaceClass,
  type StandingDriver,
  type StandingTeam,
  type StandingManufacturer,
} from "@/lib/api";

export const metadata = { title: "Standings" };

type AnyStanding = StandingDriver | StandingTeam | StandingManufacturer;

function groupByClass<T extends { raceClass: RaceClass }>(rows: T[]) {
  const out: Record<RaceClass, T[]> = { HYPERCAR: [], LMP2: [], LMGT3: [] };
  for (const r of rows) out[r.raceClass].push(r);
  return out;
}

export default async function StandingsPage() {
  const [drivers, teams, manufacturers, events] = await Promise.all([
    getDriverStandings(),
    getTeamStandings(),
    getManufacturerStandings(),
    getEvents(),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const completedRounds = events.filter((e) => e.dateEnd < today).length;

  const driversByClass = groupByClass(drivers);
  const teamsByClass = groupByClass(teams);
  const manufacturersByClass = groupByClass(manufacturers);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Standings</h1>
          <p className="text-muted-foreground">
            2026 season · After R{completedRounds}
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

        {RACE_CLASSES.map((c) => {
          const d = driversByClass[c];
          const t = teamsByClass[c];
          const m = manufacturersByClass[c];
          const cols = m.length > 0 ? 3 : 2;
          return (
            <TabsContent key={c} value={c} className="mt-4">
              <div
                className={
                  cols === 3
                    ? "grid gap-6 xl:grid-cols-3"
                    : "grid gap-6 xl:grid-cols-2"
                }
              >
                <StandingsTable
                  title="Drivers"
                  raceClass={c}
                  rows={d.map((r) => ({
                    key: `d-${r.driverId}`,
                    position: r.position,
                    name: r.driverName,
                    detail: undefined,
                    points: r.points,
                  }))}
                  emptyMessage="No driver standings published for this class yet."
                />
                <StandingsTable
                  title="Teams"
                  raceClass={c}
                  rows={t.map((r) => ({
                    key: `t-${r.teamId}`,
                    position: r.position,
                    name: r.teamName,
                    detail: r.manufacturer ?? undefined,
                    points: r.points,
                  }))}
                  emptyMessage="No team standings published for this class yet."
                />
                {m.length > 0 && (
                  <StandingsTable
                    title="Manufacturers"
                    raceClass={c}
                    rows={m.map((r) => ({
                      key: `m-${r.manufacturerId}`,
                      position: r.position,
                      name: r.manufacturerName,
                      detail: undefined,
                      points: r.points,
                    }))}
                    emptyMessage=""
                  />
                )}
              </div>
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

type Row = {
  key: string;
  position: number;
  name: string;
  detail?: string;
  points: number;
};

function StandingsTable({
  title,
  raceClass,
  rows,
  emptyMessage,
}: {
  title: string;
  raceClass: RaceClass;
  rows: Row[];
  emptyMessage: string;
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
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">Pos</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="pr-4 text-right">Pts</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.key}>
                  <TableCell className="pl-4 font-mono tabular-nums">
                    {r.position}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    {r.detail && (
                      <div className="text-xs text-muted-foreground">
                        {r.detail}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="pr-4 text-right font-mono tabular-nums">
                    {r.points}
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
