import { format, parseISO } from "date-fns";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeEvent } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
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
import { DriversPodium, buildPodiumRows } from "@/components/drivers-podium";
import { DriverList, TeamLink } from "@/components/entity-link";
import { localDriverImage } from "@/lib/driver-image";
import { localCircuitLayout } from "@/lib/circuit-image";
import { Flag } from "@/components/flag";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PublicLink } from "@/components/public-link";
import { RaceCountdown } from "@/components/race-countdown";
import { RaceClassFilter } from "@/components/race-class-filter";
import { SeasonRecapHero } from "@/components/season-recap-hero";
import {
  LeMansSpotlight,
  RoundsGrid,
  SeasonChampionsCard,
  SeasonNumbersStrip,
  type ClassChampions,
} from "@/components/past-season-sections";
import { ChampionProgressionMiniLazy } from "@/components/champion-progression-mini-lazy";
import { getSelectedSeason } from "@/lib/season";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";
import { mapWithConcurrency } from "@/lib/concurrency";
import {
  eventDataRevalidateSeconds,
  seasonDataRevalidateSeconds,
} from "@/lib/cache-policy";
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
  isApiNotFound,
  isPlausibleSessionTime,
  raceClassLabel,
  sanitizeSessionSchedule,
  type DriverProgression,
  type Event,
  type RaceClass,
  type SessionResult,
} from "@/lib/api";

export const generateMetadata = () => dashboardPageMetadata("home", "/");

export default async function HomePage() {
  const year = await getSelectedSeason();
  const t = await getTranslations("common");
  const tHome = await getTranslations("home");
  const tClass = await getTranslations("raceClass");
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const eventsRaw = await getEvents(year);
  const today = new Date();
  const seasonRevalidate = seasonDataRevalidateSeconds(eventsRaw, today);
  const [hypercarStandings, lmgt3Standings, driverEntries, mfrStandings] =
    await Promise.all([
      getDriverStandings("HYPERCAR", year, {
        revalidate: seasonRevalidate,
      }),
      getDriverStandings("LMGT3", year, {
        revalidate: seasonRevalidate,
      }),
      getDrivers(year),
      getManufacturerStandings("HYPERCAR", year, {
        revalidate: seasonRevalidate,
      }),
    ]);
  const events = eventsRaw.map((e) => localizeEvent(e, locale));
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
  let lastResultByClass: { raceClass: RaceClass; label: string; rows: SessionResult[] }[] = [];
  let lastEventName = "";
  if (last) {
    lastEventName = last.name;
    try {
      const detail = await getEvent(last.id);
      const raceSession = getSessionByType(
        sanitizeSessionSchedule(last, detail.sessions),
        "RACE",
      );
      if (raceSession) {
        const all = await getSessionResults(raceSession.id, {
          revalidate: eventDataRevalidateSeconds(last, today),
        });
        // Top 5 per class, ordered by class position. LMP2 is intentionally
        // included here when an event (notably Le Mans) has it, even though
        // it does not have a current full-season WEC championship table.
        const topPerClass = (cls: RaceClass) =>
          all
            .filter((r) => r.raceClass === cls)
            .sort((a, b) => a.classPosition - b.classPosition)
            .slice(0, 5);
        lastResultByClass = RACE_CLASSES.map((raceClass) => ({
          raceClass,
          label:
            raceClass === "HYPERCAR"
              ? tClass("Hypercar")
              : raceClass === "LMGT3"
                ? tClass("LMGT3Title")
                : raceClassLabel(raceClass),
          rows: topPerClass(raceClass),
        })).filter((item) => item.rows.length > 0);
      }
    } catch (error) {
      if (!isApiNotFound(error)) throw error;
    }
  }

  // Use the real RACE session startTime when available; the hero card
  // falls back to dateStart + 13:00 UTC if ingestion hasn't filled it.
  let nextRaceStart: string | null = null;
  if (next) {
    try {
      const detail = await getEvent(next.id);
      const raceSession = getSessionByType(detail.sessions, "RACE");
      nextRaceStart =
        raceSession &&
        isPlausibleSessionTime(next, raceSession)
          ? raceSession.startTime
          : null;
    } catch (error) {
      if (!isApiNotFound(error)) throw error;
    }
  }

  // Past-season recap: compute the rich sections only when the season
  // has wrapped, since these need to walk every race and it'd be wasted
  // work mid-season. Pass the season year explicitly — without it the
  // standings / progression endpoints fall back to the current season
  // and mix data from the wrong year into a past-season recap.
  const recap = isPastSeason
    ? await buildSeasonRecap(events, seasonYear, today)
    : null;

  return (
    <div className="space-y-8">
      <header className="dashboard-page-header max-w-4xl space-y-3">
        <p className="eyebrow">{tHome("overviewEyebrow")}</p>
        <h1 className="font-heading text-4xl font-extrabold uppercase tracking-[0.01em] sm:text-5xl lg:text-6xl">
          {tHome("overviewTitle", { year: seasonYear })}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground sm:text-lg">
          {tHome("overviewDescription", { year: seasonYear })}
        </p>
      </header>

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
            classes={recap.classesPresent}
          />
          {recap.progressions.length > 0 && (
            <ChampionProgressionMiniLazy classes={recap.progressions} />
          )}
        </>
      )}

      {remaining.length > 0 && (
        <div className="space-y-2">
          <p className="eyebrow">{t("schedule")}</p>
          <UpcomingCard events={remaining} seasonYear={seasonYear} />
        </div>
      )}

      {!isPastSeason && (
        <div className="space-y-2">
          <p className="eyebrow">{t("standings")}</p>
          <section className="grid items-stretch gap-6 lg:grid-cols-2">
            <DriversPodium
              classes={[
                { label: tClass("Hypercar"), rows: hypercarPodium },
                { label: tClass("LMGT3Title"), rows: lmgt3Podium },
              ]}
              rounds={completedRounds}
              seasonYear={seasonYear}
            />
            <StandingsCard
              title={t("manufacturers")}
              rows={mfrStandings.slice(0, 5)}
              rowKey={(r) => `m-${r.manufacturerId}`}
              rowName={(r) => r.manufacturerName}
              rowDetail={() => undefined}
              rowLogo={(r) => r.manufacturerLogoUrl}
              rowHref={(r) => `/manufacturers/${r.manufacturerId}`}
              rounds={completedRounds}
              seasonYear={seasonYear}
            />
          </section>
        </div>
      )}

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
  classesPresent: RaceClass[];
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

/** Walk every race + standings endpoint for a wrapped season and build the
 * rich-recap sections in one shot. Missing resources can be omitted, while
 * transient upstream failures propagate instead of looking like valid gaps. */
async function buildSeasonRecap(
  events: Event[],
  year: number,
  now: Date,
): Promise<SeasonRecap> {
  const seasonRevalidate = seasonDataRevalidateSeconds(events, now);
  // Per-event race winners — top class_position=1 in each race_class.
  const winnersByEvent = new Map<
    number,
    { raceClass: RaceClass; row: SessionResult }[]
  >();
  const classesPresent = new Set<RaceClass>();
  const teamIds = new Set<number>();
  const driverIds = new Set<number>();

  await mapWithConcurrency(
    events,
    4,
    async (e) => {
      try {
        const detail = await getEvent(e.id);
        const race = sanitizeSessionSchedule(e, detail.sessions).find(
          (s) => s.type === "RACE",
        );
        if (!race) return;
        const all = await getSessionResults(race.id, {
          revalidate: eventDataRevalidateSeconds(e, now),
        });
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
      } catch (error) {
        if (!isApiNotFound(error)) throw error;
      }
    },
  );

  // For each class with at least one race winner, try to fetch the
  // championship trio (driver / team / manufacturer). Missing rows
  // become `null` rather than blocking the whole card.
  const champions: ClassChampions[] = [];
  const progressions: { raceClass: RaceClass; rows: DriverProgression[] }[] =
    [];
  const manufacturerIds = new Set<number>();
  await mapWithConcurrency(
    [...classesPresent],
    1,
    async (raceClass) => {
      const [drv, team, mfr, prog] = await Promise.all([
        getDriverStandings(raceClass, year, {
          revalidate: seasonRevalidate,
        }),
        getTeamStandings(raceClass, year, {
          revalidate: seasonRevalidate,
        }),
        getManufacturerStandings(raceClass, year, {
          revalidate: seasonRevalidate,
        }),
        getDriverProgression(raceClass, 5, year, {
          revalidate: seasonRevalidate,
        }),
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
    },
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

  // Sort classes by RACE_CLASSES display order so columns line up
  // predictably (HYPERCAR / LMP1 first, GT3 / GTE last).
  const orderedClasses = RACE_CLASSES.filter((c) => classesPresent.has(c));

  return {
    rounds: events.length,
    classCount: classesPresent.size,
    classesPresent: orderedClasses,
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
  const circuitLayout = localCircuitLayout(event.circuit.country);

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

      {/* Giant flag backdrop on the right side. Scales with viewport
          so it doesn't overlap the title at narrow widths. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-4 top-1/2 -translate-y-1/2 select-none text-[8rem] leading-none opacity-[0.07] sm:-right-8 sm:text-[14rem] lg:text-[22rem]"
      >
        <Flag code={event.circuit.country} flagOnly />
      </div>

      <div className="relative grid gap-6 p-5 sm:gap-8 sm:p-10 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.62fr)] lg:p-12">
        <div className="flex min-w-0 flex-col gap-6 sm:gap-8">
        {/* Eyebrow row */}
        <NextRaceEyebrow round={event.round} year={parseISO(event.dateStart).getFullYear()} />

        {/* Title block */}
        <div className="space-y-3">
          <h2 className="font-heading text-2xl font-extrabold uppercase leading-[0.95] tracking-tight sm:text-4xl lg:text-6xl xl:text-7xl">
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
        <NextRaceCountdown startIso={startIso} />

        {/* Footer row */}
        <NextRaceFooter eventId={event.id} dateStart={event.dateStart} />
        </div>

        <aside className="relative hidden min-h-[23rem] overflow-hidden rounded-sm border border-border/70 bg-black/20 p-5 lg:flex lg:flex-col">
          <div className="flex items-center justify-between gap-3">
            <span className="data-kicker">Circuit telemetry</span>
            <Flag code={event.circuit.country} flagOnly />
          </div>
          <div className="relative flex flex-1 items-center justify-center py-6">
            {circuitLayout ? (
              <Image
                src={circuitLayout}
                alt={`${event.circuit.name} circuit layout`}
                width={540}
                height={340}
                className="max-h-60 w-full object-contain opacity-90 [filter:brightness(0)_invert(1)]"
              />
            ) : (
              <span className="text-8xl opacity-20">
                <Flag code={event.circuit.country} flagOnly />
              </span>
            )}
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-border/60 pt-4 text-xs">
            <div>
              <dt className="data-kicker">Length</dt>
              <dd className="metric-value mt-1 text-lg">
                {event.circuit.lengthKm.toFixed(3)} km
              </dd>
            </div>
            <div>
              <dt className="data-kicker">Round</dt>
              <dd className="metric-value mt-1 text-lg">R{event.round}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </Card>
  );
}

function NextRaceEyebrow({ round, year }: { round: number; year: number }) {
  const t = useTranslations("home");
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs font-semibold uppercase tracking-[0.25em] text-[var(--racing-red)] sm:text-sm">
      <span className="inline-flex items-center gap-2">
        <span className="size-2 animate-pulse rounded-full bg-[var(--racing-red)] shadow-[0_0_12px_var(--racing-red)]" />
        {t("nextRace")}
      </span>
      <span className="text-muted-foreground/60">/</span>
      <span className="text-muted-foreground">{t("roundYear", { round, year })}</span>
    </div>
  );
}

function NextRaceCountdown({ startIso }: { startIso: string | null }) {
  const t = useTranslations("home");
  return (
    <div className="space-y-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-muted-foreground sm:text-xs">
        {t("countsDown")}
      </p>
      <div className="text-foreground">
        <RaceCountdown targetIso={startIso} />
      </div>
    </div>
  );
}

function NextRaceFooter({ eventId, dateStart }: { eventId: number; dateStart: string }) {
  const t = useTranslations("home");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-5 text-sm">
      <span className="font-medium text-muted-foreground">
        {format(parseISO(dateStart), "EEEE, MMMM d, yyyy")}
      </span>
      <PublicLink
        href={`/races/${eventId}`}
        className="group inline-flex items-center gap-2 rounded-md border border-[var(--racing-red)]/30 bg-[var(--racing-red)]/10 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-[var(--racing-red)] transition-colors hover:bg-[var(--racing-red)]/20"
      >
        {t("raceWeekend")}
        <span className="transition-transform group-hover:translate-x-0.5">→</span>
      </PublicLink>
    </div>
  );
}

function UpcomingCard({
  events,
  seasonYear,
}: {
  events: Event[];
  seasonYear: number;
}) {
  const t = useTranslations("home");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("upNext")}</CardTitle>
          <PublicLink
            href="/races"
            seasonYear={seasonYear}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t("fullScheduleArrow")}
          </PublicLink>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y divide-border">
          {events.map((e) => (
            <li key={e.id}>
              <PublicLink
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
              </PublicLink>
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
  seasonYear,
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
  seasonYear: number;
}) {
  const t = useTranslations("common");
  const leader = rows[0]?.points ?? 1;
  return (
    <Card className="flex h-full flex-col">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t("topN", { title, n: 5 })}</CardTitle>
          <Badge variant="outline" className="text-[10px]">
            {t("afterRound", { round: rounds })}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("noStandingsYet")}
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
                  <div className="relative flex h-full items-center gap-2 rounded-md px-3 py-3 sm:gap-4 sm:px-4">
                    <span
                      className={
                        "font-heading w-6 shrink-0 text-center text-xl font-bold tabular-nums sm:w-8 sm:text-2xl " +
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
                        className="sm:size-20"
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
                            {t("gapFromLeader", { gap })}
                          </div>
                        )
                      )}
                    </div>
                    {/* Geist Mono for the points — Saira Condensed
                        (font-heading) is narrow and even with
                        tabular-nums the slim "1" and the curved "9"
                        read as slightly off-axis next to a flat "5".
                        Mono fixes the alignment perception and reads
                        more like a data-board readout. */}
                    <span className="font-mono inline-block min-w-[3ch] shrink-0 text-right text-3xl font-bold tabular-nums sm:text-4xl">
                      {row.points}
                    </span>
                  </div>
                </>
              );
              return (
                <li key={rowKey(row)} className="relative flex-1">
                  {href ? (
                    <PublicLink
                      href={href}
                      className="block h-full transition-colors hover:[&_[data-slot=row-name]]:text-[var(--racing-red)]"
                    >
                      {inner}
                    </PublicLink>
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
        <PublicLink
          href="/standings"
          seasonYear={seasonYear}
          className="font-medium text-muted-foreground hover:text-foreground"
        >
          {t("fullStandings")} →
        </PublicLink>
      </div>
    </Card>
  );
}

function LastResultCard({
  eventName,
  classes,
}: {
  eventName: string;
  classes: { raceClass: RaceClass; label: string; rows: SessionResult[] }[];
}) {
  const t = useTranslations("home");
  const td = useTranslations("raceDetail");
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>{t("lastResult")}</CardTitle>
            <CardDescription>{eventName}</CardDescription>
          </div>
          <Badge variant="secondary">{t("topN", { n: 5 })}</Badge>
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <RaceClassFilter classes={classes.map((item) => item.raceClass)}>
        <div className="space-y-6">
        {classes.map((cls) => (
          <div key={cls.label} data-race-class={cls.raceClass}>
            <div className="flex items-center gap-3 px-4 pb-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground">
                {cls.label}
              </span>
              <span className="h-px flex-1 bg-border/60" />
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4">{td("colPos")}</TableHead>
                  <TableHead className="w-12">{td("colCar")}</TableHead>
                  <TableHead>{td("colTeam")}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {td("colDrivers")}
                  </TableHead>
                  <TableHead className="pr-4 text-right">{td("colGap")}</TableHead>
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
        </div>
        </RaceClassFilter>
      </CardContent>
    </Card>
  );
}
