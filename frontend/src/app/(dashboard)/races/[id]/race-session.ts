type RaceSessionIdentity = {
  id: number;
  type: string;
  startTime?: string | null;
};

export function normalizeRequestedSession(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized || null;
}

/**
 * Resolve the one session rendered by the server.
 *
 * Deep links win when they name a real session. Regular race-detail visits
 * use the latest session whose scheduled start has passed, then fall back to
 * race, qualifying, and the first scheduled session when times are missing.
 */
export function selectRaceSession<T extends RaceSessionIdentity>(
  sessions: readonly T[],
  requestedSession: unknown,
  now: Date = new Date(),
): T | null {
  const requestedType = normalizeRequestedSession(requestedSession);
  if (requestedType) {
    const requested = sessions.find(
      (session) => session.type.toUpperCase() === requestedType,
    );
    if (requested) return requested;
  }

  // During a live weekend, show the most recently started session without
  // probing every results endpoint. Completed events naturally resolve to
  // RACE, while Friday/Saturday visits land on the latest practice or Q.
  const nowMs = now.getTime();
  const latestStarted = sessions
    .map((session) => ({
      session,
      startMs: session.startTime ? Date.parse(session.startTime) : Number.NaN,
    }))
    .filter(
      ({ startMs }) => Number.isFinite(startMs) && startMs <= nowMs,
    )
    .sort((a, b) => b.startMs - a.startMs)[0]?.session;
  if (latestStarted) return latestStarted;

  return (
    sessions.find((session) => session.type.toUpperCase() === "RACE") ??
    sessions.find((session) => session.type.toUpperCase() === "Q") ??
    sessions[0] ??
    null
  );
}

function selectPreviousRaceSession<T extends RaceSessionIdentity>(
  sessions: readonly T[],
  selected: T,
  now: Date,
): T | null {
  const nowMs = now.getTime();
  const selectedStartMs = selected.startTime
    ? Date.parse(selected.startTime)
    : Number.NaN;
  const previousStarted = sessions
    .filter((session) => session.id !== selected.id)
    .map((session) => ({
      session,
      startMs: session.startTime ? Date.parse(session.startTime) : Number.NaN,
    }))
    .filter(
      ({ startMs }) =>
        Number.isFinite(startMs) &&
        startMs <= nowMs &&
        (!Number.isFinite(selectedStartMs) || startMs < selectedStartMs),
    )
    .sort((a, b) => b.startMs - a.startMs)[0]?.session;
  if (previousStarted) return previousStarted;

  // Historical schedules can lack timestamps. In that case the API order is
  // FP1 → FP2 → FP3 → Q → RACE, so the preceding item is the safest fallback.
  if (!Number.isFinite(selectedStartMs)) {
    const selectedIndex = sessions.findIndex(
      (session) => session.id === selected.id,
    );
    return selectedIndex > 0 ? (sessions[selectedIndex - 1] ?? null) : null;
  }

  return null;
}

/**
 * Fetch the resolved session and, only when an implicit just-started session
 * is still empty, make one sequential fallback request for the prior session.
 * This keeps the maximum at two calls and prevents all-session fan-out.
 */
export async function loadSelectedRaceSession<
  TSession extends RaceSessionIdentity,
  TResult,
>(
  sessions: readonly TSession[],
  requestedSession: unknown,
  loadResults: (sessionId: number) => Promise<TResult[]>,
  now: Date = new Date(),
): Promise<{
  session: TSession;
  results: TResult[];
  loadFailed: boolean;
} | null> {
  const session = selectRaceSession(sessions, requestedSession, now);
  if (!session) return null;

  try {
    const results = await loadResults(session.id);
    const primary = { session, results, loadFailed: false };

    // A just-started session may legitimately have no ingested rows yet. For
    // an ordinary page visit, make one sequential attempt at the previous
    // session so useful completed data remains visible. An explicit session
    // deep link always renders exactly what was requested.
    if (requestedSession !== undefined || results.length > 0) return primary;
    const previous = selectPreviousRaceSession(sessions, session, now);
    if (!previous) return primary;

    try {
      const previousResults = await loadResults(previous.id);
      return previousResults.length > 0
        ? { session: previous, results: previousResults, loadFailed: false }
        : primary;
    } catch {
      return primary;
    }
  } catch {
    return { session, results: [], loadFailed: true };
  }
}

/** Preserve unrelated query parameters and the hash while changing a tab. */
export function buildRaceSessionHref(
  currentHref: string,
  sessionType: string,
): string {
  const url = new URL(currentHref, "https://www.wecdash.com");
  url.searchParams.set("session", sessionType.toUpperCase());
  return `${url.pathname}${url.search}${url.hash}`;
}
