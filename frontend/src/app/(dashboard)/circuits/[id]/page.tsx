import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassBadge } from "@/components/class-badge";
import { Flag } from "@/components/flag";
import { getCircuit, type CircuitDetail } from "@/lib/api";

type Params = { id: string };

async function fetchCircuit(id: string): Promise<CircuitDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getCircuit(numId);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const c = await fetchCircuit(id);
  return { title: c?.name ?? "Circuit" };
}

export default async function CircuitDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const circuit = await fetchCircuit(id);
  if (circuit === null) notFound();

  return (
    <div className="space-y-6">
      <Link
        href="/circuits"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Circuits
      </Link>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl">
            <Flag code={circuit.country} flagOnly className="text-2xl" />
            {circuit.name}
          </CardTitle>
          <CardDescription>
            <Flag code={circuit.country} />
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {circuit.lengthKm > 0 && (
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Length
                </dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">
                  {circuit.lengthKm.toFixed(3)} km
                </dd>
              </div>
            )}
            {circuit.lapRecord && (
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  Lap record
                </dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">
                  {circuit.lapRecord}
                </dd>
              </div>
            )}
            <div className="flex flex-col">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                WEC events
              </dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">
                {circuit.events.length}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>WEC race history</CardTitle>
          <CardDescription>
            {circuit.events.length === 0
              ? "No WEC events recorded at this circuit yet."
              : "Sorted by season, most recent first."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {circuit.events.map((e) => (
            <div
              key={e.eventId}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4 last:border-0 last:pb-0"
            >
              <div className="space-y-1">
                <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {e.seasonYear} · R{e.round}
                  </span>
                  <span>·</span>
                  <span>{format(parseISO(e.dateStart), "MMM d, yyyy")}</span>
                </div>
                <Link
                  href={`/races/${e.eventId}`}
                  className="font-medium hover:text-[var(--racing-red)]"
                >
                  {e.name}
                </Link>
              </div>
              {e.winners.length > 0 && (
                <div className="space-y-1 text-right text-sm">
                  {e.winners.map((w) => (
                    <div
                      key={w.raceClass}
                      className="flex items-center justify-end gap-2"
                    >
                      <span className="text-muted-foreground">
                        #{w.carNumber} {w.team}
                      </span>
                      <ClassBadge raceClass={w.raceClass} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
