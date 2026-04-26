import { format, parseISO } from "date-fns";
import {
  Card,
  CardContent,
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
import { CURRENT_SEASON, EVENTS, getCircuit } from "@/lib/mock-data";

export const metadata = { title: "Schedule" };

const STATUS_VARIANT: Record<
  "completed" | "upcoming" | "live",
  "outline" | "default" | "destructive"
> = {
  completed: "outline",
  upcoming: "default",
  live: "destructive",
};

export default function RacesPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <p className="text-muted-foreground">
          {CURRENT_SEASON} season · {EVENTS.length} rounds
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>All rounds</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 pl-4">Rd</TableHead>
                <TableHead>Event</TableHead>
                <TableHead className="hidden md:table-cell">Circuit</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="hidden sm:table-cell">Format</TableHead>
                <TableHead className="pr-4 text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {EVENTS.map((e) => {
                const circuit = getCircuit(e.circuitId);
                return (
                  <TableRow key={e.id}>
                    <TableCell className="pl-4 font-mono tabular-nums">
                      {e.round}
                    </TableCell>
                    <TableCell className="font-medium">{e.name}</TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      {circuit ? `${circuit.name} · ${circuit.country}` : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(parseISO(e.startDate), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {e.format}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Badge
                        variant={STATUS_VARIANT[e.status]}
                        className="capitalize"
                      >
                        {e.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
