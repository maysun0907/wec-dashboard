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
  /** Tailwind h-* — taller for P1 */
  bar: string;
  /** color for the trophy/medal accent */
  accent: string;
  label: string;
};

const STEPS: Record<1 | 2 | 3, StepStyle> = {
  1: { bar: "h-24", accent: "text-yellow-400", label: "Winner" },
  2: { bar: "h-20", accent: "text-gray-300", label: "2nd" },
  3: { bar: "h-16", accent: "text-amber-700", label: "3rd" },
};

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
  // Visual layout uses index — slot 1 (left, silver), slot 0 (center,
  // gold), slot 2 (right, bronze). Keying by `position` would collapse
  // the entire Toyota trio onto a single P1 slot whenever a car's three
  // drivers share the championship lead.
  const SLOT_ORDER: Array<{ index: number; step: 1 | 2 | 3 }> = [
    { index: 1, step: 2 },
    { index: 0, step: 1 },
    { index: 2, step: 3 },
  ];
  const visible = SLOT_ORDER.filter((s) => rows[s.index] !== undefined);

  if (visible.length === 0) return null;

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
        <div className="grid grid-cols-3 gap-3 sm:gap-6">
          {visible.map(({ index, step: stepNum }) => {
            const r = rows[index]!;
            const step = STEPS[stepNum];
            return (
              <div
                key={r.id}
                className="flex flex-col items-center text-center"
              >
                <div
                  className={
                    "relative " +
                    (stepNum === 1 ? "size-24 sm:size-28" : "size-20 sm:size-24")
                  }
                >
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
                    "mt-2 flex w-full flex-col items-center justify-end rounded-t bg-secondary/40 " +
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
