"use client";

import { useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
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
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ClassBadge } from "@/components/class-badge";
import {
  RACE_CLASSES,
  type DriverEntry,
  type Event,
  type RaceClass,
  type StandingDriver,
} from "@/lib/api";

// WEC scoring per FIA: standard 6h races vs longer endurance rounds.
const POINTS_LONG = [38, 27, 23, 18, 15, 12, 9, 6, 3, 2];
const POINTS_STANDARD = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function pointsFor(eventName: string): number[] {
  if (/24 Hours|1812 km|8 Hours/i.test(eventName)) return POINTS_LONG;
  return POINTS_STANDARD;
}

function isUpcoming(event: Event, today: Date): boolean {
  return event.dateEnd >= today.toISOString().slice(0, 10);
}

type ClassPicks = Record<number, string>; // eventId -> carNumber

type Picks = Record<RaceClass, ClassPicks>;

const EMPTY_CLASS_PICKS: ClassPicks = {};

const EMPTY_PICKS: Picks = {
  HYPERCAR: EMPTY_CLASS_PICKS,
  LMP2: EMPTY_CLASS_PICKS,
  LMGT3: EMPTY_CLASS_PICKS,
};

type Simulated = {
  driverId: number;
  driverName: string;
  position: number;
  current: number;
  simulated: number;
  delta: number;
  positionDelta: number; // negative = moved up the table
};

function simulate(
  current: StandingDriver[],
  picks: ClassPicks,
  drivers: DriverEntry[],
  events: Event[],
  raceClass: RaceClass,
): Simulated[] {
  // Build base point map from current standings.
  const points = new Map<number, number>();
  for (const s of current) points.set(s.driverId, s.points);

  // Include drivers not yet on the standings (zero points so far).
  for (const d of drivers) {
    if (d.raceClass === raceClass && !points.has(d.id)) {
      points.set(d.id, 0);
    }
  }

  // Apply each pick: winner of that round gets P1 points; we award the
  // points to every listed driver of the winning car.
  const simulatedAdds = new Map<number, number>();
  for (const [eventIdRaw, carNumber] of Object.entries(picks)) {
    if (!carNumber) continue;
    const eventId = Number(eventIdRaw);
    const event = events.find((e) => e.id === eventId);
    if (!event) continue;
    const winnerPts = pointsFor(event.name)[0];
    const winningDrivers = drivers.filter(
      (d) => d.carNumber === carNumber && d.raceClass === raceClass,
    );
    for (const d of winningDrivers) {
      simulatedAdds.set(d.id, (simulatedAdds.get(d.id) ?? 0) + winnerPts);
    }
  }

  // Current position lookup so we can show movement.
  const currentPositionByDriver = new Map<number, number>();
  for (const s of current) currentPositionByDriver.set(s.driverId, s.position);

  const driverNameById = new Map<number, string>();
  for (const s of current) driverNameById.set(s.driverId, s.driverName);
  for (const d of drivers) {
    if (!driverNameById.has(d.id)) driverNameById.set(d.id, d.name);
  }

  const rows = Array.from(points.entries()).map(([driverId, base]) => {
    const add = simulatedAdds.get(driverId) ?? 0;
    return {
      driverId,
      driverName: driverNameById.get(driverId) ?? "?",
      current: base,
      simulated: base + add,
    };
  });

  rows.sort(
    (a, b) =>
      b.simulated - a.simulated || a.driverName.localeCompare(b.driverName),
  );

  return rows.map((r, i) => {
    const newPos = i + 1;
    const oldPos = currentPositionByDriver.get(r.driverId);
    const positionDelta = oldPos !== undefined ? newPos - oldPos : 0;
    return {
      ...r,
      position: newPos,
      delta: r.simulated - r.current,
      positionDelta,
    };
  });
}

type Props = {
  events: Event[];
  drivers: DriverEntry[];
  currentByClass: Record<RaceClass, StandingDriver[]>;
};

export function ChampionshipSimulator({
  events,
  drivers,
  currentByClass,
}: Props) {
  const today = useMemo(() => new Date(), []);
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => isUpcoming(e, today))
        .sort((a, b) => a.round - b.round),
    [events, today],
  );

  const [picks, setPicks] = useState<Picks>(EMPTY_PICKS);

  function setPick(raceClass: RaceClass, eventId: number, carNumber: string) {
    setPicks((prev) => ({
      ...prev,
      [raceClass]: { ...prev[raceClass], [eventId]: carNumber },
    }));
  }

  function reset(raceClass: RaceClass) {
    setPicks((prev) => ({ ...prev, [raceClass]: {} }));
  }

  return (
    <Tabs defaultValue="HYPERCAR">
      <TabsList>
        {RACE_CLASSES.map((c) => (
          <TabsTrigger key={c} value={c}>
            {c}
          </TabsTrigger>
        ))}
      </TabsList>

      {RACE_CLASSES.map((c) => (
        <TabsContent key={c} value={c} className="mt-4 space-y-6">
          <ClassPanel
            raceClass={c}
            upcoming={upcoming}
            drivers={drivers}
            current={currentByClass[c]}
            picks={picks[c]}
            onPick={(eventId, car) => setPick(c, eventId, car)}
            onReset={() => reset(c)}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}

function ClassPanel({
  raceClass,
  upcoming,
  drivers,
  current,
  picks,
  onPick,
  onReset,
}: {
  raceClass: RaceClass;
  upcoming: Event[];
  drivers: DriverEntry[];
  current: StandingDriver[];
  picks: ClassPicks;
  onPick: (eventId: number, carNumber: string) => void;
  onReset: () => void;
}) {
  const cars = useMemo(() => {
    const map = new Map<string, { number: string; team: string }>();
    for (const d of drivers) {
      if (d.raceClass === raceClass && !map.has(d.carNumber)) {
        map.set(d.carNumber, { number: d.carNumber, team: d.team });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => Number(a.number) - Number(b.number),
    );
  }, [drivers, raceClass]);

  const simulated = useMemo(
    () => simulate(current, picks, drivers, [...upcoming], raceClass),
    [current, picks, drivers, upcoming, raceClass],
  );

  const pickedCount = Object.values(picks).filter(Boolean).length;
  const hasPicks = pickedCount > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Pick winners</CardTitle>
              <CardDescription>
                {upcoming.length} rounds remaining · {pickedCount} picked
              </CardDescription>
            </div>
            <ClassBadge raceClass={raceClass} />
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Season is complete — nothing left to simulate.
            </p>
          ) : (
            upcoming.map((e) => (
              <div
                key={e.id}
                className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-xs text-muted-foreground">
                    R{e.round} · {format(parseISO(e.dateStart), "MMM d")}
                  </div>
                  <div className="truncate text-sm font-medium">{e.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {pointsFor(e.name)[0]} pts to winner
                  </div>
                </div>
                <Select
                  value={picks[e.id] ?? ""}
                  onValueChange={(v) => onPick(e.id, v)}
                >
                  <SelectTrigger className="w-44 shrink-0">
                    <SelectValue placeholder="Winner…" />
                  </SelectTrigger>
                  <SelectContent>
                    {cars.map((c) => (
                      <SelectItem key={c.number} value={c.number}>
                        #{c.number} {c.team}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
          {hasPicks && (
            <div className="pt-2">
              <Button variant="outline" size="sm" onClick={onReset}>
                Reset picks
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Predicted standings</CardTitle>
          <CardDescription>
            {hasPicks
              ? "Top 10 — Δ shows points gained vs current."
              : "Pick winners on the left to see how the table shifts."}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">Pos</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="w-16 text-right">Now</TableHead>
                <TableHead className="w-16 text-right">Sim</TableHead>
                <TableHead className="w-12 pr-4 text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {simulated.slice(0, 10).map((row) => (
                <TableRow key={row.driverId}>
                  <TableCell className="pl-4 font-mono tabular-nums">
                    {row.position}
                    {row.positionDelta < 0 && (
                      <span className="ml-1 text-[10px] text-[var(--racing-yellow)]">
                        ▲{Math.abs(row.positionDelta)}
                      </span>
                    )}
                    {row.positionDelta > 0 && (
                      <span className="ml-1 text-[10px] text-muted-foreground">
                        ▼{row.positionDelta}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="font-medium">{row.driverName}</TableCell>
                  <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                    {row.current}
                  </TableCell>
                  <TableCell className="text-right font-mono tabular-nums">
                    {row.simulated}
                  </TableCell>
                  <TableCell
                    className={
                      "pr-4 text-right font-mono tabular-nums " +
                      (row.delta > 0
                        ? "text-[var(--racing-yellow)]"
                        : "text-muted-foreground")
                    }
                  >
                    {row.delta > 0 ? `+${row.delta}` : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
