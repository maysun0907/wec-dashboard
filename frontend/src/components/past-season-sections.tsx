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
        {usable.map((row) => {
          const tiles: ReactNode[] = [];
          if (row.driver) {
            tiles.push(
              <ChampionTile
                key="d"
                eyebrow="Drivers"
                primary={row.driver.driverName}
                secondary={row.driver.team}
                points={row.driver.points}
                href={`/drivers/${row.driver.driverId}`}
                photo={
                  driverPhotoById.get(row.driver.driverId) ?? null
                }
              />,
            );
          }
          if (row.team) {
            tiles.push(
              <ChampionTile
                key="t"
                eyebrow="Team"
                primary={row.team.teamName}
                secondary={null}
                points={row.team.points}
                href={`/teams/${row.team.teamId}`}
              />,
            );
          }
          if (row.manufacturer) {
            tiles.push(
              <ChampionTile
                key="m"
                eyebrow="Manufacturer"
                primary={row.manufacturer.manufacturerName}
                secondary={null}
                points={row.manufacturer.points}
                logo={row.manufacturer.manufacturerLogoUrl ?? null}
                href={`/manufacturers/${row.manufacturer.manufacturerId}`}
              />,
            );
          }
          // Pick the tightest grid that fills the row to avoid
          // half-empty 3-up layouts when only 1-2 tiles exist.
          const grid =
            tiles.length === 1
              ? "grid-cols-1"
              : tiles.length === 2
                ? "sm:grid-cols-2"
                : "sm:grid-cols-3";
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
              <div className={`grid gap-4 ${grid}`}>{tiles}</div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function ChampionTile({
  eyebrow,
  primary,
  secondary,
  points,
  href,
  photo,
  logo,
}: {
  eyebrow: string;
  primary: string;
  secondary: string | null;
  points: number | null;
  href: string | null;
  photo?: string | null;
  logo?: string | null;
}) {
  const inner = (
    <div className="flex h-full items-center gap-3 rounded-md border border-border/40 bg-background/40 p-3 transition-colors hover:bg-background/70">
      {(photo || logo) && (
        <div className="size-12 shrink-0 overflow-hidden rounded-full bg-secondary/40">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={photo}
              alt={primary}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : (
            <ManufacturerLogo src={logo ?? null} name={primary} size="lg" />
          )}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] uppercase tracking-[0.25em] text-muted-foreground">
          {eyebrow}
        </div>
        <div className="truncate font-semibold">{primary}</div>
        {secondary && (
          <div className="truncate text-xs text-muted-foreground">
            {secondary}
          </div>
        )}
      </div>
      {points !== null && (
        <span className="font-mono text-lg font-bold tabular-nums">
          {points}
        </span>
      )}
    </div>
  );
  if (href) {
    return (
      <Link href={href} className="block h-full">
        {inner}
      </Link>
    );
  }
  return <div className="h-full">{inner}</div>;
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
              className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-4 py-3 transition-colors hover:bg-secondary/40"
            >
              <ClassBadge raceClass={raceClass} />
              <span className="font-mono text-sm tabular-nums text-muted-foreground">
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
                    <div className="flex flex-wrap gap-2">
                      {winners.map(({ raceClass, row }) => (
                        <span
                          key={raceClass}
                          className="inline-flex items-center gap-1.5 rounded-md border border-border/40 bg-secondary/30 px-2 py-1 text-xs"
                        >
                          <ClassBadge raceClass={raceClass} />
                          <span className="font-mono tabular-nums text-muted-foreground">
                            #{row.carNumber}
                          </span>
                          <span className="max-w-[160px] truncate font-medium">
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
