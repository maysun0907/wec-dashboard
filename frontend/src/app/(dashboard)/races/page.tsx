import Link from "next/link";
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
import { eventStatus, getEvents, type EventStatus } from "@/lib/api";

export const metadata = { title: "Schedule" };

const STATUS_VARIANT: Record<
  EventStatus,
  "outline" | "default" | "destructive"
> = {
  completed: "outline",
  upcoming: "default",
  live: "destructive",
};

export default async function RacesPage() {
  const events = await getEvents();
  const today = new Date();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Schedule</h1>
        <p className="text-muted-foreground">
          2026 season · {events.length} rounds
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
              {events.map((e) => {
                const status = eventStatus(e, today);
                return (
                  <TableRow key={e.id} className="cursor-pointer">
                    <TableCell className="pl-4 font-mono tabular-nums">
                      {e.round}
                    </TableCell>
                    <TableCell className="font-medium">
                      <Link
                        href={`/races/${e.id}`}
                        className="hover:text-[var(--racing-red)]"
                      >
                        {e.name}
                      </Link>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      <Link
                        href={`/circuits/${e.circuit.id}`}
                        className="hover:text-foreground"
                      >
                        {e.circuit.name}
                      </Link>{" "}
                      · {e.circuit.country !== "UNK" ? e.circuit.country : "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(parseISO(e.dateStart), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {e.format ?? "—"}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Badge
                        variant={STATUS_VARIANT[status]}
                        className="capitalize"
                      >
                        {status}
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
