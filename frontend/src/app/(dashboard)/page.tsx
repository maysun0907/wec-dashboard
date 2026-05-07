import Link from "next/link";
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
import { Badge } from "@/components/ui/badge";
import { ClassBadge } from "@/components/class-badge";
import { DriversPodium, buildPodiumRows } from "@/components/drivers-podium";
import { DriverList, TeamLink } from "@/components/entity-link";
import { localDriverImage } from "@/lib/driver-image";
import { Flag } from "@/components/flag";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { RaceCountdown } from "@/components/race-countdown";
import { SeasonRecapHero } from "@/components/season-recap-hero";
import {
  LeMansSpotlight,
  RoundsGrid,
  SeasonChampionsCard,
  SeasonNumbersStrip,
  type ClassChampions,
} from "@/components/past-season-sections";
import { ChampionProgressionMini } from "@/components/champion-progression-mini";
import { getSelectedSeason } from "@/lib/season";
import {
  RACE_CLASSES,
  getDriverProgression,
  getDriverStandings,
  getDrivers,
  getEvent,
  getEvents,
  getLastCompletedEvent,
  getManufacturerStandings,
  getNextEvent,
  getSessionByType,
  getSessionResults,
  getTeamStandings,
  getUpcomingEvents,
  type DriverProgression,
  type Event,
  type RaceClass,
  type SessionResult,
  type StandingManufacturer,
} from "@/lib/api";

export default async function HomePage() {
  const year = await getSelectedSeason();
  const [
    events,
    hypercarStandings,
    lmgt3Standings,
    driverEntries,
    mfrStandings,
  ] = await Promise.all([
    getEvents(year),
    getDriverStandings("HYPERCAR", year),
    getDriverStandings("LMGT3", year).catch(() => []),
    getDrivers(year),
    getManufacturerStandings("HYPERCAR", year).catch(
      () => [] as StandingManufacturer[],
    ),
  ]);
  // Photos live on driver entries, not standings rows — bridge by id.
  // Driver photos: prefer the public/drivers/{id}.* override when
  // it's there, fall back to the wikipedia thumbnail otherwise.
  const photoById = new Map(
    driverEntries.map(
      (d) => [d.id, localDriverImage(d.id) ?? d.photoUrl] as const,
    ),
  );
  const hypercarPodium = buildPodiumRows(hypercarStandings, photoById);
  const lmgt3Podium = buildPodiumRows(lmgt3Standings, photoById);

  const today = new Date();
  const next = getNextEvent(events, today);
  const upcoming = getUpcomingEvents(events, 3, today);
  const remaining = upcoming.slice(1); // exclude the one in the hero
  const last = getLastCompletedEvent(events, today);
  const completedRounds = events.filter(
    (e) => e.dateEnd < today.toISOString().slice(0, 10),
  ).length;
  // A "past" season is one with no upcoming events left. Show the recap
  // hero in that case; the next-race countdown is meaningless for those.
  const isPastSeason = !next && events.length > 0;
  const seasonYear = events[0]?.dateStart
    ? new Date(events[0].dateStart).getFullYear()
    : year ?? new Date().getFullYear();
  const champions = hypercarStandings.filter((d) => d.position === 1);
  const manufacturerChamp =
    mfrStandings.find((m) => m.position === 1) ?? null;

  // Pull race results for the last completed event in a second hop.
  let lastResultByClass: { label: string; rows: SessionResult[] }[] = [];
  let lastEventName = "";
  if (last) {
    lastEventName = last.name;
    try {
      const detail = await getEvent(last.id);
      const raceSession = getSessionByType(detail.sessions, "RACE");
      if (raceSession) {
        const all = await getSessionResults(raceSession.id);
        // Top 5 per class, ordered by class_position. Renders Hypercar
        // above LMGT3 even when an LMGT3 car beat a hypercar overall.
        const topPerClass = (cls: string) =>
          all
            .filter((r) => r.raceClass === cls)
            .sort((a, b) => a.classPosition - b.classPosition)
            .slice(0, 5);
        lastResultByClass = [
          { label: "Hypercar", rows: topPerClass("HYPERCAR") },
          { label: "LMGT3", rows: topPerClass("LMGT3") },
        ].filter((c) => c.rows.length > 0);
      }
    } catch {
      // best-effort — leave empty if endpoint fails
    }
  }

  // Use the real RACE session startTime when available; the hero card
  // falls back to dateStart + 13:00 UTC if ingestion hasn't filled it.
  let nextRaceStart: string | null = null;
  if (next) {
    try {
      const detail = await getEvent(next.id);
      const raceSession = getSessionByType(detail.sessions, "RACE");
      nextRaceStart = raceSession?.startTime ?? null;
    } catch {
      // ignore — fallback applies
    }
  }

  // Past-season recap: compute the rich sections only when the season
  // has wrapped, since these need to walk every race and it'd be wasted
  // work mid-season.
  const recap = isPastSeason
    ? await buildSeasonRecap(events, photoById)
    : null;

  return (
    <div className="space-y-8">
      {next && <NextRaceHero event={next} startIso={nextRaceStart} />}
      {isPastSeason && (
        <SeasonRecapHero
          year={seasonYear}
          rounds={completedRounds}
          champions={champions}
          manufacturerChamp={manufacturerChamp}
          driverEntries={driverEntries}
        />
      )}

      {recap && (
        <>
          <SeasonNumbersStrip
            rounds={recap.rounds}
            classes={recap.classCount}
            manufacturers={recap.manufacturerCount}
            drivers={recap.driverCount}
            teams={recap.teamCount}
          />
          {recap.champions.length > 0 && (
            <SeasonChampionsCard
              classes={recap.champions}
              driverPhotoById={photoById}
            />
          )}
          {recap.leMans && (
            <LeMansSpotlight
              event={recap.leMans.event}
              winnersByClass={recap.leMans.winners}
            />
          )}
          <RoundsGrid
            events={events}
            winnersByEvent={recap.winnersByEvent}
          />
          {recap.progressions.length > 0 && (
            <ChampionProgressionMini classes={recap.progressions} />
          )}
        </>
      )}

      {remaining.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow">Schedule</p>
          <UpcomingCard events={remaining} />
        </div>
      )}

      <div className="space-y-2">
        <p className="eyebrow">Standings</p>
      <section className="grid items-stretch gap-6 lg:grid-cols-2">
        <DriversPodium
          classes={[
            { label: "Hypercar", rows: hypercarPodium },
            { label: "LMGT3", rows: lmgt3Podium },
          ]}
          rounds={completedRounds}
        />
        <StandingsCard
          title="Manufacturers"
          rows={mfrStandings.slice(0, 5)}
          rowKey={(r) => `m-${r.manufacturerId}`}
          rowName={(r) => r.manufacturerName}
          rowDetail={() => undefined}
          rowLogo={(r) => r.manufacturerLogoUrl}
          rowHref={(r) => `/manufacturers/${r.manufacturerId}`}
          rounds={completedRounds}
        />
      </section>
      </div>

      {lastEventName && lastResultByClass.length > 0 && (
        <LastResultCard
          eventName={lastEventName}
          classes={lastResultByClass}
        />
      )}
    </div>
  );
}

type SeasonRecap = {
  rounds: number;
  classCount: number;
  manufacturerCount: number;
  driverCount: number;
  teamCount: number;
  champions: ClassChampions[];
  winnersByEvent: Map<
    number,
    { raceClass: RaceClass; row: SessionResult }[]
  >;
  leMans: {
    event: Event;
    winners: { raceClass: RaceClass; row: SessionResult }[];
  } | null;
  progressions: { raceClass: RaceClass; rows: DriverProgression[] }[];
};

/** Walk every race + standings endpoint for a wrapped season and
 *  build the rich-recap sections in one shot. Anything that fails
 *  (missing class, partial ingest) just gets dropped — sections
 *  render only when there's actually data to show. */
async function buildSeasonRecap(
  events: Event[],
  photoById: Map<number, string | null>,
): Promise<SeasonRecap> {
  void photoById; // referenced by callers; kept here for symmetry
  // Per-event race winners — top class_position=1 in each race_class.
  const winnersByEvent = new Map<
    number,
    { raceClass: RaceClass; row: SessionResult }[]
  >();
  const classesPresent = new Set<RaceClass>();
  const teamIds = new Set<number>();
  const driverIds = new Set<number>();

  await Promise.all(
    events.map(async (e) => {
      try {
        const detail = await getEvent(e.id);
        const race = detail.sessions.find((s) => s.type === "RACE");
        if (!race) return;
        const all = await getSessionResults(race.id);
        const winners: { raceClass: RaceClass; row: SessionResult }[] = [];
        for (const r of all) {
          if (r.classPosition === 1) {
            winners.push({ raceClass: r.raceClass, row: r });
            classesPresent.add(r.raceClass);
          }
          if (r.teamId != null) teamIds.add(r.teamId);
          for (const d of r.driverRefs) driverIds.add(d.id);
        }
        winners.sort((a, b) =>
          RACE_CLASSES.indexOf(a.raceClass) -
          RACE_CLASSES.indexOf(b.raceClass),
        );
        winnersByEvent.set(e.id, winners);
      } catch {
        // skip — partial ingest, not fatal
      }
    }),
  );

  // For each class with at least one race winner, try to fetch the
  // championship trio (driver / team / manufacturer). Missing rows
  // become `null` rather than blocking the whole card.
  const champions: ClassChampions[] = [];
  const progressions: { raceClass: RaceClass; rows: DriverProgression[] }[] =
    [];
  const manufacturerIds = new Set<number>();
  await Promise.all(
    [...classesPresent].map(async (raceClass) => {
      const [drv, team, mfr, prog] = await Promise.all([
        getDriverStandings(raceClass).catch(() => []),
        getTeamStandings(raceClass).catch(() => []),
        getManufacturerStandings(raceClass).catch(() => []),
        getDriverProgression(raceClass, 5).catch(
          () => [] as DriverProgression[],
        ),
      ]);
      const driverChamp = drv.find((d) => d.position === 1) ?? null;
      const teamChamp = team.find((t) => t.position === 1) ?? null;
      const mfrChamp = mfr.find((m) => m.position === 1) ?? null;
      if (driverChamp || teamChamp || mfrChamp) {
        champions.push({
          raceClass,
          driver: driverChamp,
          team: teamChamp,
          manufacturer: mfrChamp,
        });
      }
      for (const m of mfr) manufacturerIds.add(m.manufacturerId);
      if (prog.length > 0) {
        progressions.push({ raceClass, rows: prog });
      }
    }),
  );
  // Render champions in our standard class order.
  champions.sort((a, b) =>
    RACE_CLASSES.indexOf(a.raceClass) - RACE_CLASSES.indexOf(b.raceClass),
  );
  progressions.sort((a, b) =>
    RACE_CLASSES.indexOf(a.raceClass) - RACE_CLASSES.indexOf(b.raceClass),
  );

  // Le Mans = the round whose name mentions Le Mans. Fall back to a
  // circuit name match if the event was renamed.
  const leMansEvent =
    events.find((e) => /le mans/i.test(e.name)) ??
    events.find((e) => /sarthe/i.test(e.circuit.name)) ??
    null;
  const leMans =
    leMansEvent !== null
      ? {
          event: leMansEvent,
          winners: winnersByEvent.get(leMansEvent.id) ?? [],
        }
      : null;

  return {
    rounds: events.length,
    classCount: classesPresent.size,
    manufacturerCount: manufacturerIds.size,
    driverCount: driverIds.size,
    teamCount: teamIds.size,
    champions,
    winnersByEvent,
    leMans,
    progressions,
  };
}

function NextRaceHero({
  event,
  startIso: raceStartIso,
}: {
  event: Event;
  startIso: string | null;
}) {
  const startIso = raceStartIso ?? `${event.dateStart}T13:00:00Z`;

  return (
    <Card className="relative overflow-hidden border-transparent bg-card/40 p-0">
      {/* Racing stripe pattern — sits behind everything, faint. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(115deg, var(--foreground) 0 1px, transparent 1px 32px)",
        }}
      />
      {/* Red corner glow + blue counterweight. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px circle at 8% -20%, color-mix(in oklab, var(--racing-red) 70%, transparent) 0%, transparent 55%), radial-gradient(700px circle at 100% 120%, color-mix(in oklab, var(--class-lmp2) 50%, transparent) 0%, transparent 60%)",
        }}
      />
      {/* Top accent stripe. */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[var(--racing-red)] to-transparent" />

      {/* Giant flag backdrop on the right side. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-8 top-1/2 -translate-y-1/2 select-none text-[14rem] leading-none opacity-[0.07] sm:text-[22rem]"
      >
        <Flag code={event.circuit.country} flagOnly />
      </div>

      <div className="relative flex flex-col gap-6 p-6 sm:gap-8 sm:p-10 lg:p-12">
        {/* Eyebrow row */}
        <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--racing-red)] sm:text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="size-2 animate-pulse rounded-full bg-[var(--racing-red)] shadow-[0_0_12px_var(--racing-red)]" />
            Next Race
          </span>
          <span className="text-muted-foreground/60">/</span>
          <span className="text-muted-foreground">
            Round {event.round} · {parseISO(event.dateStart).getFullYear()}
          </span>
        </div>

        {/* Title block */}
        <div className="space-y-3">
          <h2 className="font-heading text-3xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            {event.name}
          </h2>
          <p className="flex flex-wrap items-center gap-2 text-base text-muted-foreground sm:text-lg">
            <Flag code={event.circuit.country} flagOnly className="text-lg" />
            <span>{event.circuit.name}</span>
            {event.format && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span>{event.format}</span>
              </>
            )}
          </p>
        </div>

        {/* Countdown */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground sm:text-xs">
            Counts down to lights out
          </p>
          <div className="text-foreground">
            <RaceCountdown targetIso={startIso} />
          </div>
        </div>

        {/* Footer row */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5 text-sm">
          <span className="font-medium text-muted-foreground">
            {format(parseISO(event.dateStart), "EEEE, MMMM d, yyyy")}
          </span>
          <Link
            href={`/races/${event.id}`}
            className="group inline-flex items-center gap-2 rounded-md border border-[var(--racing-red)]/30 bg-[var(--racing-red)]/10 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-[var(--racing-red)] transition-colors hover:bg-[var(--racing-red)]/20"
          >
            Race weekend
            <span className="transition-transform group-hover:translate-x-0.5">→</span>
          </Link>
        </div>
      </div>
    </Card>
  );
}

function UpcomingCard({ events }: { events: Event[] }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Up next</CardTitle>
          <Link
            href="/races"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Full schedule →
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/races/${e.id}`}
                className="flex items-center gap-4 px-4 py-3 transition-colors hover:bg-secondary/40"
              >
                <span className="w-8 shrink-0 font-mono text-sm tabular-nums text-muted-foreground">
                  R{e.round}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">{e.name}</span>
                  <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Flag code={e.circuit.country} flagOnly />
                    {e.circuit.name}
                  </span>
                </span>
                <span className="hidden text-right text-xs text-muted-foreground sm:block">
                  <span className="block">
                    {format(parseISO(e.dateStart), "MMM d, yyyy")}
                  </span>
                  {e.format && <span className="block">{e.format}</span>}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function StandingsCard<T extends { position: number; points: number }>({
  title,
  rows,
  rowKey,
  rowName,
  rowDetail,
  rowLogo,
  rowHref,
  rounds,
}: {
  title: string;
  rows: T[];
  rowKey: (r: T) => string;
  rowName: (r: T) => string;
  rowDetail: (r: T) => string | undefined;
  rowLogo?: (r: T) => string | null;
  /** When provided, the entire row becomes a Link to this URL. */
  rowHref?: (r: T) => string;
  rounds: number;
}) {
  const leader = rows[0]?.points ?? 1;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title} · Top 5</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            After R{rounds}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No standings yet for this season.
          </p>
        ) : (
          <ul className="flex flex-1 flex-col justify-between gap-2">
            {rows.map((row) => {
              const detail = rowDetail(row);
              const logo = rowLogo?.(row);
              const pct = Math.max(8, Math.round((row.points / leader) * 100));
              const isLeader = row.position === 1;
              const gap = leader - row.points;
              const href = rowHref?.(row);
              const inner = (
                <>
                  {/* Horizontal point-bar fill — scaled to leader. */}
                  <div className="absolute inset-y-0 left-0 right-0 overflow-hidden rounded-md">
                    <div
                      className="h-full"
                      style={{
                        width: `${pct}%`,
                        background: isLeader
                          ? "linear-gradient(90deg, color-mix(in oklab, var(--racing-red) 28%, transparent), color-mix(in oklab, var(--racing-red) 6%, transparent))"
                          : "linear-gradient(90deg, color-mix(in oklab, var(--foreground) 10%, transparent), transparent)",
                      }}
                    />
                  </div>
                  <div className="relative flex h-full items-center gap-4 rounded-md px-4 py-3">
                    <span
                      className={
                        "font-heading w-8 shrink-0 text-center text-2xl font-bold tabular-nums " +
                        (isLeader
                          ? "text-[var(--racing-red)]"
                          : "text-muted-foreground")
                      }
                    >
                      {row.position}
                    </span>
                    {logo !== undefined && (
                      <ManufacturerLogo
                        src={logo}
                        name={rowName(row)}
                        size="lg"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <div
                        data-slot="row-name"
                        className="truncate text-lg font-semibold transition-colors"
                      >
                        {rowName(row)}
                      </div>
                      {detail ? (
                        <div className="truncate text-sm text-muted-foreground">
                          {detail}
                        </div>
                      ) : (
                        !isLeader && (
                          <div className="truncate text-sm text-muted-foreground">
                            −{gap} from leader
                          </div>
                        )
                      )}
                    </div>
                    <span className="font-heading shrink-0 text-4xl font-extrabold tabular-nums">
                      {row.points}
                    </span>
                  </div>
                </>
              );
              return (
                <li key={rowKey(row)} className="relative flex-1">
                  {href ? (
                    <Link
                      href={href}
                      className="block h-full transition-colors hover:[&_[data-slot=row-name]]:text-[var(--racing-red)]"
                    >
                      {inner}
                    </Link>
                  ) : (
                    inner
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
      <div className="mt-2 px-4 pt-2 pb-2 text-right text-sm">
        <Link
          href="/standings"
          className="font-medium text-muted-foreground hover:text-foreground"
        >
          Full standings →
        </Link>
      </div>
    </Card>
  );
}

function LastResultCard({
  eventName,
  classes,
}: {
  eventName: string;
  classes: { label: string; rows: SessionResult[] }[];
}) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Latest result</CardTitle>
            <CardDescription>{eventName}</CardDescription>
          </div>
          <Badge variant="secondary">Top 5</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 px-0">
        {classes.map((cls) => (
          <div key={cls.label}>
            <div className="flex items-center gap-3 px-4 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {cls.label}
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4">Pos</TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead className="hidden md:table-cell">
                    Drivers
                  </TableHead>
                  <TableHead className="pr-4 text-right">Gap</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cls.rows.map((row) => (
                  <TableRow key={`${row.position}-${row.carNumber}`}>
                    <TableCell className="pl-4 font-mono tabular-nums">
                      {row.classPosition}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {row.carNumber}
                    </TableCell>
                    <TableCell className="font-medium">
                      <TeamLink id={row.teamId}>{row.team}</TeamLink>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      <DriverList refs={row.driverRefs} text={row.drivers} />
                    </TableCell>
                    <TableCell className="pr-4 text-right font-mono tabular-nums">
                      {row.gap ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
