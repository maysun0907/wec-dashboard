import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
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
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import {
  type Event,
  type RaceClass,
  type SessionResult,
  type StandingDriver,
  type StandingManufacturer,
  type StandingTeam,
  raceClassLabel,
} from "@/lib/api";

/** What we collected per class to render a champions row. */
export type ClassChampions = {
  raceClass: RaceClass;
  driver: StandingDriver | null;
  team: StandingTeam | null;
  manufacturer: StandingManufacturer | null;
};

// ---------------------------------------------------------------------------
// 1. Season-numbers strip
// ---------------------------------------------------------------------------

export function SeasonNumbersStrip({
  rounds,
  classes,
  manufacturers,
  drivers,
  teams,
}: {
  rounds: number;
  classes: number;
  manufacturers: number;
  drivers: number;
  teams: number;
}) {
  const items: { value: number; label: string }[] = [
    { value: rounds, label: "Races" },
    { value: classes, label: "Classes" },
    { value: manufacturers, label: "Manufacturers" },
    { value: teams, label: "Teams" },
    { value: drivers, label: "Drivers" },
  ];
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-8 gap-y-4 px-6 py-5">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col">
            <span className="font-mono text-2xl font-bold tabular-nums">
              {it.value}
            </span>
            <span className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
              {it.label}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 2. Champions card
// ---------------------------------------------------------------------------

export function SeasonChampionsCard({
  classes,
  driverPhotoById,
}: {
  classes: ClassChampions[];
  driverPhotoById: Map<number, string | null>;
}) {
  // Hide rows where every championship is missing — and the whole
  // card if no class has anything to show.
  const usable = classes.filter(
    (c) => c.driver || c.team || c.manufacturer,
  );
  if (usable.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Champions</CardTitle>
        <CardDescription>
          Final standings winners — one row per class with data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {usable.map((row) => {
          // 2014-2020 LMP1 only had a privateer Teams trophy —
          // factory teams competed for the Manufacturers' Cup, so
          // marking the eyebrow keeps the user from wondering why
          // the LMP1 Team champ isn't Porsche / Audi / Toyota.
          const teamEyebrow =
            row.raceClass === "LMP1" ? "Team (Privateers)" : "Team";
          const tiles: { key: "d" | "t" | "m"; node: ReactNode }[] = [];
          if (row.driver) {
            tiles.push({
              key: "d",
              node: (
                <ChampionSlot
                  eyebrow="Drivers"
                  value={{
                    primary: row.driver.driverName,
                    secondary: row.driver.team,
                    points: row.driver.points,
                    href: `/drivers/${row.driver.driverId}`,
                    photo:
                      driverPhotoById.get(row.driver.driverId) ?? null,
                  }}
                />
              ),
            });
          }
          if (row.team) {
            tiles.push({
              key: "t",
              node: (
                <ChampionSlot
                  eyebrow={teamEyebrow}
                  value={{
                    primary: row.team.teamName,
                    secondary: null,
                    points: row.team.points,
                    href: `/teams/${row.team.teamId}`,
                  }}
                />
              ),
            });
          }
          if (row.manufacturer) {
            tiles.push({
              key: "m",
              node: (
                <ChampionSlot
                  eyebrow="Manufacturer"
                  value={{
                    primary: row.manufacturer.manufacturerName,
                    secondary: null,
                    points: row.manufacturer.points,
                    href: `/manufacturers/${row.manufacturer.manufacturerId}`,
                    logo: row.manufacturer.manufacturerLogoUrl ?? null,
                  }}
                />
              ),
            });
          }
          return (
            <div
              key={row.raceClass}
              className="rounded-lg border border-border/60 bg-secondary/20 p-4"
            >
              <div className="mb-3 flex items-center justify-between">
                <ClassBadge raceClass={row.raceClass} />
                <span className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
                  {raceClassLabel(row.raceClass)} Champions
                </span>
              </div>
              {/* Each tile is a fixed 18rem on sm+ so a class with
                  only a Team standing (LMGTE PRO 2016 etc.) doesn't
                  stretch into a giant box. Wrap freely; 3 tiles fit
                  on most viewports, 1-2 tiles leave clean whitespace
                  to the right. */}
              <div className="flex flex-wrap gap-3">
                {tiles.map((t) => (
                  <div key={t.key} className="w-full sm:w-72">
                    {t.node}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

type ChampionValue = {
  primary: string;
  secondary: string | null;
  points: number | null;
  href: string;
  photo?: string | null;
  logo?: string | null;
};

function ChampionSlot({
  eyebrow,
  value,
}: {
  eyebrow: string;
  value: ChampionValue | null;
}) {
  if (value === null) {
    return (
      <div className="flex h-full items-center gap-3 rounded-md border border-dashed border-border/40 bg-background/20 p-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
            {eyebrow}
          </div>
          <div className="truncate text-sm text-muted-foreground/60">
            Not recorded
          </div>
        </div>
      </div>
    );
  }
  const inner = (
    <div className="flex h-full items-center gap-3 rounded-md border border-border/40 bg-background/40 p-3 transition-colors hover:bg-background/70">
      {value.photo ? (
        <div className="relative size-10 shrink-0 overflow-hidden rounded-full bg-secondary/40">
          <Image
            src={value.photo}
            alt={value.primary}
            fill
            sizes="40px"
            className="object-cover"
            loading="lazy"
          />
        </div>
      ) : value.logo ? (
        // ManufacturerLogo brings its own white pill + padding;
        // wrapping it in a circle clipped the logo and made the
        // spacing feel double-paneled. Render it directly at md.
        <ManufacturerLogo
          src={value.logo}
          name={value.primary}
          size="md"
          className="shrink-0"
        />
      ) : null}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {eyebrow}
        </div>
        <div className="truncate text-sm font-semibold">{value.primary}</div>
        {value.secondary && (
          <div className="truncate text-xs text-muted-foreground">
            {value.secondary}
          </div>
        )}
      </div>
      {value.points !== null && (
        <span className="font-mono text-base font-bold tabular-nums">
          {value.points}
        </span>
      )}
    </div>
  );
  return (
    <Link href={value.href} className="block h-full">
      {inner}
    </Link>
  );
}

// ---------------------------------------------------------------------------
// 3. Le Mans spotlight
// ---------------------------------------------------------------------------

export function LeMansSpotlight({
  event,
  winnersByClass,
}: {
  event: Event;
  winnersByClass: { raceClass: RaceClass; row: SessionResult }[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <Flag code="FRA" flagOnly className="text-2xl" />
          <div>
            <CardTitle className="text-2xl">{event.name}</CardTitle>
            <CardDescription>
              {format(parseISO(event.dateStart), "MMM d, yyyy")} ·{" "}
              {event.circuit.name}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {winnersByClass.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No race results recorded.
          </p>
        ) : (
          winnersByClass.map(({ raceClass, row }) => (
            <Link
              key={raceClass}
              href={`/races/${event.id}`}
              className="flex items-center gap-4 rounded-md border border-border/60 bg-secondary/20 px-4 py-3 transition-colors hover:bg-secondary/40"
            >
              <ClassBadge raceClass={raceClass} className="shrink-0" />
              <span className="w-12 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                #{row.carNumber}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold">{row.team}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {row.drivers}
                </div>
              </div>
            </Link>
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// 4. Rounds grid
// ---------------------------------------------------------------------------

export function RoundsGrid({
  events,
  winnersByEvent,
  classes,
}: {
  events: Event[];
  winnersByEvent: Map<
    number,
    { raceClass: RaceClass; row: SessionResult }[]
  >;
  /** Classes that appeared in this season, in display order. The grid
   *  reserves one column per class so HYPERCAR pills align across
   *  rows (and so do LMGT3 / LMP1 / LMGTE PRO / LMGTE AM etc.). */
  classes: RaceClass[];
}) {
  // Per-class column width tuned to the class count: 4-class legacy
  // seasons keep the row from wrapping onto two lines on a 1280-wide
  // viewport, modern 2-class seasons get wider tiles since they have
  // less competition for horizontal space.
  const widthRem =
    classes.length >= 4 ? 13 : classes.length === 3 ? 16 : 18;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Season at a glance</CardTitle>
        <CardDescription>
          Every round + class winners. Click a row for the full results.
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y divide-border">
          {events.map((e) => {
            const winnersList = winnersByEvent.get(e.id) ?? [];
            // Map class → winner so empty classes render an empty
            // cell at the right column.
            const byClass = new Map(
              winnersList.map((w) => [w.raceClass, w] as const),
            );
            return (
              <li key={e.id}>
                <Link
                  href={`/races/${e.id}`}
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-secondary/40 lg:flex-row lg:items-center lg:gap-4"
                >
                  <span className="w-12 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                    R{e.round}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{e.name}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Flag code={e.circuit.country} flagOnly />
                      {e.circuit.name}
                      <span className="text-muted-foreground/40">·</span>
                      {format(parseISO(e.dateStart), "MMM d")}
                    </span>
                  </span>
                  {winnersList.length > 0 && (
                    <div
                      className="grid shrink-0 gap-2"
                      style={{
                        gridTemplateColumns: `repeat(${classes.length}, ${widthRem}rem)`,
                      }}
                    >
                      {classes.map((cls) => {
                        const w = byClass.get(cls);
                        if (!w) {
                          return <span key={cls} aria-hidden />;
                        }
                        return (
                          <span
                            key={cls}
                            className="flex w-full items-center gap-2 rounded-md border border-border/40 bg-secondary/30 px-2 py-1 text-xs"
                            title={`#${w.row.carNumber} ${w.row.team}`}
                          >
                            {/* Badge is content-sized (no slot
                                wrapper). Each column always shows the
                                same class so its badge width is the
                                same on every row — vertical alignment
                                survives, and short-label classes like
                                LMP1 stop wasting an LMGTE-PRO-sized
                                gap to the team name. */}
                            <ClassBadge raceClass={cls} className="shrink-0" />
                            <span className="min-w-0 flex-1 truncate font-medium">
                              <span className="mr-1.5 font-mono tabular-nums text-muted-foreground">
                                #{w.row.carNumber}
                              </span>
                              {w.row.team}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
