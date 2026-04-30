import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Flag } from "@/components/flag";
import { PageHeader } from "@/components/page-header";
import { getCircuits } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Circuits" };

export default async function CircuitsPage() {
  const year = await getSelectedSeason();
  const circuits = await getCircuits(year);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Calendar"
        title="Circuits"
        description={`${circuits.length} circuits on the calendar`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {circuits.map((c) => (
          <Link
            key={c.id}
            href={`/circuits/${c.id}`}
            className="block transition-colors hover:[&_[data-slot=card]]:ring-foreground/30"
          >
            <Card>
              <CardHeader>
                <CardTitle>{c.name}</CardTitle>
                <CardDescription>
                  <Flag code={c.country} />
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {c.lengthKm > 0 && (
                    <>
                      <dt className="text-muted-foreground">Length</dt>
                      <dd className="text-right font-mono tabular-nums">
                        {c.lengthKm.toFixed(3)} km
                      </dd>
                    </>
                  )}
                  {c.lapRecord && (
                    <>
                      <dt className="text-muted-foreground">Lap record</dt>
                      <dd className="text-right font-mono tabular-nums">
                        {c.lapRecord}
                      </dd>
                    </>
                  )}
                </dl>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
