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
import { PageHeader } from "@/components/page-header";
import { getBop, type BopEvent, type BopRow } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "BoP" };

export default async function BopPage() {
  const year = await getSelectedSeason();
  const events: BopEvent[] = await getBop(year).catch(() => []);

  if (events.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow="Balance of Performance"
          title="BoP"
          description="Per-round Hypercar adjustments — and why this page is empty for 2026"
        />

        <Card>
          <CardHeader>
            <CardTitle>The 2026 BoP table is private</CardTitle>
            <CardDescription className="space-y-2 text-sm">
              <p>
                Starting with the 2026 season, the FIA and ACO stopped
                publishing Hypercar Balance of Performance figures.
                Per-round weight, power, and energy adjustments are now
                shared{" "}
                <span className="font-medium text-foreground">
                  only with the competing teams
                </span>{" "}
                — there is no public source for the actual numbers.
              </p>
              <p>
                The reasoning, per the FIA: outsiders can&rsquo;t see each
                car&rsquo;s homologation parameters, so publishing the BoP
                figures alone leads to misinterpretation. The dashboard
                will surface the table again if the policy reverses.
              </p>
              <p>
                Background:{" "}
                <a
                  href="https://www.motorsport.com/wec/news/wec-will-stop-publishing-bop-data-2026/10813085/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-2 hover:text-[var(--racing-red)] hover:underline"
                >
                  Motorsport.com
                </a>{" "}
                ·{" "}
                <a
                  href="https://sportscar365.com/lemans/wec/fia-confirms-minor-change-to-hypercar-bop-process-from-spa/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground underline-offset-2 hover:text-[var(--racing-red)] hover:underline"
                >
                  Sportscar365
                </a>
              </p>
            </CardDescription>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>What is public</CardTitle>
            <CardDescription>
              Class-wide regulation maxima from the homologation
              framework. Every Hypercar entry is built and homologated to
              fit inside this envelope; per-round adjustments slide
              individual cars within it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
              <Spec
                label="Min weight"
                value="1030 kg"
                detail="Hypercar floor"
              />
              <Spec
                label="Max combined power"
                value="500 kW"
                detail="≈ 670 hp"
              />
              <Spec
                label="Hybrid threshold"
                value="190 km/h"
                detail="Front ERS deploys above this"
              />
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2026 success handicap</CardTitle>
            <CardDescription>
              New for 2026: a results-based mass penalty for top
              championship runners (LMGT3-style), applied at every round
              <span className="font-medium text-foreground">
                {" "}except the 24 Hours of Le Mans
              </span>
              . The handicap is folded into the same private BoP table —
              you can sometimes infer it from grid weight differences
              when teams discuss it publicly.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Balance of Performance"
        title="BoP"
        description={`${events.length} ${events.length === 1 ? "round" : "rounds"} · per-event adjustments published by the FIA`}
      />

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

function Spec({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-lg font-semibold tabular-nums">{value}</dd>
      {detail && (
        <span className="mt-0.5 text-xs text-muted-foreground">{detail}</span>
      )}
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
