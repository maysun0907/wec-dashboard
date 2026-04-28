import Link from "next/link";
import { format, parseISO } from "date-fns";
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
import { Badge } from "@/components/ui/badge";
import { ClassBadge } from "@/components/class-badge";
import { DriversPodium, buildPodiumRows } from "@/components/drivers-podium";
import { Flag } from "@/components/flag";
import { RaceCountdown } from "@/components/race-countdown";
import { getSelectedSeason } from "@/lib/season";
import {
  getDriverStandings,
  getDrivers,
  getEvent,
  getEvents,
  getLastCompletedEvent,
  getNextEvent,
  getSessionByType,
  getSessionResults,
  getTeamStandings,
  getUpcomingEvents,
  type Event,
  type SessionResult,
  type StandingTeam,
} from "@/lib/api";

export default async function HomePage() {
  const year = await getSelectedSeason();
  const [events, driverStandings, teams, driverEntries] = await Promise.all([
    getEvents(year),
    getDriverStandings("HYPERCAR", year),
    getTeamStandings("HYPERCAR", year),
    getDrivers(year),
  ]);
  // Photos live on driver entries, not standings rows — bridge by id.
  const photoById = new Map(driverEntries.map((d) => [d.id, d.photoUrl]));
  const podium = buildPodiumRows(driverStandings, photoById);

  const today = new Date();
  const next = getNextEvent(events, today);
  const upcoming = getUpcomingEvents(events, 3, today);
  const remaining = upcoming.slice(1); // exclude the one in the hero
  const last = getLastCompletedEvent(events, today);
  const completedRounds = events.filter(
    (e) => e.dateEnd < today.toISOString().slice(0, 10),
  ).length;

  // Pull race results for the last completed event in a second hop.
  let lastResult: SessionResult[] = [];
  let lastEventName = "";
  if (last) {
    lastEventName = last.name;
    try {
      const detail = await getEvent(last.id);
      const raceSession = getSessionByType(detail.sessions, "RACE");
      if (raceSession) {
        lastResult = (await getSessionResults(raceSession.id)).slice(0, 5);
      }
    } catch {
      // best-effort — leave empty if endpoint fails
    }
  }

  return (
    <div className="space-y-8">
      {next && <NextRaceHero event={next} />}

      {remaining.length > 0 && <UpcomingCard events={remaining} />}

      <section className="grid gap-6 lg:grid-cols-2">
        <DriversPodium rows={podium} rounds={completedRounds} />
        <StandingsCard
          title="Teams"
          rows={teams.slice(0, 5)}
          rowKey={(r) => `t-${r.teamId}`}
          rowName={(r) => r.teamName}
          rowDetail={(r) => r.manufacturer ?? undefined}
          rounds={completedRounds}
        />
      </section>

      {lastEventName && (
        <LastResultCard eventName={lastEventName} rows={lastResult} />
      )}
    </div>
  );
}

function NextRaceHero({ event }: { event: Event }) {
  const startIso = `${event.dateStart}T13:00:00Z`;

  return (
    <Card className="relative overflow-hidden">
      <div
        className="pointer-events-none absolute inset-0 opacity-30"
        style={{
          background:
            "radial-gradient(800px circle at 0% 0%, var(--racing-red) 0%, transparent 50%)",
        }}
      />
      <CardHeader className="relative">
        <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-[var(--racing-red)] uppercase">
          <span className="size-1.5 animate-pulse rounded-full bg-[var(--racing-red)]" />
          Next Race · Round {event.round} · 2026
        </div>
        <CardTitle className="mt-2 flex items-center gap-2 text-2xl sm:text-3xl">
          <Flag code={event.circuit.country} flagOnly className="text-2xl" />
          {event.name}
        </CardTitle>
        <CardDescription>
          {event.circuit.name} · {event.format ?? "—"}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <RaceCountdown targetIso={startIso} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{format(parseISO(event.dateStart), "EEEE, MMMM d, yyyy")}</span>
          <Link
            href="/races"
            className="ml-auto text-foreground hover:text-[var(--racing-red)]"
          >
            View schedule →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function UpcomingCard({ events }: { events: Event[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Up next</CardTitle>
          <Link
            href="/races"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Full schedule →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/races/${e.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <span className="w-8 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  R{e.round}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{e.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Flag code={e.circuit.country} flagOnly />
                    {e.circuit.name}
                  </span>
                </span>
                <span className="hidden text-right text-xs text-muted-foreground sm:block">
                  <span className="block">
                    {format(parseISO(e.dateStart), "MMM d, yyyy")}
                  </span>
                  <span className="block">{e.format ?? "—"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StandingsCard<T extends { position: number; points: number }>({
  title,
  rows,
  rowKey,
  rowName,
  rowDetail,
  rounds,
}: {
  title: string;
  rows: T[];
  rowKey: (r: T) => string;
  rowName: (r: T) => string;
  rowDetail: (r: T) => string | undefined;
  rounds: number;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title} · Top 5</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            After R{rounds}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableBody>
            {rows.map((row) => {
              const detail = rowDetail(row);
              return (
                <TableRow key={rowKey(row)}>
                  <TableCell className="w-10 pl-4 text-muted-foreground tabular-nums">
                    {row.position}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{rowName(row)}</div>
                    {detail && (
                      <div className="text-xs text-muted-foreground">
                        {detail}
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="text-right pr-4 font-mono tabular-nums">
                    {row.points}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
      <div className="px-4 pt-2 text-right text-xs">
        <Link
          href="/standings"
          className="text-muted-foreground hover:text-foreground"
        >
          Full standings →
        </Link>
      </div>
    </Card>
  );
}

function LastResultCard({
  eventName,
  rows,
}: {
  eventName: string;
  rows: SessionResult[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Latest result</CardTitle>
            <CardDescription>{eventName}</CardDescription>
          </div>
          <Badge variant="secondary">Top 5</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No results published.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">Pos</TableHead>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead className="hidden md:table-cell">Drivers</TableHead>
                <TableHead className="w-16">Class</TableHead>
                <TableHead className="pr-4 text-right">Gap</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.position}-${row.carNumber}`}>
                  <TableCell className="pl-4 font-mono tabular-nums">
                    {row.position}
                  </TableCell>
                  <TableCell className="font-mono tabular-nums">
                    {row.carNumber}
                  </TableCell>
                  <TableCell className="font-medium">{row.team}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {row.drivers}
                  </TableCell>
                  <TableCell>
                    <ClassBadge raceClass={row.raceClass} />
                  </TableCell>
                  <TableCell className="pr-4 text-right font-mono tabular-nums">
                    {row.gap ?? "—"}
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
