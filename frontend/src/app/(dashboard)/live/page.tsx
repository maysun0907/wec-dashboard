import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ExternalLink, Radio } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Flag } from "@/components/flag";
import { RaceCountdown } from "@/components/race-countdown";
import { SessionTime } from "@/components/session-time";
import { getEvents, getNextEvent, type Event } from "@/lib/api";
import { tzForCircuit } from "@/lib/circuit-tz";
import { getSelectedSeason } from "@/lib/season";

export const metadata = { title: "Live" };

const AL_KAMEL_URL = "https://livetiming.alkamelsystems.com/";
const FIAWEC_URL = "https://www.fiawec.com/";
const FIAWEC_TV_URL = "https://wectv.fiawec.com/";
const TWITTER_URL = "https://twitter.com/FIAWEC";

/** WEC race-day local start time (heuristic). Most rounds start 13:00
 *  circuit-local; Le Mans starts 16:00 CEST; some endurance rounds vary.
 *  Used to derive an ISO instant for the countdown. */
function defaultRaceStartHour(eventName: string): number {
  if (/24 Hours of Le Mans|24 Heures du Mans/i.test(eventName)) return 16;
  if (/8 Hours of Bahrain/i.test(eventName)) return 14;
  if (/1812 km/i.test(eventName)) return 11;
  return 13;
}

function raceStartIso(event: Event): string {
  const tz = tzForCircuit(event.circuit.name);
  const hour = defaultRaceStartHour(event.name);
  // Build a Date in the circuit's local time, then read its UTC ISO.
  // Trick: format current Date in target tz to find offset, then construct.
  const localStr = `${event.dateEnd}T${String(hour).padStart(2, "0")}:00:00`;
  // Convert local-at-tz to UTC by trial — Intl gives offset for that instant.
  const probe = new Date(`${localStr}Z`);
  const localFmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "shortOffset",
    hour: "numeric",
  });
  const offsetPart = localFmt.formatToParts(probe).find(
    (p) => p.type === "timeZoneName",
  )?.value;
  // offsetPart looks like "GMT+9" or "GMT-5" or "GMT+5:30"
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
  const utcMs = probe.getTime() - offsetMin * 60_000;
  return new Date(utcMs).toISOString();
}

function isLiveWeekend(event: Event, today: Date): boolean {
  const todayIso = today.toISOString().slice(0, 10);
  return event.dateStart <= todayIso && todayIso <= event.dateEnd;
}

export default async function LivePage() {
  const year = await getSelectedSeason();
  const events = await getEvents(year);
  const today = new Date();

  const live = events.find((e) => isLiveWeekend(e, today)) ?? null;
  const next = live ?? getNextEvent(events, today) ?? null;
  const tz = next ? tzForCircuit(next.circuit.name) : "UTC";
  const raceIso = next ? raceStartIso(next) : null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Live</h1>
        <p className="text-muted-foreground">
          Race-weekend hub. Times shown in the circuit&rsquo;s timezone and
          your browser&rsquo;s local timezone.
        </p>
      </header>

      {next === null ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No more sessions on this season&rsquo;s calendar.
          </CardContent>
        </Card>
      ) : (
        <>
          <Card className="relative overflow-hidden">
            {live && (
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
                  (live ? "text-[var(--racing-red)]" : "text-muted-foreground")
                }
              >
                {live ? (
                  <>
                    <span className="size-1.5 animate-pulse rounded-full bg-[var(--racing-red)]" />
                    Race weekend live · Round {next.round}
                  </>
                ) : (
                  <>Next race weekend · Round {next.round}</>
                )}
              </div>
              <CardTitle className="mt-2 flex items-center gap-2 text-2xl sm:text-3xl">
                <Flag
                  code={next.circuit.country}
                  flagOnly
                  className="text-2xl"
                />
                {next.name}
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
            <CardContent className="relative grid gap-6 sm:grid-cols-2">
              {raceIso && (
                <div className="space-y-2">
                  <div className="text-xs uppercase tracking-wider text-muted-foreground">
                    Race start
                  </div>
                  <RaceCountdown targetIso={raceIso} />
                  <SessionTime iso={raceIso} circuitTz={tz} />
                </div>
              )}
              <div className="space-y-2">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">
                  Where to watch
                </div>
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
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
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
