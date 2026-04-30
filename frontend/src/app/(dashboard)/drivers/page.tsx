import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DriversTableFilter } from "@/components/drivers-table-filter";
import { PageHeader } from "@/components/page-header";
import {
  RACE_CLASSES,
  getDrivers,
  raceClassLabel,
  type DriverEntry,
  type RaceClass,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Drivers" };

function groupByClass(
  drivers: DriverEntry[],
): Record<RaceClass, DriverEntry[]> {
  const out: Record<RaceClass, DriverEntry[]> = {
    HYPERCAR: [],
    LMP1: [],
    LMP2: [],
    LMGT3: [],
    LMGTE_PRO: [],
    LMGTE_AM: [],
  };
  for (const d of drivers) {
    if (out[d.raceClass]) out[d.raceClass].push(d);
  }
  return out;
}

export default async function DriversPage() {
  const year = await getSelectedSeason();
  const drivers = await getDrivers(year);
  const byClass = groupByClass(drivers);
  const presentClasses = RACE_CLASSES.filter((c) => byClass[c].length > 0);
  const defaultTab = presentClasses[0] ?? "HYPERCAR";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageHeader
          eyebrow={`${year ?? 2026} Roster`}
          title="Drivers"
          description={`${drivers.length} entries`}
        />
        <Link
          href="/drivers/compare"
          className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          Compare →
        </Link>
      </div>

      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {presentClasses.map((c) => (
            <TabsTrigger key={c} value={c}>
              {raceClassLabel(c)} · {byClass[c].length}
            </TabsTrigger>
          ))}
        </TabsList>
        {presentClasses.map((c) => (
          <TabsContent key={c} value={c} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>Entries</CardTitle>
              </CardHeader>
              <CardContent className="px-0">
                <DriversTableFilter drivers={byClass[c]} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
