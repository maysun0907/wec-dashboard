import Link from "next/link";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassBadge } from "@/components/class-badge";
import { DriverPhoto } from "@/components/driver-photo";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import {
  RACE_CLASSES,
  getDrivers,
  type DriverEntry,
  type RaceClass,
} from "@/lib/api";

export const metadata = { title: "Drivers" };

function groupByClass(drivers: DriverEntry[]): Record<RaceClass, DriverEntry[]> {
  const out: Record<RaceClass, DriverEntry[]> = {
    HYPERCAR: [],
    LMP2: [],
    LMGT3: [],
  };
  for (const d of drivers) out[d.raceClass].push(d);
  return out;
}

export default async function DriversPage() {
  const drivers = await getDrivers();
  const byClass = groupByClass(drivers);

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Drivers</h1>
        <p className="text-muted-foreground">
          {drivers.length} entries · 2026 season
        </p>
      </header>

      <Tabs defaultValue="HYPERCAR">
        <TabsList>
          {RACE_CLASSES.map((c) => (
            <TabsTrigger key={c} value={c}>
              {c} · {byClass[c].length}
            </TabsTrigger>
          ))}
        </TabsList>
        {RACE_CLASSES.map((c) => (
          <TabsContent key={c} value={c} className="mt-4">
            <DriversTable drivers={byClass[c]} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function DriversTable({ drivers }: { drivers: DriverEntry[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entries</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {drivers.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            No drivers in this class yet.
          </p>
        ) : (
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
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      <DriverPhoto src={d.photoUrl} name={d.name} size="md" />
                      <Link
                        href={`/drivers/${d.id}`}
                        className="hover:text-[var(--racing-red)]"
                      >
                        {d.name}
                      </Link>
                    </span>
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    <span className="inline-flex items-center gap-2">
                      <ManufacturerLogo
                        src={d.manufacturerLogoUrl}
                        name={d.team}
                      />
                      {d.team}
                    </span>
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
        )}
      </CardContent>
    </Card>
  );
}
