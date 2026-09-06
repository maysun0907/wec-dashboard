import { connection } from "next/server";
import type { ReactNode } from "react";
import { format, parseISO } from "date-fns";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { Check, ExternalLink, Trophy } from "lucide-react";
import { localizeEvent } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassBadge } from "@/components/class-badge";
import { RaceClassFilter } from "@/components/race-class-filter";
import { Flag } from "@/components/flag";
import { PageHeader } from "@/components/page-header";
import { PublicLink } from "@/components/public-link";
import { DriverList, TeamLink } from "@/components/entity-link";
import { RaceCountdown } from "@/components/race-countdown";
import { ScheduleRowTime } from "@/components/schedule-row-time";
import { SessionTime } from "@/components/session-time";
import {
  getEvent,
  getEvents,
  getNextEvent,
  getSessionResults,
  isPlausibleSessionTime,
  RACE_CLASSES,
  type SessionResult,
  type Session as SessionT,
} from "@/lib/api";
import { tzForCircuit } from "@/lib/circuit-tz";
import { getSelectedSeason } from "@/lib/season";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";
import { eventDataRevalidateSeconds } from "@/lib/cache-policy";

export const generateMetadata = () => dashboardPageMetadata("live", "/live");

const FIAWEC_URL = "https://www.fiawec.com/";
const FIAWEC_PLUS_URL = "https://plus.fiawec.com/en";
const FIAWEC_LIVE_TIMING_URL = "https://live.fiawec.com/en/live";
const TWITTER_URL = "https://twitter.com/FIAWEC";

const SESSION_LABEL_KEYS: Record<string, "sessionLabelFP1" | "sessionLabelFP2" | "sessionLabelFP3" | "sessionLabelQ" | "sessionLabelRACE"> = {
  FP1: "sessionLabelFP1",
  FP2: "sessionLabelFP2",
  FP3: "sessionLabelFP3",
  Q: "sessionLabelQ",
  RACE: "sessionLabelRACE",
};
function sessionLabel(type: string, t: (k: string) => string): string {
  const k = SESSION_LABEL_KEYS[type];
  return k ? t(k) : type;
}

// Approximate session lengths (minutes). Used only to decide whether a
// session is "in progress now" or already ended; we don't track exact
// end times in the DB.
function sessionDurationMin(type: string, eventName: string): number {
  if (type === "RACE") {
    if (/24 Hours/i.test(eventName)) return 24 * 60;
    if (/8 Hours/i.test(eventName)) return 8 * 60;
    if (/1812 km/i.test(eventName)) return 10 * 60;
    return 6 * 60;
  }
  if (type === "Q") return 60;
  return 90; // FP1/2/3
}

const ORDER: Record<string, number> = {
  FP1: 1,
  FP2: 2,
  FP3: 3,
  Q: 4,
  RACE: 5,
};

type SessionStatus = "past" | "live" | "upcoming";

type TimedSession = SessionT & {
  status: SessionStatus;
  startMs: number | null;
  endMs: number | null;
};

/** Build an ISO UTC string from a date plus an hour-of-day in a given
 *  IANA timezone. Used to estimate session start times when the
 *  weekend's schedule hasn't been published yet. */
function circuitLocalToIso(
  dateIso: string,
  hour: number,
  circuitTz: string,
): string {
  // Parse the date in the circuit's timezone then offset to UTC. Browsers
  // can't directly construct a Date in a foreign timezone; use formatToParts
  // to read back the offset for the constructed instant.
  const probe = new Date(`${dateIso}T${String(hour).padStart(2, "0")}:00:00Z`);
  const partsFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: circuitTz,
    timeZoneName: "shortOffset",
    hour: "numeric",
  });
  const offsetPart = partsFmt
    .formatToParts(probe)
    .find((p) => p.type === "timeZoneName")?.value;
  let offsetMin = 0;
  if (offsetPart) {
    const m = offsetPart.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
    if (m) {
      const sign = m[1] === "+" ? 1 : -1;
      const h = Number(m[2]);
      const mm = m[3] ? Number(m[3]) : 0;
      offsetMin = sign * (h * 60 + mm);
    }
  }
  return new Date(probe.getTime() - offsetMin * 60_000).toISOString();
}

function classifySession(
  s: SessionT,
  eventName: string,
  now: number,
): TimedSession {
  if (!s.startTime) {
    return { ...s, status: "past", startMs: null, endMs: null };
  }
  const startMs = new Date(s.startTime).getTime();
  const endMs =
    startMs + sessionDurationMin(s.type, eventName) * 60_000;
  let status: SessionStatus;
  if (now < startMs) status = "upcoming";
  else if (now <= endMs) status = "live";
  else status = "past";
  return { ...s, status, startMs, endMs };
}

export default async function LivePage() {
  const year = await getSelectedSeason();
  const eventsRaw = await getEvents(year);
  await connection();
  const now = new Date().getTime();
  const todayIso = new Date(now).toISOString().slice(0, 10);
  const rawLocale = await getLocale();
  const localeForName = isLocale(rawLocale) ? rawLocale : "en";

  // Pick the active weekend (today between dates) or the next upcoming.
  const live = eventsRaw.find(
    (e) => e.dateStart <= todayIso && todayIso <= e.dateEnd,
  );
  const nextRaw = live ?? getNextEvent(eventsRaw, new Date(now)) ?? null;
  const isCota = nextRaw?.circuit.name === "Circuit of the Americas";
  const next = nextRaw ? localizeEvent(nextRaw, localeForName) : null;

  const t = await getTranslations("live");
  if (next === null) {
    return (
      <div className="space-y-6">
        <PageHeader
          eyebrow={t("eyebrow")}
          title={t("title")}
          description={t("description")}
        />
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("noMoreSessions")}
          </CardContent>
        </Card>
      </div>
    );
  }
  const eventRevalidate = eventDataRevalidateSeconds(next, new Date(now));

  const detail = await getEvent(next.id);
  const tz = tzForCircuit(next.circuit.name);

  const sessions = detail.sessions
    .filter((s) => isPlausibleSessionTime(next, s))
    .map((s) => classifySession(s, next.name, now))
    .sort((a, b) => (ORDER[a.type] ?? 99) - (ORDER[b.type] ?? 99));

  const liveSession = sessions.find((s) => s.status === "live") ?? null;
  const upNext = sessions.find((s) => s.status === "upcoming") ?? null;

  // Fallback when Wikipedia hasn't published the weekend's schedule yet
  // (typical for races > 2 weeks out): point the countdown at FP1 at
  // 09:00 circuit-local on the event's first listed date. The number
  // is approximate but better than no countdown at all.
  let estimatedFp1Iso: string | null = null;
  if (sessions.length === 0 && next.dateStart) {
    estimatedFp1Iso = circuitLocalToIso(next.dateStart, 9, tz);
  }

  // Last completed session of THIS weekend only — not previous rounds.
  // The home page and standings already surface inter-weekend results.
  const lastDone =
    [...sessions].reverse().find((s) => s.status === "past") ?? null;

  let lastDoneResults: SessionResult[] = [];
  if (lastDone) {
    lastDoneResults = await getSessionResults(lastDone.id, {
      revalidate: eventRevalidate,
    });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <Card className="relative overflow-hidden">
        {liveSession && (
          <div
            className="pointer-events-none absolute inset-0 opacity-30"
            style={{
              background:
                "radial-gradient(800px circle at 100% 0%, var(--racing-red) 0%, transparent 50%)",
            }}
          />
        )}
        <CardHeader className="relative">
          <div
            className={
              "flex items-center gap-2 text-xs font-semibold tracking-widest uppercase " +
              (liveSession
                ? "text-[var(--racing-red)]"
                : "text-muted-foreground")
            }
          >
            {liveSession ? (
              <>
                <span className="size-1.5 animate-pulse rounded-full bg-[var(--racing-red)]" />
                {t("liveRound", {
                  type: sessionLabel(liveSession.type, t),
                  round: next.round,
                })}
              </>
            ) : live ? (
              <>{t("raceWeekendRound", { round: next.round })}</>
            ) : (
              <>{t("nextRaceWeekendRound", { round: next.round })}</>
            )}
          </div>
          <CardTitle className="mt-2 flex items-center gap-2 text-2xl sm:text-3xl">
            <Flag code={next.circuit.country} flagOnly className="text-2xl" />
            <PublicLink
              href={`/races/${next.id}`}
              className="hover:text-[var(--racing-red)]"
            >
              {next.name}
            </PublicLink>
          </CardTitle>
          <CardDescription>
            <PublicLink
              href={`/circuits/${next.circuit.id}`}
              className="hover:text-foreground"
            >
              {next.circuit.name}
            </PublicLink>
            {" · "}
            {format(parseISO(next.dateStart), "MMM d")}
            {next.dateEnd !== next.dateStart &&
              ` – ${format(parseISO(next.dateEnd), "MMM d, yyyy")}`}
          </CardDescription>
        </CardHeader>
        <CardContent className="relative space-y-4">
          {liveSession && liveSession.startMs !== null && (
            <LiveSessionPanel session={liveSession} now={now} tz={tz} />
          )}
          {!liveSession && upNext && upNext.startMs !== null && (
            <NextSessionPanel session={upNext} tz={tz} />
          )}
          {!liveSession && !upNext && estimatedFp1Iso && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("nextFp1")}
                  <span className="ml-2 normal-case text-muted-foreground/70">
                    {t("estimated")}
                  </span>
                </div>
                <RaceCountdown targetIso={estimatedFp1Iso} />
              </div>
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("estimatedStart")}
                </div>
                <SessionTime iso={estimatedFp1Iso} circuitTz={tz} />
                <p className="text-[10px] text-muted-foreground">
                  {t("scheduleFallback")}
                </p>
              </div>
            </div>
          )}
          {!liveSession && !upNext && !estimatedFp1Iso && sessions.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {t("allSessionsDone")}
            </p>
          )}
          <PublicLink
            href={`/races/${next.id}`}
            className="group flex items-center justify-between gap-4 rounded-md border border-[var(--racing-red)]/35 bg-[var(--racing-red)]/5 px-4 py-3 transition-colors hover:border-[var(--racing-red)]/70 hover:bg-[var(--racing-red)]/10"
          >
            <span className="min-w-0">
              <span className="block font-semibold text-foreground group-hover:text-[var(--racing-red)]">
                {isCota
                  ? t("raceHubCotaLabel", { event: next.name })
                  : t("raceHubLabel", { event: next.name })}
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                {isCota
                  ? t("raceHubCotaDetail")
                  : t("raceHubDetail", { circuit: next.circuit.name })}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="shrink-0 text-lg text-[var(--racing-red)] transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </PublicLink>
        </CardContent>
      </Card>

      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("weekendSchedule")}</CardTitle>
            <CardDescription>
              {t("weekendScheduleSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <ScheduleRow
                  key={s.id}
                  session={s}
                  tz={tz}
                  now={now}
                  eventId={next.id}
                />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {lastDone && lastDoneResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("latestResult", {
                type: sessionLabel(lastDone.type, t),
              })}
            </CardTitle>
            <CardDescription>
              {lastDone.type === "Q"
                ? t("qualifyingClassification")
                : lastDone.type === "RACE"
                  ? t("finalClassification")
                  : t("sessionFastest")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <SessionRecap session={lastDone} rows={lastDoneResults} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("whereToWatch")}</CardTitle>
          <CardDescription>
            {t("whereToWatchSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <ExternalLinkRow
            href={FIAWEC_PLUS_URL}
            label={t("wecPlusLabel")}
            detail={t("wecPlusDetail")}
          />
          <ExternalLinkRow
            href={FIAWEC_LIVE_TIMING_URL}
            label={t("liveTimingLabel")}
            detail={t("liveTimingDetail")}
          />
          <ExternalLinkRow
            href={FIAWEC_URL}
            label={t("fiawecLabel")}
            detail={t("fiawecDetail")}
          />
          <ExternalLinkRow
            href={TWITTER_URL}
            label={t("twitterLabel")}
            detail={t("twitterDetail")}
          />
        </CardContent>
      </Card>
    </div>
  );
}

function LiveSessionPanel({
  session,
  now,
  tz,
}: {
  session: TimedSession;
  now: number;
  tz: string;
}) {
  const tl = useTranslations("live");
  if (session.startMs === null) return null;
  const elapsedMin = Math.floor((now - session.startMs) / 60_000);
  const remainingMin =
    session.endMs !== null ? Math.max(0, Math.floor((session.endMs - now) / 60_000)) : null;
  const fmt = (m: number) => {
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const mm = m % 60;
    return `${h}h ${mm}m`;
  };
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-1">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {tl("inProgress", { type: sessionLabel(session.type, tl) })}
        </div>
        <div className="font-mono text-3xl font-bold tabular-nums">
          {fmt(elapsedMin)}{" "}
          <span className="text-base text-muted-foreground">{tl("elapsed")}</span>
        </div>
        {remainingMin !== null && (
          <div className="font-mono text-sm text-muted-foreground tabular-nums">
            ~{fmt(remainingMin)} {tl("remaining")}
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {tl("sessionStart")}
        </div>
        {session.startTime && (
          <SessionTime iso={session.startTime} circuitTz={tz} />
        )}
      </div>
    </div>
  );
}

function NextSessionPanel({
  session,
  tz,
}: {
  session: TimedSession;
  tz: string;
}) {
  const tl = useTranslations("live");
  if (session.startTime === null) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {tl("nextLabel", { type: sessionLabel(session.type, tl) })}
        </div>
        <RaceCountdown targetIso={session.startTime} />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {tl("startsAt")}
        </div>
        <SessionTime iso={session.startTime} circuitTz={tz} />
      </div>
    </div>
  );
}

function ScheduleRow({
  session,
  tz,
  now,
  eventId,
}: {
  session: TimedSession;
  tz: string;
  now: number;
  /** Event the session belongs to. Row links to the race-detail page
   *  with this session's tab pre-selected. */
  eventId: number;
}) {
  const tl = useTranslations("live");
  const status = session.status;
  return (
    <li>
      <PublicLink
        href={`/races/${eventId}?session=${session.type}`}
        className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-secondary/40"
      >
        {status === "live" && (
          <span className="size-2 animate-pulse rounded-full bg-[var(--racing-red)]" />
        )}
        {status === "past" && (
          <Check className="size-4 text-muted-foreground" />
        )}
        {status === "upcoming" && (
          <span className="size-2 rounded-full border border-border" />
        )}
        <div className="min-w-0 flex-1">
          <div className="font-medium">
            {sessionLabel(session.type, tl)}
          </div>
          {session.startTime ? (
            <div className="text-xs text-muted-foreground">
              <ScheduleRowTime
                iso={session.startTime}
                circuitTz={tz}
                now={now}
                status={status}
              />
            </div>
          ) : (
            <div className="text-xs text-muted-foreground">
              {tl("timeNotYet")}
            </div>
          )}
        </div>
        <span className="text-xs text-muted-foreground/40 transition-colors group-hover:text-muted-foreground">
          →
        </span>
      </PublicLink>
    </li>
  );
}

function SessionRecap({
  session,
  rows,
}: {
  session: TimedSession;
  rows: SessionResult[];
}) {
  if (session.type === "Q") {
    // Top 3 per class — pole highlighted.
    const byClass = groupByClass(rows);
    return (
      <SessionClassFilter rows={rows}>
      <div className="space-y-4 px-4 pb-4">
        {Array.from(byClass.entries()).map(([cls, list]) => (
          <div key={cls} data-race-class={cls}>
            <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
              {cls}
            </div>
            <ul className="space-y-1">
              {list.slice(0, 3).map((r) => (
                <li
                  key={`${r.position}-${r.carNumber}`}
                  className="flex items-center gap-3 text-sm"
                >
                  {r.classPosition === 1 || r.position === 1 ? (
                    <Trophy
                      className="size-3.5 text-[var(--racing-yellow)]"
                      fill="currentColor"
                    />
                  ) : (
                    <span className="w-3.5 text-center font-mono text-xs text-muted-foreground">
                      {r.classPosition || r.position}
                    </span>
                  )}
                  <span className="w-10 font-mono tabular-nums text-muted-foreground">
                    #{r.carNumber}
                  </span>
                  <TeamLink
                    id={r.teamId}
                    className="min-w-0 flex-1 truncate font-medium"
                  >
                    {r.team}
                  </TeamLink>
                  {r.bestLap && (
                    <span className="font-mono tabular-nums">
                      {r.bestLap}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      </SessionClassFilter>
    );
  }
  if (session.type === "FP1" || session.type === "FP2" || session.type === "FP3") {
    return (
      <SessionClassFilter rows={rows}>
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={`${r.position}-${r.carNumber}`}
            data-race-class={r.raceClass}
            className="flex items-center gap-3 px-4 py-2 text-sm"
          >
            <ClassBadge raceClass={r.raceClass} />
            <span className="w-10 font-mono tabular-nums text-muted-foreground">
              #{r.carNumber}
            </span>
            <span className="min-w-0 flex-1">
              <TeamLink
                id={r.teamId}
                className="block font-medium"
              >
                {r.team}
              </TeamLink>
              <DriverList
                refs={r.driverRefs}
                text={r.drivers}
                className="block text-xs text-muted-foreground"
              />
            </span>
            {r.bestLap && (
              <span className="font-mono tabular-nums">{r.bestLap}</span>
            )}
          </li>
        ))}
      </ul>
      </SessionClassFilter>
    );
  }
  // RACE — top 5 per class
  const byClass = groupByClass(rows);
  return (
    <SessionClassFilter rows={rows}>
    <div className="space-y-4 px-4 pb-4">
      {Array.from(byClass.entries()).map(([cls, list]) => (
        <div key={cls} data-race-class={cls}>
          <div className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">
            {cls}
          </div>
          <ul className="space-y-1">
            {list.slice(0, 5).map((r) => (
              <li
                key={`${r.position}-${r.carNumber}`}
                className="flex items-center gap-3 text-sm"
              >
                <span className="w-6 font-mono tabular-nums text-muted-foreground">
                  P{r.classPosition || r.position}
                </span>
                <span className="w-10 font-mono tabular-nums text-muted-foreground">
                  #{r.carNumber}
                </span>
                <TeamLink
                  id={r.teamId}
                  className="min-w-0 flex-1 truncate font-medium"
                >
                  {r.team}
                </TeamLink>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {r.gap ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
    </SessionClassFilter>
  );
}

function SessionClassFilter({
  rows,
  children,
}: {
  rows: SessionResult[];
  children: ReactNode;
}) {
  const presentClasses = RACE_CLASSES.filter((raceClass) =>
    rows.some((row) => row.raceClass === raceClass),
  );
  return <RaceClassFilter classes={presentClasses}>{children}</RaceClassFilter>;
}

function groupByClass(rows: SessionResult[]) {
  const out = new Map<string, SessionResult[]>();
  for (const r of rows) {
    if (r.classPosition === 0) continue;
    const k = r.raceClass;
    out.set(k, [...(out.get(k) ?? []), r]);
  }
  for (const list of out.values()) {
    list.sort(
      (a, b) =>
        (a.classPosition || a.position) - (b.classPosition || b.position),
    );
  }
  return out;
}

function ExternalLinkRow({
  href,
  label,
  detail,
  Icon = ExternalLink,
}: {
  href: string;
  label: string;
  detail: string;
  Icon?: typeof ExternalLink;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="-mx-2 flex items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-secondary/40"
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">{label}</div>
        <div className="truncate text-xs text-muted-foreground">{detail}</div>
      </div>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
    </a>
  );
}
