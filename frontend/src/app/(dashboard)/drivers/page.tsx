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
import { ClassBadge } from "@/components/class-badge";
import { getDrivers } from "@/lib/api";

export const metadata = { title: "Drivers" };

export default async function DriversPage() {
  const drivers = await getDrivers();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
        <p className="text-muted-foreground">
          {drivers.length} entries shown · 2026 season
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Hypercar drivers</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">#</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="hidden md:table-cell">Team</TableHead>
                <TableHead className="hidden sm:table-cell">Nat.</TableHead>
                <TableHead className="pr-4">Class</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {drivers.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="pl-4 font-mono tabular-nums">
                    {d.carNumber}
                  </TableCell>
                  <TableCell className="font-medium">{d.name}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {d.team}
                  </TableCell>
                  <TableCell className="hidden font-mono text-muted-foreground sm:table-cell">
                    {d.nationality ?? "—"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <ClassBadge raceClass={d.raceClass} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
