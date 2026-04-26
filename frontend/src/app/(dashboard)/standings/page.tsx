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
import {
  DRIVER_STANDINGS,
  MANUFACTURER_STANDINGS,
  TEAM_STANDINGS,
  type StandingRow,
} from "@/lib/mock-data";

export const metadata = { title: "Standings" };

export default function StandingsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Standings</h1>
        <p className="text-muted-foreground">Hypercar championship · 2026</p>
      </header>

      <div className="grid gap-6 xl:grid-cols-3">
        <StandingsTable title="Drivers" rows={DRIVER_STANDINGS} />
        <StandingsTable title="Teams" rows={TEAM_STANDINGS} />
        <StandingsTable title="Manufacturers" rows={MANUFACTURER_STANDINGS} />
      </div>
    </div>
  );
}

function StandingsTable({
  title,
  rows,
}: {
  title: string;
  rows: StandingRow[];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">Pos</TableHead>
              <TableHead>Name</TableHead>
              <TableHead className="pr-4 text-right">Pts</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.entityId}>
                <TableCell className="pl-4 font-mono tabular-nums">
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
                <TableCell className="pr-4 text-right font-mono tabular-nums">
                  {row.points}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
