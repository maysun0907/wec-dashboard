import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getCircuits } from "@/lib/api";

export const metadata = { title: "Circuits" };

export default async function CircuitsPage() {
  const circuits = await getCircuits();

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Circuits</h1>
        <p className="text-muted-foreground">
          {circuits.length} circuits · 2026 calendar
        </p>
      </header>

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
                  {c.country !== "UNK" ? c.country : "—"}
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
