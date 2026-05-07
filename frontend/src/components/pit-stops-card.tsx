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
import { TeamLink } from "@/components/entity-link";
import { getPitStops, type PitStop } from "@/lib/api";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds - m * 60;
  return `${m}m ${s.toFixed(1)}s`;
}

/** A normal WEC stop is 1m 10s – 1m 35s (refuel + tire + driver
 *  change). Anything past ~3 minutes almost always means a repair or
 *  FCY hold; tint those rows so they don't read like a normal stop. */
function durationTone(ms: number | null): string {
  if (ms == null) return "text-muted-foreground";
  const seconds = ms / 1000;
  if (seconds > 600) return "text-[var(--racing-red)]";
  if (seconds > 180) return "text-[var(--racing-yellow)]";
  return "";
}

export async function PitStopsCard({ sessionId }: { sessionId: number }) {
  let stops: PitStop[] = [];
  try {
    stops = await getPitStops(sessionId);
  } catch {
    return null;
  }
  if (stops.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pit stops</CardTitle>
        <CardDescription>
          {stops.length} stops, sorted chronologically by lap. A normal
          WEC stop is 1m 10s – 1m 35s; longer rows are typically repairs
          or red-flag holds.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">Lap</TableHead>
              <TableHead className="w-12">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Class</TableHead>
              <TableHead className="pr-4 text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stops.map((s, i) => (
              <TableRow key={`${s.lap}-${s.carNumber}-${i}`}>
                <TableCell className="pl-4 font-mono tabular-nums">
                  {s.lap}
                </TableCell>
                <TableCell className="font-mono tabular-nums">
                  {s.carNumber}
                </TableCell>
                <TableCell className="truncate">
                  <TeamLink id={s.teamId}>{s.team}</TeamLink>
                </TableCell>
                <TableCell>
                  <ClassBadge raceClass={s.raceClass} />
                </TableCell>
                <TableCell
                  className={
                    "pr-4 text-right font-mono tabular-nums " +
                    durationTone(s.durationMs)
                  }
                >
                  {formatDuration(s.durationMs)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
