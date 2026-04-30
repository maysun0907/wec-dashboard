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
import { getPitStops, type PitStop } from "@/lib/api";

function formatDuration(ms: number | null): string {
  if (ms == null) return "—";
  const total = ms / 1000;
  const m = Math.floor(total / 60);
  const s = total - m * 60;
  return m > 0 ? `${m}:${s.toFixed(1).padStart(4, "0")}` : `${s.toFixed(1)}s`;
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
          {stops.length} stops, sorted chronologically by lap
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
                <TableCell className="truncate">{s.team}</TableCell>
                <TableCell>
                  <ClassBadge raceClass={s.raceClass} />
                </TableCell>
                <TableCell className="pr-4 text-right font-mono tabular-nums">
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
