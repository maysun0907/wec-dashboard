import type { ReactNode } from "react";
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
        {usable.map((row) => (
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
            {/* Always 3 slots so columns align across HYPERCAR/LMGT3
                rows even when one of them is missing a manufacturer
                or team standing. Missing slots render a muted "not
                recorded" placeholder rather than a wide gap. */}
            <div className="grid gap-3 sm:grid-cols-3">
              <ChampionSlot
                eyebrow="Drivers"
                value={
                  row.driver
                    ? {
                        primary: row.driver.driverName,
                        secondary: row.driver.team,
                        points: row.driver.points,
                        href: `/drivers/${row.driver.driverId}`,
                        photo:
                          driverPhotoById.get(row.driver.driverId) ?? null,
                      }
                    : null
                }
              />
              <ChampionSlot
                eyebrow="Team"
                value={
                  row.team
                    ? {
                        primary: row.team.teamName,
                        secondary: null,
                        points: row.team.points,
                        href: `/teams/${row.team.teamId}`,
                      }
                    : null
                }
              />
              <ChampionSlot
                eyebrow="Manufacturer"
                value={
                  row.manufacturer
                    ? {
                        primary: row.manufacturer.manufacturerName,
                        secondary: null,
                        points: row.manufacturer.points,
                        href: `/manufacturers/${row.manufacturer.manufacturerId}`,
                        logo: row.manufacturer.manufacturerLogoUrl ?? null,
                      }
                    : null
                }
              />
            </div>
          </div>
        ))}
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
      {(value.photo || value.logo) && (
        <div className="size-10 shrink-0 overflow-hidden rounded-full bg-secondary/40">
          {value.photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value.photo}
              alt={value.primary}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <ManufacturerLogo
              src={value.logo ?? null}
              name={value.primary}
              size="lg"
            />
          )}
        </div>
      )}
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
              {/* Fixed-width slot so HYPERCAR / LMGT3 / LMP1 badges
                  with different label widths still leave the car
                  number / team name aligned vertically across rows. */}
              <span className="inline-flex w-24 shrink-0 justify-start">
                <ClassBadge raceClass={raceClass} />
              </span>
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
}: {
  events: Event[];
  winnersByEvent: Map<
    number,
    { raceClass: RaceClass; row: SessionResult }[]
  >;
}) {
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
            const winners = winnersByEvent.get(e.id) ?? [];
            return (
              <li key={e.id}>
                <Link
                  href={`/races/${e.id}`}
                  className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-secondary/40 sm:flex-row sm:items-center sm:gap-4"
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
                  {winners.length > 0 && (
                    /* Fixed two-column grid so each class's winner
                       pill starts at the same x position regardless
                       of team name length. */
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 sm:[grid-template-columns:repeat(2,minmax(0,16rem))]">
                      {winners.map(({ raceClass, row }) => (
                        <span
                          key={raceClass}
                          className="inline-flex items-center gap-2 rounded-md border border-border/40 bg-secondary/30 px-2 py-1 text-xs"
                        >
                          <span className="inline-flex w-16 shrink-0 justify-start">
                            <ClassBadge raceClass={raceClass} />
                          </span>
                          <span className="w-9 shrink-0 font-mono tabular-nums text-muted-foreground">
                            #{row.carNumber}
                          </span>
                          <span className="min-w-0 flex-1 truncate font-medium">
                            {row.team}
                          </span>
                        </span>
                      ))}
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
