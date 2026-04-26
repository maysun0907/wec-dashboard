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
import { RaceCountdown } from "@/components/race-countdown";
import {
  CURRENT_SEASON,
  DRIVER_STANDINGS,
  EVENTS,
  LAST_RACE_RESULT,
  TEAM_STANDINGS,
  getCircuit,
  getLastCompletedEvent,
  getNextEvent,
} from "@/lib/mock-data";

export default function HomePage() {
  const next = getNextEvent();
  const last = getLastCompletedEvent();
  const completedRounds = EVENTS.filter((e) => e.status === "completed").length;

  return (
    <div className="space-y-8">
      {next && <NextRaceHero event={next} />}

      <section className="grid gap-6 lg:grid-cols-2">
        <StandingsCard
          title="Drivers"
          rows={DRIVER_STANDINGS}
          href="/standings"
          rounds={completedRounds}
        />
        <StandingsCard
          title="Teams"
          rows={TEAM_STANDINGS}
          href="/standings"
          rounds={completedRounds}
        />
      </section>

      {last && <LastResultCard eventName={last.name} />}
    </div>
  );
}

function NextRaceHero({
  event,
}: {
  event: NonNullable<ReturnType<typeof getNextEvent>>;
}) {
  const circuit = getCircuit(event.circuitId);
  const startIso = `${event.startDate}T13:00:00Z`;

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
          Next Race · Round {event.round} · {CURRENT_SEASON}
        </div>
        <CardTitle className="mt-2 text-2xl sm:text-3xl">{event.name}</CardTitle>
        <CardDescription>
          {circuit ? `${circuit.name} · ${circuit.country}` : "—"} ·{" "}
          {event.format}
        </CardDescription>
      </CardHeader>
      <CardContent className="relative space-y-4">
        <RaceCountdown targetIso={startIso} />
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{format(parseISO(event.startDate), "EEEE, MMMM d, yyyy")}</span>
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

function StandingsCard({
  title,
  rows,
  href,
  rounds,
}: {
  title: string;
  rows: typeof DRIVER_STANDINGS;
  href: string;
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
            {rows.map((row) => (
              <TableRow key={row.entityId}>
                <TableCell className="w-10 pl-4 text-muted-foreground tabular-nums">
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
                <TableCell className="text-right pr-4 font-mono tabular-nums">
                  {row.points}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
      <div className="px-4 pt-2 text-right text-xs">
        <Link
          href={href}
          className="text-muted-foreground hover:text-foreground"
        >
          Full standings →
        </Link>
      </div>
    </Card>
  );
}

function LastResultCard({ eventName }: { eventName: string }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Latest result</CardTitle>
            <CardDescription>{eventName}</CardDescription>
          </div>
          <Badge variant="secondary">HYPERCAR</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
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
            {LAST_RACE_RESULT.map((row) => (
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
                  {row.gap}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
