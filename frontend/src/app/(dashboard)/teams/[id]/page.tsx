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
import { describeRounds, getTeam, type TeamDetail } from "@/lib/api";

type Params = { id: string };

async function fetchTeam(id: string): Promise<TeamDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getTeam(numId);
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
  const t = await fetchTeam(id);
  return { title: t?.name ?? "Team" };
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const team = await fetchTeam(id);
  if (team === null) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/teams"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Teams
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="text-2xl sm:text-3xl">{team.name}</CardTitle>
          <CardDescription>
            {team.manufacturer ?? "Independent"} · {team.cars.length}{" "}
            {team.cars.length === 1 ? "car" : "cars"} this season
          </CardDescription>
        </CardHeader>
      </Card>

      <section className="space-y-6">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-muted-foreground">
          Entries
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {team.cars.map((c) => (
            <Card key={c.carId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      <span className="font-mono">#{c.number}</span>{" "}
                      <span className="text-muted-foreground">
                        {c.model ?? ""}
                      </span>
                    </CardTitle>
                    <CardDescription>
                      {c.drivers.length} drivers
                    </CardDescription>
                  </div>
                  <ClassBadge raceClass={c.raceClass} />
                </div>
              </CardHeader>
              <CardContent>
                {c.drivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No drivers listed yet.
                  </p>
                ) : (
                  <ul className="space-y-2 text-sm">
                    {c.drivers.map((d) => {
                      const tag = describeRounds(d.rounds);
                      return (
                        <li key={d.id} className="flex items-center gap-2">
                          <Link
                            href={`/drivers/${d.id}`}
                            className="hover:text-[var(--racing-red)]"
                          >
                            {d.name}
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
          ))}
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Race results</CardTitle>
          <CardDescription>
            {team.results.length === 0
              ? "No completed races yet this season."
              : "Across all team cars, sorted by round."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {team.results.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4">Rd</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-16">Class</TableHead>
                  <TableHead className="w-12 text-right">Pos</TableHead>
                  <TableHead className="pr-4 text-right">Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.results.map((r) => (
                  <TableRow key={`${r.eventId}-${r.carNumber}`}>
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
                    <TableCell className="font-mono tabular-nums">
                      {r.carNumber}
                    </TableCell>
                    <TableCell>
                      <ClassBadge raceClass={r.raceClass} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      {r.position}
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
    </div>
  );
}
