/**
 * Cache windows for data that changes around a WEC event.
 *
 * The public schedule currently records the race date rather than the first
 * track session, so the active window starts six days earlier. That covers a
 * Monday-to-Sunday race week and keeps the short cache active through delayed
 * post-race ingestion.
 */
export const RACE_WEEK_REVALIDATE_SECONDS = 60;
export const OFF_WEEK_REVALIDATE_SECONDS = 60 * 60;
export const ARCHIVE_REVALIDATE_SECONDS = 24 * 60 * 60;

const RACE_WEEK_LEAD_DAYS = 6;
const POST_RACE_GRACE_DAYS = 2;
const CORRECTION_WINDOW_DAYS = 120;
const DAY_MS = 24 * 60 * 60 * 1000;

export type RaceWindow = {
  dateStart: string;
  dateEnd: string;
};

function eventWindow(event: RaceWindow): { start: number; end: number } | null {
  const raceStart = Date.parse(`${event.dateStart}T00:00:00.000Z`);
  const raceEnd = Date.parse(`${event.dateEnd}T23:59:59.999Z`);
  if (!Number.isFinite(raceStart) || !Number.isFinite(raceEnd)) return null;

  return {
    start: raceStart - RACE_WEEK_LEAD_DAYS * DAY_MS,
    end: raceEnd + POST_RACE_GRACE_DAYS * DAY_MS,
  };
}

export function isRaceWeek(
  event: RaceWindow,
  now: Date = new Date(),
): boolean {
  const window = eventWindow(event);
  if (!window) return false;
  const timestamp = now.getTime();
  return timestamp >= window.start && timestamp <= window.end;
}

/** Select a cache duration for one race and its session data. */
export function eventDataRevalidateSeconds(
  event: RaceWindow,
  now: Date = new Date(),
): number {
  const window = eventWindow(event);
  if (!window) return OFF_WEEK_REVALIDATE_SECONDS;
  if (isRaceWeek(event, now)) return RACE_WEEK_REVALIDATE_SECONDS;
  // Appeals can amend a finished race weeks later. Do not give a recent
  // final classification the same cache lifetime as an old archive.
  if (now.getTime() <= window.end + CORRECTION_WINDOW_DAYS * DAY_MS) {
    return OFF_WEEK_REVALIDATE_SECONDS;
  }
  if (now.getTime() > window.end) return ARCHIVE_REVALIDATE_SECONDS;
  return OFF_WEEK_REVALIDATE_SECONDS;
}

/**
 * Select a cache duration for season-wide data such as standings.
 * Historical seasons can be amended, while the current season
 * drops to the race-week window whenever any round is active.
 */
export function seasonDataRevalidateSeconds(
  events: readonly RaceWindow[],
  now: Date = new Date(),
): number {
  if (events.some((event) => isRaceWeek(event, now))) {
    return RACE_WEEK_REVALIDATE_SECONDS;
  }

  const windows = events
    .map(eventWindow)
    .filter((window): window is { start: number; end: number } => window !== null);
  if (
    windows.length > 0 &&
    windows.every((window) => now.getTime() > window.end + CORRECTION_WINDOW_DAYS * DAY_MS)
  ) {
    return ARCHIVE_REVALIDATE_SECONDS;
  }

  return OFF_WEEK_REVALIDATE_SECONDS;
}
