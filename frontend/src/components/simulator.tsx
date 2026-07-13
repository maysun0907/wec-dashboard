"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Link as LinkIcon } from "lucide-react";
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

// WEC scoring per FIA: standard 6h races vs longer endurance rounds.
const POINTS_LONG = [38, 27, 23, 18, 15, 12, 9, 6, 3, 2];
const POINTS_STANDARD = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];
const POLE_POINT = 1;

function pointsFor(eventName: string): number[] {
  if (/24 Hours|1812 km|8 Hours/i.test(eventName)) return POINTS_LONG;
  return POINTS_STANDARD;
}

function isUpcoming(event: Event, todayIso: string): boolean {
  return event.dateEnd >= todayIso;
}

type ChampType = "drivers" | "manufacturers" | "teams";

const CHAMPIONSHIPS_BY_CLASS: Record<RaceClass, ChampType[]> = {
  HYPERCAR: ["drivers", "manufacturers"],
  LMP1: [],
  LMP2: [],
  LMGT3: ["drivers", "teams"],
  LMGTE_PRO: [],
  LMGTE_AM: [],
};

type PickSlot = "p1" | "p2" | "p3" | "pole";

const SLOT_ORDER: PickSlot[] = ["p1", "p2", "p3", "pole"];

type RoundPicks = Partial<Record<PickSlot, string>>; // slot -> car number
type ClassPicks = Record<number, RoundPicks>; // eventId -> RoundPicks
type Picks = Record<RaceClass, ClassPicks>;

const EMPTY_CLASS_PICKS: ClassPicks = {};
const EMPTY_PICKS: Picks = {
  HYPERCAR: EMPTY_CLASS_PICKS,
  LMP1: EMPTY_CLASS_PICKS,
  LMP2: EMPTY_CLASS_PICKS,
  LMGT3: EMPTY_CLASS_PICKS,
  LMGTE_PRO: EMPTY_CLASS_PICKS,
  LMGTE_AM: EMPTY_CLASS_PICKS,
};

// Class → 1-char tag for the URL param. Keeps shareable links short.
const CLASS_TAG: Record<RaceClass, string> = {
  HYPERCAR: "h",
  LMP1: "1",
  LMP2: "p",
  LMGT3: "g",
  LMGTE_PRO: "P",
  LMGTE_AM: "A",
};
const TAG_TO_CLASS: Record<string, RaceClass> = {
  h: "HYPERCAR",
  "1": "LMP1",
  p: "LMP2",
  g: "LMGT3",
  P: "LMGTE_PRO",
  A: "LMGTE_AM",
};

type CompactPicks = Record<string, Record<string, [string, string, string, string]>>;

/** Pack picks into a [p1,p2,p3,pole] tuple per round, drop empty rounds and
 *  empty classes, then base64-url. Decoder reverses each step. */
function encodePicks(picks: Picks): string {
  const out: CompactPicks = {};
  for (const cls of RACE_CLASSES) {
    const tag = CLASS_TAG[cls];
    const rounds: Record<string, [string, string, string, string]> = {};
    for (const [eid, slots] of Object.entries(picks[cls])) {
      const tuple: [string, string, string, string] = [
        slots.p1 ?? "",
        slots.p2 ?? "",
        slots.p3 ?? "",
        slots.pole ?? "",
      ];
      if (tuple.some(Boolean)) rounds[eid] = tuple;
    }
    if (Object.keys(rounds).length > 0) out[tag] = rounds;
  }
  if (Object.keys(out).length === 0) return "";
  return toBase64Url(JSON.stringify(out));
}

function decodePicks(param: string | null): Picks | null {
  if (!param) return null;
  try {
    const json = fromBase64Url(param);
    const parsed = JSON.parse(json) as CompactPicks;
    const result: Picks = {
      HYPERCAR: {},
      LMP1: {},
      LMP2: {},
      LMGT3: {},
      LMGTE_PRO: {},
      LMGTE_AM: {},
    };
    for (const [tag, rounds] of Object.entries(parsed)) {
      const cls = TAG_TO_CLASS[tag];
      if (!cls) continue;
      const classPicks: ClassPicks = {};
      for (const [eid, tuple] of Object.entries(rounds)) {
        if (
          !Array.isArray(tuple) ||
          tuple.length !== 4 ||
          !tuple.every((value) => typeof value === "string")
        ) {
          continue;
        }
        const slots: RoundPicks = {};
        if (tuple[0]) slots.p1 = tuple[0];
        if (tuple[1]) slots.p2 = tuple[1];
        if (tuple[2]) slots.p3 = tuple[2];
        if (tuple[3]) slots.pole = tuple[3];
        if (Object.keys(slots).length > 0) classPicks[Number(eid)] = slots;
      }
      result[cls] = classPicks;
    }
    return result;
  } catch {
    return null;
  }
}

function toBase64Url(s: string): string {
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = (4 - (b64.length % 4)) % 4;
  return atob(b64 + "=".repeat(pad));
}

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

function pointsForSlot(eventName: string, slot: PickSlot): number {
  const table = pointsFor(eventName);
  if (slot === "p1") return table[0];
  if (slot === "p2") return table[1];
  if (slot === "p3") return table[2];
  return POLE_POINT;
}

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

/** Iterate every (eventId, slot, carNumber) pick. */
function* iterPicks(
  picks: ClassPicks,
): Generator<{ eventId: number; slot: PickSlot; carNumber: string }> {
  for (const [eventIdRaw, slots] of Object.entries(picks)) {
    const eventId = Number(eventIdRaw);
    for (const slot of SLOT_ORDER) {
      const car = slots[slot];
      if (!car) continue;
      yield { eventId, slot, carNumber: car };
    }
  }
}

function simulateDrivers(
  current: StandingDriver[],
  picks: ClassPicks,
  drivers: DriverEntry[],
  events: Event[],
  raceClass: RaceClass,
): SimRow[] {
  const points = new Map<number, number>();
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
  for (const { eventId, slot, carNumber } of iterPicks(picks)) {
    const event = events.find((e) => e.id === eventId);
    if (!event) continue;
    const pts = pointsForSlot(event.name, slot);
    const winners = drivers.filter(
      (d) => d.carNumber === carNumber && d.raceClass === raceClass,
    );
    for (const d of winners) {
      sims.set(d.id, (sims.get(d.id) ?? 0) + pts);
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
  const points = new Map<string, number>();
  for (const s of current) points.set(s.manufacturerName, s.points);
  for (const t of teams) {
    if (t.raceClass === raceClass && t.manufacturer && !points.has(t.manufacturer)) {
      points.set(t.manufacturer, 0);
    }
  }
  const sims = new Map<string, number>();
  for (const { eventId, slot, carNumber } of iterPicks(picks)) {
    const event = events.find((e) => e.id === eventId);
    if (!event) continue;
    const pts = pointsForSlot(event.name, slot);
    const team = teams.find(
      (t) => t.carNumber === carNumber && t.raceClass === raceClass,
    );
    if (!team || !team.manufacturer) continue;
    sims.set(team.manufacturer, (sims.get(team.manufacturer) ?? 0) + pts);
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
  for (const { eventId, slot, carNumber } of iterPicks(picks)) {
    const event = events.find((e) => e.id === eventId);
    if (!event) continue;
    const pts = pointsForSlot(event.name, slot);
    const team = teams.find(
      (t) => t.carNumber === carNumber && t.raceClass === raceClass,
    );
    if (!team) continue;
    const key = `${team.id}-${team.carNumber}`;
    sims.set(key, (sims.get(key) ?? 0) + pts);
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
  initialPicksParam: string | null;
  todayIso: string;
  events: Event[];
  drivers: DriverEntry[];
  teams: TeamEntry[];
  driversByClass: Record<RaceClass, StandingDriver[]>;
  manufacturersByClass: Partial<Record<RaceClass, StandingManufacturer[]>>;
  teamsByClass: Partial<Record<RaceClass, StandingTeam[]>>;
};

export function ChampionshipSimulator({
  initialPicksParam,
  todayIso,
  events,
  drivers,
  teams,
  driversByClass,
  manufacturersByClass,
  teamsByClass,
}: Props) {
  const upcoming = useMemo(
    () =>
      events
        .filter((e) => isUpcoming(e, todayIso))
        .sort((a, b) => a.round - b.round),
    [events, todayIso],
  );

  const [picks, setPicks] = useState<Picks>(
    () => decodePicks(initialPicksParam) ?? EMPTY_PICKS,
  );
  const [copied, setCopied] = useState(false);

  // Push picks back into the URL — replaceState so we don't pollute history
  // and so the route doesn't re-render. The page provides the initial query
  // value, keeping the server and first client render identical.
  useEffect(() => {
    const encoded = encodePicks(picks);
    const url = new URL(window.location.href);
    if (encoded) url.searchParams.set("p", encoded);
    else url.searchParams.delete("p");
    window.history.replaceState(null, "", url.toString());
  }, [picks]);

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard blocked (insecure context, no permission) — silent
    }
  }

  const totalPicks = useMemo(() => {
    let n = 0;
    for (const cls of RACE_CLASSES) {
      for (const slots of Object.values(picks[cls])) {
        n += Object.values(slots).filter(Boolean).length;
      }
    }
    return n;
  }, [picks]);

  function setSlot(
    raceClass: RaceClass,
    eventId: number,
    slot: PickSlot,
    carNumber: string,
  ) {
    setPicks((prev) => {
      const cur = prev[raceClass][eventId] ?? {};
      const next: RoundPicks = { ...cur };
      if (carNumber === "") delete next[slot];
      else next[slot] = carNumber;
      return {
        ...prev,
        [raceClass]: { ...prev[raceClass], [eventId]: next },
      };
    });
  }

  function reset(raceClass: RaceClass) {
    setPicks((prev) => ({ ...prev, [raceClass]: {} }));
  }

  const t = useTranslations("simulator");
  return (
    <Tabs defaultValue="HYPERCAR">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabsList>
          {RACE_CLASSES.filter(
            (c) => CHAMPIONSHIPS_BY_CLASS[c].length > 0,
          ).map((c) => (
            <TabsTrigger key={c} value={c}>
              {c}
            </TabsTrigger>
          ))}
        </TabsList>
        <Button
          variant="outline"
          size="sm"
          onClick={copyShareLink}
          disabled={totalPicks === 0}
          className="gap-1.5"
        >
          {copied ? (
            <>
              <Check className="size-3.5" />
              {t("copied")}
            </>
          ) : (
            <>
              <LinkIcon className="size-3.5" />
              {t("sharePicks")}
            </>
          )}
        </Button>
      </div>

      {RACE_CLASSES.filter(
        (c) => CHAMPIONSHIPS_BY_CLASS[c].length > 0,
      ).map((c) => (
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
            onPick={(eventId, slot, car) => setSlot(c, eventId, slot, car)}
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
  onPick: (eventId: number, slot: PickSlot, carNumber: string) => void;
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

  const t = useTranslations("simulator");
  const championships = CHAMPIONSHIPS_BY_CLASS[raceClass];
  const [activeChamp, setActiveChamp] = useState<ChampType>(
    championships[0] ?? "drivers",
  );
  const champLabel: Record<ChampType, string> = {
    drivers: t("champDrivers"),
    manufacturers: t("champManufacturers"),
    teams: t("champTeams"),
  };
  const slotLabel: Record<PickSlot, string> = {
    p1: t("slotWinner"),
    p2: t("slot2nd"),
    p3: t("slot3rd"),
    pole: t("slotPole"),
  };

  const simulated = useMemo(() => {
    if (activeChamp === "drivers") {
      return simulateDrivers(driverStandings, picks, drivers, upcoming, raceClass);
    }
    if (activeChamp === "manufacturers") {
      return simulateManufacturers(manufacturerStandings, picks, teams, upcoming, raceClass);
    }
    return simulateTeams(teamStandings, picks, teams, upcoming, raceClass);
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

  const totalPicks = Object.values(picks).reduce(
    (n, slots) => n + Object.values(slots).filter(Boolean).length,
    0,
  );
  const hasPicks = totalPicks > 0;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="space-y-3">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>{t("pickPodium")}</CardTitle>
                <CardDescription>
                  {t("remainingPicks", { rounds: upcoming.length, picks: totalPicks })}
                </CardDescription>
              </div>
              <ClassBadge raceClass={raceClass} />
            </div>
          </CardHeader>
        </Card>

        {upcoming.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              {t("seasonComplete")}
            </CardContent>
          </Card>
        ) : (
          upcoming.map((e) => {
            const pts = pointsFor(e.name);
            return (
              <Card key={e.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">
                        R{e.round} · {format(parseISO(e.dateStart), "MMM d")}
                      </div>
                      <CardTitle className="text-base">{e.name}</CardTitle>
                    </div>
                    <span className="text-right text-[10px] text-muted-foreground">
                      {t("ptsLabel", { p1: pts[0], p2: pts[1], p3: pts[2] })}
                      <br />{t("polePlus1")}
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="grid gap-2 sm:grid-cols-2">
                  {SLOT_ORDER.map((slot) => (
                    <div key={slot} className="flex items-center gap-2">
                      <span className="w-12 shrink-0 text-xs uppercase tracking-wider text-muted-foreground">
                        {slotLabel[slot]}
                      </span>
                      <Select
                        value={picks[e.id]?.[slot] ?? ""}
                        onValueChange={(v) => onPick(e.id, slot, v)}
                      >
                        <SelectTrigger className="flex-1">
                          <SelectValue placeholder="—" />
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
                  ))}
                </CardContent>
              </Card>
            );
          })
        )}

        {hasPicks && (
          <div className="pt-1">
            <Button variant="outline" size="sm" onClick={onReset}>
              {t("resetPicks")}
            </Button>
          </div>
        )}
      </div>

      <div className="lg:sticky lg:top-20 lg:self-start">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>{t("predictedStandings")}</CardTitle>
                <CardDescription>
                  {hasPicks ? t("topDeltaHelp") : t("pickToSee")}
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
                        {champLabel[champ]}
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
                  <TableHead className="w-12 pl-4">{t("colPos")}</TableHead>
                  <TableHead>{t("colName")}</TableHead>
                  <TableHead className="w-16 text-right">{t("colNow")}</TableHead>
                  <TableHead className="w-16 text-right">{t("colSim")}</TableHead>
                  <TableHead className="w-12 pr-4 text-right">{t("colDelta")}</TableHead>
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
    </div>
  );
}
