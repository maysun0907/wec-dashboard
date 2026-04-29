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
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { getBop, type BopEvent, type BopRow } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "BoP" };

export default async function BopPage() {
  const year = await getSelectedSeason();
  const events: BopEvent[] = await getBop(year).catch(() => []);

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">
            Balance of Performance
          </h1>
          <p className="text-muted-foreground">
            FIA-published per-round adjustments for the Hypercar field
          </p>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>No BoP data yet</CardTitle>
            <CardDescription>
              The FIA publishes Hypercar BoP a few days before each round.
              Curate values into <code>backend/app/data/bop.py</code> and
              redeploy — entries auto-apply via the curator.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">
          Balance of Performance
        </h1>
        <p className="text-muted-foreground">
          {events.length} {events.length === 1 ? "round" : "rounds"} ·{" "}
          per-event adjustments published by the FIA
        </p>
      </header>

      <Tabs defaultValue={String(events[0].eventId)}>
        <TabsList>
          {events.map((e) => (
            <TabsTrigger key={e.eventId} value={String(e.eventId)}>
              R{e.round}
            </TabsTrigger>
          ))}
        </TabsList>
        {events.map((e) => (
          <TabsContent key={e.eventId} value={String(e.eventId)} className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>{e.eventName}</CardTitle>
                <CardDescription>Round {e.round}</CardDescription>
              </CardHeader>
              <CardContent className="px-0">
                <BopTable rows={e.rows} />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

function BopTable({ rows }: { rows: BopRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">
        No BoP entries for this round.
      </p>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Car</TableHead>
          <TableHead className="text-right">Weight</TableHead>
          <TableHead className="text-right">Power</TableHead>
          <TableHead className="text-right">Stint energy</TableHead>
          <TableHead className="pr-4 text-right">Handicap</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={r.carModelId}>
            <TableCell className="pl-4">
              <span className="inline-flex items-center gap-2">
                <ManufacturerLogo
                  src={r.manufacturerLogoUrl}
                  name={r.carModelName}
                />
                {r.carModelName}
              </span>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {r.minWeightKg !== null ? `${r.minWeightKg} kg` : "—"}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {r.maxPowerKw !== null ? `${r.maxPowerKw} kW` : "—"}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {r.maxEnergyPerStintMj !== null
                ? `${r.maxEnergyPerStintMj} MJ`
                : "—"}
            </TableCell>
            <TableCell className="pr-4 text-right font-mono tabular-nums">
              {r.successHandicapKg !== null
                ? `+${r.successHandicapKg} kg`
                : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
