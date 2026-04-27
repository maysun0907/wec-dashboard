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
  type StandingManufacturer,
  type StandingTeam,
  type TeamEntry,
} from "@/lib/api";

// ---------- Points + helpers ----------

const POINTS_LONG = [38, 27, 23, 18, 15, 12, 9, 6, 3, 2];
const POINTS_STANDARD = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

function pointsFor(eventName: string): number[] {
  if (/24 Hours|1812 km|8 Hours/i.test(eventName)) return POINTS_LONG;
  return POINTS_STANDARD;
}

function isUpcoming(event: Event, today: Date): boolean {
  return event.dateEnd >= today.toISOString().slice(0, 10);
}

type ChampType = "drivers" | "manufacturers" | "teams";

// WEC's actual championship structure: Hypercar has Drivers + Manufacturers
// (no Teams' trophy); LMGT3 has Drivers + Teams (no Manufacturers' cup).
const CHAMPIONSHIPS_BY_CLASS: Record<RaceClass, ChampType[]> = {
  HYPERCAR: ["drivers", "manufacturers"],
  LMP2: [],
  LMGT3: ["drivers", "teams"],
};

const CHAMP_LABEL: Record<ChampType, string> = {
  drivers: "Drivers",
  manufacturers: "Manufacturers",
  teams: "Teams",
};

type SimRow = {
  key: string;
  name: string;
  detail?: string;
  current: number;
  simulated: number;
  delta: number;
  position: number;
  positionDelta: number;
};

type ClassPicks = Record<number, string>; // eventId → carNumber
type Picks = Record<RaceClass, ClassPicks>;

const EMPTY_CLASS_PICKS: ClassPicks = {};
const EMPTY_PICKS: Picks = {
  HYPERCAR: EMPTY_CLASS_PICKS,
  LMP2: EMPTY_CLASS_PICKS,
  LMGT3: EMPTY_CLASS_PICKS,
};

// ---------- Sim functions ----------

function rankRows(
  rows: Omit<SimRow, "position" | "positionDelta">[],
  currentPositionByKey: Map<string, number>,
): SimRow[] {
  rows.sort(
    (a, b) =>
      b.simulated - a.simulated || a.name.localeCompare(b.name),
  );
  return rows.map((r, i) => {
    const newPos = i + 1;
    const oldPos = currentPositionByKey.get(r.key);
    const positionDelta = oldPos !== undefined ? newPos - oldPos : 0;
    return { ...r, position: newPos, positionDelta };
  });
}

function simulateDrivers(
  current: StandingDriver[],
  picks: ClassPicks,
  drivers: DriverEntry[],
  events: Event[],
  raceClass: RaceClass,
): SimRow[] {
  const points = new Map<number, number>(); // driverId → points
  const nameById = new Map<number, string>();
  for (const s of current) {
    points.set(s.driverId, s.points);
    nameById.set(s.driverId, s.driverName);
  }
  for (const d of drivers) {
    if (d.raceClass === raceClass && !points.has(d.id)) {
      points.set(d.id, 0);
      nameById.set(d.id, d.name);
    }
  }
  const sims = new Map<number, number>();
  for (const [evIdRaw, carNumber] of Object.entries(picks)) {
    if (!carNumber) continue;
    const event = events.find((e) => e.id === Number(evIdRaw));
    if (!event) continue;
    const winnerPts = pointsFor(event.name)[0];
    const winningDrivers = drivers.filter(
      (d) => d.carNumber === carNumber && d.raceClass === raceClass,
    );
    for (const d of winningDrivers) {
      sims.set(d.id, (sims.get(d.id) ?? 0) + winnerPts);
    }
  }
  const posByKey = new Map<string, number>();
  for (const s of current) posByKey.set(`d-${s.driverId}`, s.position);
  const rows = Array.from(points.entries()).map(([id, base]) => {
    const add = sims.get(id) ?? 0;
    return {
      key: `d-${id}`,
      name: nameById.get(id) ?? "?",
      current: base,
      simulated: base + add,
      delta: add,
    };
  });
  return rankRows(rows, posByKey);
}

function simulateManufacturers(
  current: StandingManufacturer[],
  picks: ClassPicks,
  teams: TeamEntry[],
  events: Event[],
  raceClass: RaceClass,
): SimRow[] {
  const points = new Map<string, number>(); // manufacturer name → points
  for (const s of current) points.set(s.manufacturerName, s.points);
  for (const t of teams) {
    if (t.raceClass === raceClass && t.manufacturer && !points.has(t.manufacturer)) {
      points.set(t.manufacturer, 0);
    }
  }
  const sims = new Map<string, number>();
  for (const [evIdRaw, carNumber] of Object.entries(picks)) {
    if (!carNumber) continue;
    const event = events.find((e) => e.id === Number(evIdRaw));
    if (!event) continue;
    const winnerPts = pointsFor(event.name)[0];
    const team = teams.find(
      (t) => t.carNumber === carNumber && t.raceClass === raceClass,
    );
    if (!team || !team.manufacturer) continue;
    sims.set(team.manufacturer, (sims.get(team.manufacturer) ?? 0) + winnerPts);
  }
  const posByKey = new Map<string, number>();
  for (const s of current) posByKey.set(`m-${s.manufacturerName}`, s.position);
  const rows = Array.from(points.entries()).map(([name, base]) => {
    const add = sims.get(name) ?? 0;
    return {
      key: `m-${name}`,
      name,
      current: base,
      simulated: base + add,
      delta: add,
    };
  });
  return rankRows(rows, posByKey);
}

function simulateTeams(
  current: StandingTeam[],
  picks: ClassPicks,
  teams: TeamEntry[],
  events: Event[],
  raceClass: RaceClass,
): SimRow[] {
  type Info = { name: string; manufacturer: string | null; carNumber: string };
  const points = new Map<string, number>();
  const info = new Map<string, Info>();
  for (const s of current) {
    if (!s.carNumber) continue;
    const key = `${s.teamId}-${s.carNumber}`;
    points.set(key, s.points);
    info.set(key, {
      name: s.teamName,
      manufacturer: s.manufacturer,
      carNumber: s.carNumber,
    });
  }
  for (const t of teams) {
    if (t.raceClass !== raceClass) continue;
    const key = `${t.id}-${t.carNumber}`;
    if (!points.has(key)) {
      points.set(key, 0);
      info.set(key, {
        name: t.name,
        manufacturer: t.manufacturer,
        carNumber: t.carNumber,
      });
    }
  }
  const sims = new Map<string, number>();
  for (const [evIdRaw, carNumber] of Object.entries(picks)) {
    if (!carNumber) continue;
    const event = events.find((e) => e.id === Number(evIdRaw));
    if (!event) continue;
    const winnerPts = pointsFor(event.name)[0];
    const team = teams.find(
      (t) => t.carNumber === carNumber && t.raceClass === raceClass,
    );
    if (!team) continue;
    const key = `${team.id}-${team.carNumber}`;
    sims.set(key, (sims.get(key) ?? 0) + winnerPts);
  }
  const posByKey = new Map<string, number>();
  for (const s of current) {
    if (!s.carNumber) continue;
    posByKey.set(`t-${s.teamId}-${s.carNumber}`, s.position);
  }
  const rows = Array.from(points.entries()).map(([key, base]) => {
    const i = info.get(key)!;
    const add = sims.get(key) ?? 0;
    return {
      key: `t-${key}`,
      name: `${i.name} #${i.carNumber}`,
      detail: i.manufacturer ?? undefined,
      current: base,
      simulated: base + add,
      delta: add,
    };
  });
  return rankRows(rows, posByKey);
}

// ---------- Component ----------

type Props = {
  events: Event[];
  drivers: DriverEntry[];
  teams: TeamEntry[];
  driversByClass: Record<RaceClass, StandingDriver[]>;
  manufacturersByClass: Partial<Record<RaceClass, StandingManufacturer[]>>;
  teamsByClass: Partial<Record<RaceClass, StandingTeam[]>>;
};

export function ChampionshipSimulator({
  events,
  drivers,
  teams,
  driversByClass,
  manufacturersByClass,
  teamsByClass,
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

  function setPick(c: RaceClass, eventId: number, carNumber: string) {
    setPicks((prev) => ({
      ...prev,
      [c]: { ...prev[c], [eventId]: carNumber },
    }));
  }
  function reset(c: RaceClass) {
    setPicks((prev) => ({ ...prev, [c]: {} }));
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
        <TabsContent key={c} value={c} className="mt-4">
          <ClassPanel
            raceClass={c}
            upcoming={upcoming}
            drivers={drivers}
            teams={teams}
            picks={picks[c]}
            driverStandings={driversByClass[c]}
            manufacturerStandings={manufacturersByClass[c] ?? []}
            teamStandings={teamsByClass[c] ?? []}
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
  teams,
  picks,
  driverStandings,
  manufacturerStandings,
  teamStandings,
  onPick,
  onReset,
}: {
  raceClass: RaceClass;
  upcoming: Event[];
  drivers: DriverEntry[];
  teams: TeamEntry[];
  picks: ClassPicks;
  driverStandings: StandingDriver[];
  manufacturerStandings: StandingManufacturer[];
  teamStandings: StandingTeam[];
  onPick: (eventId: number, carNumber: string) => void;
  onReset: () => void;
}) {
  const cars = useMemo(() => {
    const map = new Map<string, { number: string; team: string }>();
    for (const t of teams) {
      if (t.raceClass === raceClass && !map.has(t.carNumber)) {
        map.set(t.carNumber, { number: t.carNumber, team: t.name });
      }
    }
    return Array.from(map.values()).sort(
      (a, b) => Number(a.number) - Number(b.number),
    );
  }, [teams, raceClass]);

  const championships = CHAMPIONSHIPS_BY_CLASS[raceClass];
  const [activeChamp, setActiveChamp] = useState<ChampType>(
    championships[0] ?? "drivers",
  );

  const simulated = useMemo(() => {
    if (activeChamp === "drivers") {
      return simulateDrivers(driverStandings, picks, drivers, [...upcoming], raceClass);
    }
    if (activeChamp === "manufacturers") {
      return simulateManufacturers(manufacturerStandings, picks, teams, [...upcoming], raceClass);
    }
    return simulateTeams(teamStandings, picks, teams, [...upcoming], raceClass);
  }, [
    activeChamp,
    driverStandings,
    manufacturerStandings,
    teamStandings,
    picks,
    drivers,
    teams,
    upcoming,
    raceClass,
  ]);

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
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Predicted standings</CardTitle>
              <CardDescription>
                {hasPicks
                  ? "Top 10 — Δ shows points gained vs current."
                  : "Pick winners to see the table shift."}
              </CardDescription>
            </div>
            {championships.length > 1 && (
              <Tabs
                value={activeChamp}
                onValueChange={(v) => setActiveChamp(v as ChampType)}
              >
                <TabsList variant="line">
                  {championships.map((champ) => (
                    <TabsTrigger key={champ} value={champ}>
                      {CHAMP_LABEL[champ]}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>
            )}
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">Pos</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="w-16 text-right">Now</TableHead>
                <TableHead className="w-16 text-right">Sim</TableHead>
                <TableHead className="w-12 pr-4 text-right">Δ</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {simulated.slice(0, 10).map((row) => (
                <TableRow key={row.key}>
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
                  <TableCell className="font-medium">
                    {row.name}
                    {row.detail && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {row.detail}
                      </span>
                    )}
                  </TableCell>
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
