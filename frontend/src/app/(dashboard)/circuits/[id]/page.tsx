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
import { TeamLink } from "@/components/entity-link";
import { Flag } from "@/components/flag";
import { getCircuit, type CircuitDetail } from "@/lib/api";
import { localCircuitLayout } from "@/lib/circuit-image";

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

  // Local SVG override (Wikimedia line art) wins because it's
  // styled to fit our dark theme; fall back to the FIA-published
  // PNG layout when no override is on disk.
  const layoutSvg = localCircuitLayout(circuit.country) ?? circuit.layoutImage;

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
        {layoutSvg && (
          <CardContent className="border-t border-border">
            {/* Wikimedia track maps are mostly black-line on white, so
                they vanish on our dark page bg. The classic dark-mode
                trick — invert + hue-rotate(180°) — turns the line
                white while preserving any sector colors that happen
                to be drawn (e.g. Fuji, Spa).

                Le Mans is the one portrait-aspect circuit (Mulsanne
                runs ~13 km south); rotating it shifted the labels
                sideways too, so instead we give it a taller container
                and let it sit at its natural orientation. */}
            <div
              className={
                "flex items-center justify-center bg-secondary/20 px-4 py-4 " +
                (circuit.country === "FRA"
                  ? "h-[36rem] sm:h-[44rem]"
                  : "h-[28rem] sm:h-[34rem]")
              }
            >
              {/* Static SVG served from /public — next/image would
                  needlessly route it through the optimizer. The raw
                  <img> tag is intentional. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={layoutSvg}
                alt={`${circuit.name} layout`}
                className="h-full w-full object-contain"
                style={{
                  filter: "invert(1) hue-rotate(180deg)",
                }}
                loading="lazy"
              />
            </div>
          </CardContent>
        )}
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
                Times hosted WEC
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
                        #{w.carNumber}{" "}
                        <TeamLink id={w.teamId}>{w.team}</TeamLink>
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
