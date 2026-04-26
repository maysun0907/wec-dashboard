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
  CURRENT_SEASON,
  EVENTS,
  SESSION_LABELS,
  SESSION_RESULTS,
  getAvailableSessions,
  getCircuit,
  getEventById,
  type SessionResultRow,
} from "@/lib/mock-data";

type Params = { id: string };

export async function generateStaticParams(): Promise<Params[]> {
  return EVENTS.map((e) => ({ id: e.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const event = getEventById(id);
  return { title: event?.name ?? "Race" };
}

export default async function RaceDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const event = getEventById(id);
  if (!event) notFound();

  const circuit = getCircuit(event.circuitId);
  const sessions = getAvailableSessions(id);
  const sessionData = SESSION_RESULTS[id];

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
            Round {event.round} · {CURRENT_SEASON}
            <StatusBadge status={event.status} />
          </div>
          <CardTitle className="text-2xl sm:text-3xl">{event.name}</CardTitle>
          <CardDescription>
            {circuit ? `${circuit.name} · ${circuit.country}` : "—"} ·{" "}
            {event.format}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {format(parseISO(event.startDate), "EEEE, MMMM d, yyyy")}
          {event.endDate !== event.startDate &&
            ` – ${format(parseISO(event.endDate), "MMMM d, yyyy")}`}
        </CardContent>
      </Card>

      {sessions.length > 0 ? (
        <Tabs defaultValue={sessions[sessions.length - 1]}>
          <TabsList>
            {sessions.map((s) => (
              <TabsTrigger key={s} value={s}>
                {SESSION_LABELS[s]}
              </TabsTrigger>
            ))}
          </TabsList>

          {sessions.map((s) => {
            const rows = sessionData?.[s] ?? [];
            return (
              <TabsContent key={s} value={s} className="mt-4">
                <ResultsCard label={SESSION_LABELS[s]} rows={rows} />
              </TabsContent>
            );
          })}
        </Tabs>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Results not yet available</CardTitle>
            <CardDescription>
              {event.status === "upcoming"
                ? "Session times and results will appear here once the weekend begins."
                : "No timing data has been published for this event yet."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}

function StatusBadge({
  status,
}: {
  status: "completed" | "upcoming" | "live";
}) {
  if (status === "live") return <Badge variant="destructive">Live</Badge>;
  if (status === "completed") return <Badge variant="outline">Completed</Badge>;
  return <Badge variant="default">Upcoming</Badge>;
}

function ResultsCard({
  label,
  rows,
}: {
  label: string;
  rows: SessionResultRow[];
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
                  {row.laps}
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
