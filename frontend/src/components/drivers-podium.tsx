import Link from "next/link";
import { Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { DriverPhoto } from "@/components/driver-photo";
import { type StandingDriver } from "@/lib/api";

type StepStyle = {
  /** Tailwind h-* — taller for P1, shorter for P2/P3 */
  bar: string;
  /** Trophy / accent color */
  accent: string;
  /** Inline gradient applied to the points-bar background */
  barGradient: string;
  /** Border tint for the photo halo */
  ring: string;
};

// Style is keyed by the driver's actual championship position. Three
// drivers tied at P1 (a single car's trio) all get gold + the tallest
// step, instead of being incorrectly painted gold/silver/bronze by the
// display slot.
const STEPS: Record<number, StepStyle> = {
  1: {
    bar: "py-3",
    accent: "text-yellow-400",
    barGradient:
      "linear-gradient(180deg, rgba(250,204,21,0.20) 0%, rgba(250,204,21,0.04) 100%)",
    ring: "ring-yellow-400/60",
  },
  2: {
    bar: "py-3",
    accent: "text-gray-300",
    barGradient:
      "linear-gradient(180deg, rgba(229,231,235,0.16) 0%, rgba(229,231,235,0.03) 100%)",
    ring: "ring-gray-300/50",
  },
  3: {
    bar: "py-3",
    accent: "text-amber-600",
    barGradient:
      "linear-gradient(180deg, rgba(217,119,6,0.20) 0%, rgba(217,119,6,0.03) 100%)",
    ring: "ring-amber-600/50",
  },
};

function stepFor(position: number): StepStyle {
  return STEPS[position] ?? STEPS[3]!;
}

type Driver = {
  id: number;
  position: number;
  name: string;
  team: string | null;
  points: number;
  photoUrl: string | null;
};

type ClassPodium = {
  label: string;
  rows: Driver[];
};

export function DriversPodium({
  classes,
  rounds,
}: {
  /** One entry per class (Hypercar, LMGT3, …) — renders stacked in
   *  the same card. Empty `rows` arrays are skipped. */
  classes: ClassPodium[];
  rounds: number;
}) {
  const visible = classes.filter((c) => c.rows.length > 0);
  if (visible.length === 0) return null;

  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Drivers · Top 3</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            After R{rounds}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {visible.map((cls) => (
          <div key={cls.label} className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {cls.label}
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </div>
            <PodiumRow rows={cls.rows} />
          </div>
        ))}
      </CardContent>
      <div className="mt-auto px-4 pb-3 text-right text-xs">
        <Link
          href="/standings"
          className="text-muted-foreground hover:text-foreground"
        >
          Full standings →
        </Link>
      </div>
    </Card>
  );
}

function PodiumRow({ rows }: { rows: Driver[] }) {
  return (
    <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
      {rows.map((r) => {
        const step = stepFor(r.position);
        return (
          <div key={r.id} className="flex flex-col items-center text-center">
            <div
              className={
                "relative size-16 rounded-full ring-2 ring-offset-2 ring-offset-card transition-transform hover:scale-105 sm:size-20 " +
                step.ring
              }
            >
              <Link href={`/drivers/${r.id}`}>
                <DriverPhoto
                  src={r.photoUrl}
                  name={r.name}
                  size="xl"
                  className="size-full"
                />
              </Link>
              <Trophy
                className={
                  "absolute -top-2 -right-1 size-6 drop-shadow-lg " +
                  step.accent
                }
                fill="currentColor"
              />
            </div>
            <Link
              href={`/drivers/${r.id}`}
              className="mt-2 block w-full truncate text-sm font-medium hover:text-[var(--racing-red)]"
              title={r.name}
            >
              {r.name}
            </Link>
            {r.team && (
              <span className="block w-full truncate text-[11px] text-muted-foreground">
                {r.team}
              </span>
            )}
            <div
              className={
                "mt-2 flex w-full flex-col items-center rounded-md border border-border/60 px-2 " +
                step.bar
              }
              style={{ background: step.barGradient }}
            >
              <span className="font-heading text-3xl font-extrabold leading-none tabular-nums sm:text-4xl">
                {r.points}
              </span>
              <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                pts · P{r.position}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function buildPodiumRows(
  standings: StandingDriver[],
  photoById: Map<number, string | null>,
): Driver[] {
  return standings.slice(0, 3).map((s) => ({
    id: s.driverId,
    position: s.position,
    name: s.driverName,
    team: s.team,
    points: s.points,
    photoUrl: photoById.get(s.driverId) ?? null,
  }));
}
