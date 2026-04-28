import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
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
import { ClassBadge } from "@/components/class-badge";
import { DriverPhoto } from "@/components/driver-photo";
import { Flag } from "@/components/flag";
import { FormChart } from "@/components/form-chart";
import {
  describeRounds,
  getDriver,
  type DriverDetail,
  type DriverResult,
} from "@/lib/api";

type Params = { id: string };

async function fetchDriver(id: string): Promise<DriverDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getDriver(numId);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const d = await fetchDriver(id);
  return { title: d?.name ?? "Driver" };
}

export default async function DriverDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const driver = await fetchDriver(id);
  if (driver === null) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/drivers"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Drivers
      </Link>

      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-row items-start gap-4 space-y-0">
          <DriverPhoto
            src={driver.photoUrl}
            name={driver.name}
            size="xl"
            className="mt-1"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-3 text-xs font-semibold tracking-widest uppercase">
              {driver.raceClass && <ClassBadge raceClass={driver.raceClass} />}
              {driver.carNumber && (
                <span className="font-mono text-muted-foreground">
                  #{driver.carNumber}
                </span>
              )}
              {driver.team && (
                <span className="text-muted-foreground">{driver.team}</span>
              )}
            </div>
            <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl">
              {driver.nationality && (
                <Flag code={driver.nationality} flagOnly className="text-2xl" />
              )}
              {driver.name}
            </CardTitle>
            <CardDescription>
              {[driver.manufacturer, driver.carModel]
                .filter(Boolean)
                .join(" · ") || "—"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 text-sm">
            {driver.standing && (
              <>
                <Stat
                  label="Championship pos."
                  value={`P${driver.standing.position}`}
                />
                <Stat
                  label="Points"
                  value={driver.standing.points.toString()}
                />
              </>
            )}
            <Stat
              label="Races finished"
              value={driver.results.length.toString()}
            />
            {driver.results.length > 0 && (
              <>
                <Stat
                  label="Best class result"
                  value={`P${bestClassPosition(driver.results)}`}
                />
                <Stat
                  label="Avg class result"
                  value={averageClassPosition(driver.results).toFixed(1)}
                />
                <Stat
                  label="Points scored"
                  value={pointsScored(driver.results).toString()}
                />
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {driver.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Form</CardTitle>
            <CardDescription>
              Class position by round — lower is better.
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <FormChart
              data={driver.results.map((r) => ({
                round: r.round,
                classPosition: r.classPosition,
              }))}
            />
          </CardContent>
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Co-drivers</CardTitle>
            <CardDescription>
              Same car, 2026 season ({driver.coDrivers.length})
            </CardDescription>
          </CardHeader>
          <CardContent>
            {driver.coDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No co-drivers listed.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {driver.coDrivers.map((c) => {
                  const tag = describeRounds(c.rounds);
                  return (
                    <li key={c.id} className="flex items-center gap-2">
                      <DriverPhoto src={c.photoUrl} name={c.name} size="sm" />
                      <Link
                        href={`/drivers/${c.id}`}
                        className="hover:text-[var(--racing-red)]"
                      >
                        {c.name}
                      </Link>
                      {tag && (
                        <span className="rounded bg-secondary px-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {tag}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Race results</CardTitle>
            <CardDescription>
              {driver.results.length === 0
                ? "No completed races yet this season."
                : "Overall finishing position per round."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {driver.results.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 pl-4">Rd</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead className="w-16 text-right">Class</TableHead>
                    <TableHead className="w-14 text-right">Pos</TableHead>
                    <TableHead className="hidden w-16 text-right sm:table-cell">
                      Laps
                    </TableHead>
                    <TableHead className="pr-4 text-right">Pts</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driver.results.map((r) => (
                    <TableRow key={r.eventId}>
                      <TableCell className="pl-4 font-mono tabular-nums">
                        {r.round}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/races/${r.eventId}`}
                          className="hover:text-[var(--racing-red)]"
                        >
                          {r.eventName}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        P{r.classPosition}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        P{r.position}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                        {r.laps ?? "—"}
                      </TableCell>
                      <TableCell
                        className={
                          "pr-4 text-right font-mono tabular-nums " +
                          (r.pointsAwarded > 0
                            ? "text-foreground"
                            : "text-muted-foreground")
                        }
                      >
                        {r.pointsAwarded > 0 ? r.pointsAwarded : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function bestClassPosition(results: DriverResult[]): number {
  return Math.min(...results.map((r) => r.classPosition));
}

function averageClassPosition(results: DriverResult[]): number {
  if (results.length === 0) return 0;
  return (
    results.reduce((sum, r) => sum + r.classPosition, 0) / results.length
  );
}

function pointsScored(results: DriverResult[]): number {
  return results.reduce((sum, r) => sum + r.pointsAwarded, 0);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}
