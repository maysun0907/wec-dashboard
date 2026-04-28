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
};

// Style is keyed by the driver's actual championship position. Three
// drivers tied at P1 (a single car's trio) all get gold + the tallest
// step, instead of being incorrectly painted gold/silver/bronze by the
// display slot.
const STEPS: Record<number, StepStyle> = {
  1: { bar: "h-24", accent: "text-yellow-400" },
  2: { bar: "h-20", accent: "text-gray-300" },
  3: { bar: "h-16", accent: "text-amber-700" },
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

export function DriversPodium({
  rows,
  rounds,
}: {
  rows: Driver[];
  rounds: number;
}) {
  if (rows.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Drivers · Top 3</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            After R{rounds}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 items-end gap-3 sm:gap-6">
          {rows.map((r) => {
            const step = stepFor(r.position);
            return (
              <div
                key={r.id}
                className="flex h-full flex-col items-center text-center"
              >
                <div className="relative size-20 sm:size-24">
                  <Link href={`/drivers/${r.id}`}>
                    <DriverPhoto
                      src={r.photoUrl}
                      name={r.name}
                      size="xl"
                      className="size-full transition-transform hover:scale-105"
                    />
                  </Link>
                  <Trophy
                    className={
                      "absolute -top-1 -right-1 size-6 drop-shadow " +
                      step.accent
                    }
                    fill="currentColor"
                  />
                </div>
                <Link
                  href={`/drivers/${r.id}`}
                  className="mt-2 block truncate font-medium hover:text-[var(--racing-red)]"
                  title={r.name}
                >
                  {r.name}
                </Link>
                {r.team && (
                  <span className="block truncate text-xs text-muted-foreground">
                    {r.team}
                  </span>
                )}
                <div
                  className={
                    "mt-auto flex w-full flex-col items-center justify-end rounded-t bg-secondary/40 " +
                    step.bar
                  }
                >
                  <span className="font-mono text-2xl font-bold tabular-nums">
                    {r.points}
                  </span>
                  <span className="mb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    pts · P{r.position}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
      <div className="px-4 pb-3 text-right text-xs">
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
