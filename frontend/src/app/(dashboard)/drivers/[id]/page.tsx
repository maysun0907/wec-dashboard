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
import { describeRounds, getDriver, type DriverDetail } from "@/lib/api";

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
        <CardHeader>
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
          <CardTitle className="text-2xl sm:text-3xl">{driver.name}</CardTitle>
          <CardDescription>
            {[
              driver.nationality,
              driver.manufacturer,
              driver.carModel,
            ]
              .filter(Boolean)
              .join(" · ") || "—"}
          </CardDescription>
        </CardHeader>
        {driver.standing && (
          <CardContent>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
              <Stat
                label="Championship pos."
                value={`P${driver.standing.position}`}
              />
              <Stat
                label="Points"
                value={driver.standing.points.toString()}
              />
              <Stat
                label="Races finished"
                value={driver.results.length.toString()}
              />
            </div>
          </CardContent>
        )}
      </Card>

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
                    <TableHead className="w-12 text-right">Pos</TableHead>
                    <TableHead className="hidden w-16 text-right sm:table-cell">
                      Laps
                    </TableHead>
                    <TableHead className="pr-4 text-right">Gap</TableHead>
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
                        {r.position}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                        {r.laps ?? "—"}
                      </TableCell>
                      <TableCell className="pr-4 text-right font-mono tabular-nums">
                        {r.gap ?? "—"}
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
