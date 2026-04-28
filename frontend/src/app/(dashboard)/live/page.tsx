import Link from "next/link";
import { format, parseISO } from "date-fns";
import { Check, ExternalLink, Radio, Trophy } from "lucide-react";
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
import { RaceCountdown } from "@/components/race-countdown";
import { SessionTime } from "@/components/session-time";
import {
  getEvent,
  getEvents,
  getNextEvent,
  getSessionResults,
  type Event,
  type SessionResult,
  type Session as SessionT,
} from "@/lib/api";
import { tzForCircuit } from "@/lib/circuit-tz";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Live" };

const AL_KAMEL_URL = "https://livetiming.alkamelsystems.com/";
const FIAWEC_URL = "https://www.fiawec.com/";
const FIAWEC_TV_URL = "https://wectv.fiawec.com/";
const TWITTER_URL = "https://twitter.com/FIAWEC";

const SESSION_LABEL: Record<string, string> = {
  FP1: "Free Practice 1",
  FP2: "Free Practice 2",
  FP3: "Free Practice 3",
  Q: "Qualifying",
  RACE: "Race",
};

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
  const events = await getEvents(year);
  const now = Date.now();
  const todayIso = new Date(now).toISOString().slice(0, 10);

  // Pick the active weekend (today between dates) or the next upcoming.
  const live = events.find(
    (e) => e.dateStart <= todayIso && todayIso <= e.dateEnd,
  );
  const next = live ?? getNextEvent(events, new Date(now)) ?? null;

  if (next === null) {
    return (
      <div className="space-y-6">
        <header className="space-y-1">
          <h1 className="text-3xl font-bold tracking-tight">Live</h1>
          <p className="text-muted-foreground">
            Race-weekend hub. Times shown in the circuit&rsquo;s timezone
            and your browser&rsquo;s local timezone.
          </p>
        </header>
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No more sessions on this season&rsquo;s calendar.
          </CardContent>
        </Card>
      </div>
    );
  }

  const detail = await getEvent(next.id).catch(() => null);
  const tz = tzForCircuit(next.circuit.name);

  const sessions = (detail?.sessions ?? [])
    .map((s) => classifySession(s, next.name, now))
    .sort((a, b) => (ORDER[a.type] ?? 99) - (ORDER[b.type] ?? 99));

  const liveSession = sessions.find((s) => s.status === "live") ?? null;
  const lastDone =
    [...sessions].reverse().find((s) => s.status === "past") ?? null;
  const upNext = sessions.find((s) => s.status === "upcoming") ?? null;

  // Pull results for the most recently completed session for the recap card.
  let lastDoneResults: SessionResult[] = [];
  if (lastDone) {
    lastDoneResults = await getSessionResults(lastDone.id).catch(
      () => [] as SessionResult[],
    );
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Live</h1>
        <p className="text-muted-foreground">
          Race-weekend hub. Times shown in the circuit&rsquo;s timezone and
          your browser&rsquo;s local timezone.
        </p>
      </header>

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
                {SESSION_LABEL[liveSession.type] ?? liveSession.type} live ·
                Round {next.round}
              </>
            ) : live ? (
              <>Race weekend · Round {next.round}</>
            ) : (
              <>Next race weekend · Round {next.round}</>
            )}
          </div>
          <CardTitle className="mt-2 flex items-center gap-2 text-2xl sm:text-3xl">
            <Flag code={next.circuit.country} flagOnly className="text-2xl" />
            <Link
              href={`/races/${next.id}`}
              className="hover:text-[var(--racing-red)]"
            >
              {next.name}
            </Link>
          </CardTitle>
          <CardDescription>
            <Link
              href={`/circuits/${next.circuit.id}`}
              className="hover:text-foreground"
            >
              {next.circuit.name}
            </Link>
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
          {!liveSession && !upNext && (
            <p className="text-sm text-muted-foreground">
              All sessions for this weekend are done.
            </p>
          )}
        </CardContent>
      </Card>

      {sessions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Weekend schedule</CardTitle>
            <CardDescription>
              Status of every session on the program.
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ul className="divide-y divide-border">
              {sessions.map((s) => (
                <ScheduleRow key={s.id} session={s} tz={tz} now={now} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {lastDone && lastDoneResults.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>
              Latest result · {SESSION_LABEL[lastDone.type] ?? lastDone.type}
            </CardTitle>
            <CardDescription>
              {lastDone.type === "Q"
                ? "Qualifying classification — pole sitter highlighted."
                : lastDone.type === "RACE"
                  ? "Final race classification, top 5 per class."
                  : "Session-fastest car per class."}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <SessionRecap session={lastDone} rows={lastDoneResults} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Where to watch</CardTitle>
          <CardDescription>
            Direct live timing isn&rsquo;t embedded — Al Kamel blocks
            iframes. These links open the official sources.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-1">
          <ExternalLinkRow
            href={AL_KAMEL_URL}
            label="Live timing"
            detail="Al Kamel Systems — official"
            Icon={Radio}
          />
          <ExternalLinkRow
            href={FIAWEC_TV_URL}
            label="WEC TV"
            detail="Live streaming subscription"
          />
          <ExternalLinkRow
            href={FIAWEC_URL}
            label="fiawec.com"
            detail="Official site, regional broadcasters"
          />
          <ExternalLinkRow
            href={TWITTER_URL}
            label="@FIAWEC on X"
            detail="Live updates during sessions"
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
          {SESSION_LABEL[session.type] ?? session.type} — in progress
        </div>
        <div className="font-mono text-3xl font-bold tabular-nums">
          {fmt(elapsedMin)}{" "}
          <span className="text-base text-muted-foreground">elapsed</span>
        </div>
        {remainingMin !== null && (
          <div className="font-mono text-sm text-muted-foreground tabular-nums">
            ~{fmt(remainingMin)} remaining
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Session start
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
  if (session.startTime === null) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Next: {SESSION_LABEL[session.type] ?? session.type}
        </div>
        <RaceCountdown targetIso={session.startTime} />
      </div>
      <div className="space-y-2">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          Starts at
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
}: {
  session: TimedSession;
  tz: string;
  now: number;
}) {
  const status = session.status;
  return (
    <li className="flex items-center gap-3 px-4 py-2.5 text-sm">
      {status === "live" && (
        <span className="size-2 animate-pulse rounded-full bg-[var(--racing-red)]" />
      )}
      {status === "past" && <Check className="size-4 text-muted-foreground" />}
      {status === "upcoming" && (
        <span className="size-2 rounded-full border border-border" />
      )}
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          {SESSION_LABEL[session.type] ?? session.type}
        </div>
        {session.startTime ? (
          <div className="text-xs text-muted-foreground">
            <ScheduleRowTime
              iso={session.startTime}
              tz={tz}
              now={now}
              status={status}
            />
          </div>
        ) : (
          <div className="text-xs text-muted-foreground">
            Time not yet published
          </div>
        )}
      </div>
    </li>
  );
}

function ScheduleRowTime({
  iso,
  tz,
  now,
  status,
}: {
  iso: string;
  tz: string;
  now: number;
  status: SessionStatus;
}) {
  const startMs = new Date(iso).getTime();
  const diffMin = Math.round((startMs - now) / 60_000);
  if (status === "upcoming") {
    if (diffMin > 60 * 24)
      return (
        <span>in {Math.round(diffMin / 60 / 24)}d</span>
      );
    if (diffMin > 60) return <span>in {Math.round(diffMin / 60)}h</span>;
    return <span>in {diffMin}m</span>;
  }
  if (status === "live") return <span>now</span>;
  // past
  const ago = Math.abs(diffMin);
  if (ago > 60 * 24) return <span>{Math.round(ago / 60 / 24)}d ago</span>;
  if (ago > 60) return <span>{Math.round(ago / 60)}h ago</span>;
  return <span>{ago}m ago</span>;
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
      <div className="space-y-4 px-4 pb-4">
        {Array.from(byClass.entries()).map(([cls, list]) => (
          <div key={cls}>
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
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {r.team}
                  </span>
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
    );
  }
  if (session.type === "FP1" || session.type === "FP2" || session.type === "FP3") {
    return (
      <ul className="divide-y divide-border">
        {rows.map((r) => (
          <li
            key={`${r.position}-${r.carNumber}`}
            className="flex items-center gap-3 px-4 py-2 text-sm"
          >
            <ClassBadge raceClass={r.raceClass} />
            <span className="w-10 font-mono tabular-nums text-muted-foreground">
              #{r.carNumber}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-medium">{r.team}</span>
              <span className="block text-xs text-muted-foreground">
                {r.drivers}
              </span>
            </span>
            {r.bestLap && (
              <span className="font-mono tabular-nums">{r.bestLap}</span>
            )}
          </li>
        ))}
      </ul>
    );
  }
  // RACE — top 5 per class
  const byClass = groupByClass(rows);
  return (
    <div className="space-y-4 px-4 pb-4">
      {Array.from(byClass.entries()).map(([cls, list]) => (
        <div key={cls}>
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
                <span className="min-w-0 flex-1 truncate font-medium">
                  {r.team}
                </span>
                <span className="font-mono tabular-nums text-muted-foreground">
                  {r.gap ?? "—"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function groupByClass(rows: SessionResult[]) {
  const out = new Map<string, SessionResult[]>();
  for (const r of rows) {
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
