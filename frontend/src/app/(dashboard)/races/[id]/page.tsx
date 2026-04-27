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
import { ClassBadge } from "@/components/class-badge";
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
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
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

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
            Round {event.round} · 2026
            <StatusBadge status={status} />
          </div>
          <CardTitle className="text-2xl sm:text-3xl">{event.name}</CardTitle>
          <CardDescription>
            {event.circuit.name} · {event.circuit.country} ·{" "}
            {event.format ?? "—"}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {format(parseISO(event.dateStart), "EEEE, MMMM d, yyyy")}
          {event.dateEnd !== event.dateStart &&
            ` – ${format(parseISO(event.dateEnd), "MMMM d, yyyy")}`}
        </CardContent>
      </Card>

      {sessionsWithResults.length > 0 ? (
        <Tabs
          defaultValue={sessionsWithResults[sessionsWithResults.length - 1].type}
        >
          <TabsList>
            {sessionsWithResults.map((s) => (
              <TabsTrigger key={s.id} value={s.type}>
                {SESSION_LABELS[s.type] ?? s.type}
              </TabsTrigger>
            ))}
          </TabsList>

          {sessionsWithResults.map((s) => {
            const rows = resultMap.get(s.id) ?? [];
            return (
              <TabsContent key={s.id} value={s.type} className="mt-4">
                <ResultsCard
                  label={SESSION_LABELS[s.type] ?? s.type}
                  rows={rows}
                />
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

function ResultsCard({
  label,
  rows,
}: {
  label: string;
  rows: SessionResult[];
}) {
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
              <TableHead className="w-12">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="hidden md:table-cell">Drivers</TableHead>
              <TableHead className="w-16">Class</TableHead>
              <TableHead className="hidden w-16 sm:table-cell">Laps</TableHead>
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
                <TableCell className="hidden font-mono tabular-nums sm:table-cell">
                  {row.laps ?? "—"}
                </TableCell>
                <TableCell className="pr-4 text-right font-mono tabular-nums">
                  {row.gap ?? "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
