import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Flag } from "@/components/flag";
import { ClassBadge } from "@/components/class-badge";
import { QualifyingResultsTable } from "@/components/qualifying-results-table";
import { PitStopsCard } from "@/components/pit-stops-card";
import { RaceLapChart } from "@/components/race-lap-chart";
import { SessionWeatherBadge } from "@/components/session-weather-badge";
import { Dash, DriverList, TeamLink } from "@/components/entity-link";
import {
  eventStatus,
  getEvent,
  getEvents,
  getSessionResults,
  type EventStatus,
  type SessionResult,
} from "@/lib/api";

type Params = { id: string };

const SESSION_LABELS: Record<string, string> = {
  FP1: "Practice 1",
  FP2: "Practice 2",
  FP3: "Practice 3",
  Q: "Qualifying",
  RACE: "Race",
};

const SESSION_LABELS_SHORT: Record<string, string> = {
  FP1: "FP1",
  FP2: "FP2",
  FP3: "FP3",
  Q: "Q",
  RACE: "Race",
};

export async function generateStaticParams(): Promise<Params[]> {
  const events = await getEvents();
  return events.map((e) => ({ id: e.id.toString() }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const numId = Number(id);
  if (!Number.isFinite(numId)) return { title: "Race" };
  try {
    const event = await getEvent(numId);
    return { title: event.name };
  } catch {
    return { title: "Race" };
  }
}

export default async function RaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const requestedSession =
    typeof sp.session === "string" ? sp.session.toUpperCase() : null;
  const numId = Number(id);
  if (!Number.isFinite(numId)) notFound();

  let event;
  try {
    event = await getEvent(numId);
  } catch {
    notFound();
  }

  const status = eventStatus(event);
  const sessions = event.sessions; // already in canonical order

  // Pre-fetch results for every session in parallel so each tab is instant.
  const resultsBySession = await Promise.all(
    sessions.map(async (s) => ({
      sessionId: s.id,
      results: await getSessionResults(s.id).catch(
        () => [] as SessionResult[],
      ),
    })),
  );
  const resultMap = new Map(
    resultsBySession.map((r) => [r.sessionId, r.results]),
  );
  const sessionsWithResults = sessions.filter(
    (s) => (resultMap.get(s.id)?.length ?? 0) > 0,
  );

  return (
    <div className="space-y-6">
      <Link
        href="/races"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Schedule
      </Link>

      <Card className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:gap-6">
        {event.posterUrl && (
          // FIA-published round poster (transparent-bg PNG). Sits to
          // the left of the title block at sm+, stacks on top of it
          // on phones.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={event.posterUrl}
            alt={`${event.name} round poster`}
            className="h-28 w-28 shrink-0 self-center object-contain sm:h-32 sm:w-32"
            loading="lazy"
          />
        )}
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            <span>
              Round {event.round} · {parseISO(event.dateStart).getFullYear()}
            </span>
            <StatusBadge status={status} />
          </div>
          <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl">
            <Flag code={event.circuit.country} flagOnly className="text-2xl" />
            {event.name}
          </CardTitle>
          <CardDescription>
            <Link
              href={`/circuits/${event.circuit.id}`}
              className="hover:text-foreground"
            >
              {event.circuit.name}
            </Link>
            {event.format && <> · {event.format}</>}
          </CardDescription>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(event.dateStart), "EEEE, MMMM d, yyyy")}
            {event.dateEnd !== event.dateStart &&
              ` – ${format(parseISO(event.dateEnd), "MMMM d, yyyy")}`}
          </p>
        </div>
      </Card>

      {sessionsWithResults.length > 0 ? (
        <Tabs
          defaultValue={
            // Honor ?session=FP1 etc. from /live deep links, else
            // default to the most recent session with data.
            (requestedSession &&
              sessionsWithResults.some((s) => s.type === requestedSession) &&
              requestedSession) ||
            sessionsWithResults[sessionsWithResults.length - 1].type
          }
        >
          {/* overflow-y-hidden suppresses the vertical scrollbar
              Windows Chrome auto-renders next to the active tab when
              text rendering is a hair taller than the 32-px TabsList
              height. macOS/Linux don't trip it; Windows does. */}
          <TabsList className="flex w-full max-w-full overflow-x-auto overflow-y-hidden sm:w-fit">
            {sessionsWithResults.map((s) => (
              <TabsTrigger key={s.id} value={s.type}>
                <span className="sm:hidden">
                  {SESSION_LABELS_SHORT[s.type] ?? s.type}
                </span>
                <span className="hidden sm:inline">
                  {SESSION_LABELS[s.type] ?? s.type}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {sessionsWithResults.map((s) => {
            const rows = resultMap.get(s.id) ?? [];
            const isPractice =
              s.type === "FP1" || s.type === "FP2" || s.type === "FP3";
            return (
              <TabsContent
                key={s.id}
                value={s.type}
                className="mt-4 space-y-4"
              >
                <div className="flex justify-end">
                  <SessionWeatherBadge sessionId={s.id} />
                </div>
                {s.type === "Q" ? (
                  <>
                    <SessionWinnersCard type={s.type} rows={rows} />
                    <QualifyingResultsTable rows={rows} />
                  </>
                ) : s.type === "RACE" ? (
                  <>
                    <SessionWinnersCard type={s.type} rows={rows} />
                    <ResultsCard
                      label={SESSION_LABELS[s.type] ?? s.type}
                      type={s.type}
                      rows={rows}
                    />
                    <RaceLapChart sessionId={s.id} />
                    <PitStopsCard sessionId={s.id} />
                  </>
                ) : isPractice && rows.length <= 3 ? (
                  <PracticeFastestCard
                    label={SESSION_LABELS[s.type] ?? s.type}
                    rows={rows}
                  />
                ) : (
                  <ResultsCard
                    label={SESSION_LABELS[s.type] ?? s.type}
                    type={s.type}
                    rows={rows}
                  />
                )}
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Results not yet available</CardTitle>
            <CardDescription>
              {status === "upcoming"
                ? "Session times and results will appear here once the weekend begins."
                : "No timing data has been published for this event yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: EventStatus }) {
  if (status === "live") return <Badge variant="destructive">Live</Badge>;
  if (status === "completed") return <Badge variant="outline">Completed</Badge>;
  return <Badge variant="default">Upcoming</Badge>;
}

function SessionWinnersCard({
  type,
  rows,
}: {
  type: string;
  rows: SessionResult[];
}) {
  const isQuali = type === "Q";
  const isRace = type === "RACE";
  if (!isQuali && !isRace) return null;

  // Class winner of each class. For both Q and Race, use class_position
  // (computed by the backend per session) — Q stores `position` as the
  // overall grid number, so filtering on `position == 1` would only ever
  // match the Hypercar pole and miss the LMGT3 pole sitter.
  const topByClass = new Map<string, SessionResult>();
  for (const r of rows) {
    const cp = r.classPosition || r.position;
    if (cp !== 1) continue;
    if (!topByClass.has(r.raceClass)) {
      topByClass.set(r.raceClass, r);
    }
  }
  const winners = Array.from(topByClass.values());
  if (winners.length === 0) return null;

  const heading = isQuali ? "Pole positions" : "Race winners";
  const sub = isQuali
    ? "Pole sitters per class — best lap from Hyperpole."
    : "Class winners.";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{heading}</CardTitle>
        <p className="text-xs text-muted-foreground">{sub}</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-3 sm:grid-cols-2">
          {winners.map((r) => (
            <div
              key={`${r.raceClass}-${r.carNumber}`}
              className="rounded-lg border border-border bg-secondary/30 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <ClassBadge raceClass={r.raceClass} />
                <span className="font-mono text-xs text-muted-foreground tabular-nums">
                  #{r.carNumber}
                </span>
              </div>
              <TeamLink id={r.teamId} className="block font-semibold">
                {r.team}
              </TeamLink>
              {r.drivers && (
                <DriverList
                  refs={r.driverRefs}
                  text={r.drivers}
                  className="block text-sm text-muted-foreground"
                />
              )}
              {isQuali && (r.hyperpoleLap || r.qualifyingLap) && (
                <div className="mt-3 space-y-0.5">
                  <div className="font-mono text-2xl font-bold tabular-nums">
                    {r.hyperpoleLap ?? r.qualifyingLap}
                  </div>
                  {r.hyperpoleLap && r.qualifyingLap && (
                    <div className="text-xs text-muted-foreground">
                      <span className="font-mono tabular-nums">
                        Q {r.qualifyingLap}
                      </span>
                      {" → "}
                      <span className="font-mono tabular-nums">
                        Hyperpole {r.hyperpoleLap}
                      </span>
                    </div>
                  )}
                  {r.poleSectors && r.poleSectors.length === 3 && (
                    <div className="flex gap-3 pt-1 text-xs text-muted-foreground">
                      {r.poleSectors.map((s, i) => (
                        <span
                          key={`s${i + 1}`}
                          className="font-mono tabular-nums"
                        >
                          <span className="mr-1 text-[10px] uppercase tracking-wider">
                            S{i + 1}
                          </span>
                          {s}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
              {isRace && (
                <div className="mt-3 flex items-baseline gap-2">
                  {r.laps !== null && (
                    <span className="font-mono text-2xl font-bold tabular-nums">
                      {r.laps}
                    </span>
                  )}
                  {r.laps !== null && (
                    <span className="text-xs uppercase tracking-wider text-muted-foreground">
                      laps
                    </span>
                  )}
                  {r.gap && (
                    <span className="ml-auto font-mono text-xs text-muted-foreground tabular-nums">
                      {r.gap}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function PracticeFastestCard({
  label,
  rows,
}: {
  label: string;
  rows: SessionResult[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{label} · session fastest</CardTitle>
        <p className="text-xs text-muted-foreground">
          Wikipedia only publishes the fastest car per class for free
          practice. Full timesheets are on the WEC results portal.
        </p>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No fastest-lap data published.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {rows.map((r) => (
              <div
                key={`${r.raceClass}-${r.carNumber}`}
                className="rounded-lg border border-border bg-secondary/30 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <ClassBadge raceClass={r.raceClass} />
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    #{r.carNumber}
                  </span>
                </div>
                <TeamLink id={r.teamId} className="block font-semibold">
                  {r.team}
                </TeamLink>
                {r.drivers && (
                  <DriverList
                    refs={r.driverRefs}
                    text={r.drivers}
                    className="block text-sm text-muted-foreground"
                  />
                )}
                {r.bestLap && (
                  <div className="mt-3 font-mono text-2xl font-bold tabular-nums">
                    {r.bestLap}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ResultsCard({
  label,
  type,
  rows,
}: {
  label: string;
  type: string;
  rows: SessionResult[];
}) {
  const isPractice = type === "FP1" || type === "FP2" || type === "FP3";
  const isRace = type === "RACE";

  return (
    <Card>
      <CardHeader>
        <CardTitle>{label} results</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">Pos</TableHead>
              {isRace && (
                <TableHead
                  className="hidden w-14 sm:table-cell"
                  title="Position within class"
                >
                  Cls #
                </TableHead>
              )}
              <TableHead className="w-12">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="hidden md:table-cell">Drivers</TableHead>
              <TableHead className="w-16">Class</TableHead>
              {isPractice && (
                <>
                  <TableHead className="hidden w-24 text-right sm:table-cell">
                    Best lap
                  </TableHead>
                  <TableHead className="pr-4 w-20 text-right">Gap</TableHead>
                </>
              )}
              {isRace && (
                <>
                  <TableHead className="hidden w-14 text-right lg:table-cell">
                    Laps
                  </TableHead>
                  <TableHead className="hidden w-24 text-right lg:table-cell">
                    Best lap
                  </TableHead>
                  <TableHead className="hidden w-16 text-right xl:table-cell">
                    V-max
                  </TableHead>
                  <TableHead className="hidden w-12 text-right md:table-cell">
                    Pit
                  </TableHead>
                  <TableHead className="hidden w-12 text-right sm:table-cell">
                    Pts
                  </TableHead>
                  <TableHead className="pr-4 text-right">Gap</TableHead>
                </>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={`${row.position}-${row.carNumber}`}>
                <TableCell className="pl-4 font-mono tabular-nums">
                  {row.position}
                </TableCell>
                {isRace && (
                  <TableCell className="hidden font-mono tabular-nums sm:table-cell">
                    P{row.classPosition}
                  </TableCell>
                )}
                <TableCell className="font-mono tabular-nums">
                  {row.carNumber}
                </TableCell>
                <TableCell className="font-medium">
                  <TeamLink id={row.teamId}>{row.team}</TeamLink>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  <DriverList refs={row.driverRefs} text={row.drivers} />
                </TableCell>
                <TableCell>
                  <ClassBadge raceClass={row.raceClass} />
                </TableCell>
                {isPractice && (
                  <>
                    <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                      {row.bestLap ?? <Dash />}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums text-muted-foreground">
                      {row.gap ?? <Dash />}
                    </TableCell>
                  </>
                )}
                {isRace && (
                  <>
                    <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground lg:table-cell">
                      {row.laps ?? <Dash />}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground lg:table-cell">
                      {row.bestLap ?? <Dash />}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground xl:table-cell">
                      {row.topSpeedKph ? Math.round(row.topSpeedKph) : <Dash />}
                    </TableCell>
                    <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground md:table-cell">
                      {row.pitStops ?? <Dash />}
                    </TableCell>
                    <TableCell
                      className={
                        "hidden text-right font-mono tabular-nums sm:table-cell " +
                        (row.pointsAwarded > 0
                          ? "text-foreground"
                          : "text-muted-foreground")
                      }
                    >
                      {row.pointsAwarded > 0 ? row.pointsAwarded : <Dash />}
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums">
                      {row.position === 1 || !row.gap ? <Dash /> : row.gap}
                    </TableCell>
                  </>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
