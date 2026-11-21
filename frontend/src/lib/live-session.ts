import type { Event, Session } from "./api";
import { tzForCircuit } from "./circuit-tz";

const LIVE_SNAPSHOT_MAX_AGE_MS = 30 * 60_000;

export function sessionDurationMin(type: string, name: string): number {
  if (type !== "RACE") return type === "Q" ? 60 : 90;
  const hours = name.match(/(\d+)\s*(?:Hours?|시간)/i);
  if (hours) return Number(hours[1]) * 60;
  return /1812\s*km/i.test(name) ? 600 : 360;
}

export function classifySession(s: Session, eventName: string, now: number) {
  const startMs = s.startTime ? Date.parse(s.startTime) : NaN;
  const ended = s.resultStatus === "completed" || s.resultStatus === "final" || s.resultStatus === "cancelled";
  if (!Number.isFinite(startMs)) {
    return { ...s, status: ended ? "past" as const : "upcoming" as const, startMs: null, endMs: null };
  }
  const endMs = startMs + sessionDurationMin(s.type, eventName) * 60_000;
  // A fresh official live snapshot takes precedence over estimated duration
  // during stoppages, but an abandoned stale marker cannot stay live forever.
  const updatedMs = s.resultsUpdatedAt ? Date.parse(s.resultsUpdatedAt) : NaN;
  const freshLive = s.resultStatus === "live" && updatedMs <= now && now - updatedMs <= LIVE_SNAPSHOT_MAX_AGE_MS;
  const status: "past" | "upcoming" | "live" = ended ? "past" : now < startMs ? "upcoming"
    : freshLive || now <= endMs ? "live" : "past";
  return { ...s, status, startMs, endMs };
}

/** Status can change with the clock even if no results have been collected. */
export function nextSessionTransition(sessions: readonly ReturnType<typeof classifySession>[]): number | undefined {
  let next: number | undefined;
  for (const session of sessions) {
    if (session.startMs === null || session.endMs === null || session.status === "past") continue;
    const updateMs = session.resultsUpdatedAt ? Date.parse(session.resultsUpdatedAt) : NaN;
    const liveUntil = session.resultStatus === "live" && Number.isFinite(updateMs)
      ? updateMs + LIVE_SNAPSHOT_MAX_AGE_MS
      : session.endMs;
    const transition = session.status === "upcoming" ? session.startMs : Math.max(session.endMs, liveUntil) + 1;
    if (next === undefined || transition < next) next = transition;
  }
  return next;
}

/** Use the circuit's calendar day, not UTC or the translated circuit name. */
export function selectLiveEvent(events: Event[], now: Date): Event | null {
  const localDay = (event: Event) => new Intl.DateTimeFormat("en-CA", {
    timeZone: tzForCircuit(event.circuit.name), year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const sorted = [...events].sort((a, b) => a.dateStart.localeCompare(b.dateStart));
  return sorted.find((e) => e.dateStart <= localDay(e) && localDay(e) <= e.dateEnd)
    ?? sorted.find((e) => e.dateStart >= localDay(e)) ?? null;
}
