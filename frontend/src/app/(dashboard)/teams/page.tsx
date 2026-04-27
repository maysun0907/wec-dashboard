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
import { getTeams } from "@/lib/api";

export const metadata = { title: "Teams" };

export default async function TeamsPage() {
  const teams = await getTeams();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Teams</h1>
        <p className="text-muted-foreground">
          {teams.length} entries shown · 2026 season
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Entries</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">#</TableHead>
                <TableHead>Team</TableHead>
                <TableHead>Manufacturer</TableHead>
                <TableHead className="pr-4">Class</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((t) => (
                <TableRow key={`${t.id}-${t.carNumber}`}>
                  <TableCell className="pl-4 font-mono tabular-nums">
                    {t.carNumber}
                  </TableCell>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.manufacturer ?? "—"}
                  </TableCell>
                  <TableCell className="pr-4">
                    <ClassBadge raceClass={t.raceClass} />
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
