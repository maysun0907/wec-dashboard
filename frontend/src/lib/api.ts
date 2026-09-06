import { mapWithConcurrency } from "@/lib/concurrency";
import {
  ARCHIVE_REVALIDATE_SECONDS,
  eventDataRevalidateSeconds,
  seasonDataRevalidateSeconds,
} from "@/lib/cache-policy";

// API client for the WEC Dashboard backend.
//
// All `fetch` calls run server-side (Server Components) and use Next.js
// time-based revalidation. Tune per resource by data volatility.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// --- Types (mirror backend Pydantic schemas, camelCase) ---

// Covers every WEC class since 2012. Older seasons used LMP1/LMGTE Pro/Am;
// the modern grid is HYPERCAR + LMGT3 with LMP2 still appearing as a one-off
// at Le Mans in some seasons.
export type RaceClass =
  | "HYPERCAR"
  | "LMP1"
  | "LMP2"
  | "LMGT3"
  | "LMGTE_PRO"
  | "LMGTE_AM";

/** Display order for tabs / pickers. Pages should filter out classes that
 *  have zero entries for the active season rather than hide entries from
 *  this list. */
export const RACE_CLASSES: RaceClass[] = [
  "HYPERCAR",
  "LMP1",
  "LMP2",
  "LMGTE_PRO",
  "LMGTE_AM",
  "LMGT3",
];

/** Human-readable label for a race class. */
export function raceClassLabel(c: RaceClass): string {
  if (c === "LMGTE_PRO") return "LMGTE Pro";
  if (c === "LMGTE_AM") return "LMGTE Am";
  return c;
}

export type Circuit = {
  id: number;
  name: string;
  country: string;
  lengthKm: number;
  lapRecord: string | null;
  layoutImage: string | null;
};

export type Event = {
  id: number;
  round: number;
  name: string;
  dateStart: string; // ISO date
  dateEnd: string;
  format: string | null;
  /** FIA-published official round poster (transparent-bg PNG). Null
   *  when the event-page upload hasn't landed yet (early-season). */
  posterUrl: string | null;
  circuit: Circuit;
};

export type Session = {
  id: number;
  type: string; // "FP1" | "FP2" | "FP3" | "Q" | "RACE"
  startTime: string | null;
  resultStatus?: "live" | "completed" | "final" | null;
  resultSourceUrl?: string | null;
  resultsUpdatedAt?: string | null;
};

export type EventDetail = Event & { sessions: Session[] };

/**
 * Reject obviously mis-associated session timestamps before they reach a
 * countdown or schedule. Practice can begin several days before the listed
 * race window, so the guard is deliberately generous; it only catches dates
 * that clearly belong to another event.
 */
export function isPlausibleSessionTime(
  event: Pick<Event, "dateStart" | "dateEnd">,
  session: Pick<Session, "startTime">,
): boolean {
  if (!session.startTime) return false;
  const start = Date.parse(session.startTime);
  const eventStart = Date.parse(`${event.dateStart}T00:00:00Z`);
  const eventEnd = Date.parse(`${event.dateEnd}T23:59:59Z`);
  if (![start, eventStart, eventEnd].every(Number.isFinite)) return false;

  const day = 24 * 60 * 60 * 1000;
  return start >= eventStart - 4 * day && start <= eventEnd + day;
}

/**
 * Preserve a session and its results when only its timestamp is corrupt.
 *
 * A session ID belongs to its event in the database, whereas its timestamp is
 * imported separately. Dropping every session because one timestamp is stale
 * hid valid race classifications from completed rounds. Nulling only the bad
 * time keeps that data available while preventing an incorrect countdown or
 * timetable from rendering.
 */
export function sanitizeSessionSchedule(
  event: Pick<Event, "dateStart" | "dateEnd">,
  sessions: readonly Session[],
): Session[] {
  return sessions.map((session) =>
    session.startTime !== null && !isPlausibleSessionTime(event, session)
      ? { ...session, startTime: null }
      : session,
  );
}

export type SessionResultDriverRef = {
  id: number;
  name: string;
};

export type SessionResult = {
  status?: string | null;
  position: number; // overall
  classPosition: number;
  pointsAwarded: number;
  carNumber: string;
  team: string;
  teamId: number | null;
  drivers: string;
  driverRefs: SessionResultDriverRef[];
  raceClass: RaceClass;
  laps: number | null;
  gap: string | null;
  bestLap: string | null;
  /** Qualifying-session lap (set in the open Q before Hyperpole). Only
   *  populated for Q sessions. */
  qualifyingLap: string | null;
  /** Hyperpole lap. Only set when the car advanced to Hyperpole. */
  hyperpoleLap: string | null;
  /** Driver who actually set the Q / Hyperpole lap on this car. From
   *  Al Kamel timing CSVs; null when we couldn't match. */
  qualifyingDriver: string | null;
  hyperpoleDriver: string | null;
  /** Pit stop count from Al Kamel race analysis. Null for non-race or
   *  un-enriched seasons. */
  pitStops: number | null;
  /** Race V-max in km/h (top speed across all laps, from Al Kamel
   *  TOP_SPEED column). Null for non-race or pre-CSV-publication. */
  topSpeedKph: number | null;
  /** S1/S2/S3 of the car's best Q (or HP) lap, raw seconds strings.
   *  Null for non-Q sessions or when the CSV hasn't published. */
  poleSectors: string[] | null;
};

export type DriverEntry = {
  id: number;
  name: string;
  nationality: string | null;
  carNumber: string;
  team: string;
  manufacturerLogoUrl: string | null;
  photoUrl: string | null;
  raceClass: RaceClass;
};

export type DriverRef = {
  id: number;
  name: string;
  rounds?: string | null;
  photoUrl?: string | null;
};

/** Returns a short human-readable rounds tag (e.g., 'TBC', '1-3', '1') or
 *  null when the driver is on the full-season entry list. */
export function describeRounds(rounds?: string | null): string | null {
  if (!rounds) return null;
  const lower = rounds.trim().toLowerCase();
  if (lower === "" || lower === "all" || lower === "various") return null;
  return rounds.trim();
}

export type DriverResult = {
  eventId: number;
  round: number;
  eventName: string;
  position: number; // overall
  classPosition: number; // rank within race_class
  pointsAwarded: number; // WEC points scored
  laps: number | null;
  gap: string | null;
};

export type DriverStandingRef = {
  position: number;
  points: number;
};

export type DriverSeason = {
  year: number;
  team: string;
  teamId: number | null;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  raceClass: RaceClass;
  carNumber: string;
  championshipPosition: number | null;
  points: number | null;
  races: number;
  wins: number;
  podiums: number;
};

export type DriverDetail = {
  id: number;
  name: string;
  nationality: string | null;
  carNumber: string | null;
  team: string | null;
  teamId: number | null;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  photoUrl: string | null;
  raceClass: RaceClass | null;
  carModel: string | null;
  carModelSlug: string | null;
  coDrivers: DriverRef[];
  results: DriverResult[];
  standing: DriverStandingRef | null;
  seasons: DriverSeason[];
};

export type TeamCar = {
  carId: number;
  number: string;
  raceClass: RaceClass;
  model: string | null;
  carModelSlug: string | null;
  /** Per-entry livery PNG (FIA renders one per car number). Falls
   *  back to `carModelImageUrl` when null. */
  imageUrl: string | null;
  carModelImageUrl: string | null;
  manufacturerId: number | null;
  drivers: DriverRef[];
};

export type TeamResult = {
  eventId: number;
  round: number;
  eventName: string;
  carNumber: string;
  raceClass: RaceClass;
  position: number; // overall
  classPosition: number;
  pointsAwarded: number;
  laps: number | null;
  gap: string | null;
};

export type TeamSeason = {
  year: number;
  raceClass: RaceClass;
  carNumber: string;
  championshipPosition: number | null;
  points: number | null;
  races: number;
  wins: number;
  podiums: number;
};

export type TeamDetail = {
  id: number;
  name: string;
  manufacturer: string | null;
  manufacturerId: number | null;
  manufacturerLogoUrl: string | null;
  /** External links inherited from the team's manufacturer (curated
   *  per-brand server-side). Empty when the manufacturer has no
   *  curated links — keep the section hidden in that case. */
  websiteUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
  cars: TeamCar[];
  results: TeamResult[];
  seasons: TeamSeason[];
};

export type ManufacturerCar = {
  carId: number;
  carNumber: string;
  raceClass: RaceClass;
  teamId: number;
  teamName: string;
  model: string | null;
  carModelSlug: string | null;
  imageUrl: string | null;
  carModelImageUrl: string | null;
  drivers: DriverRef[];
};

export type ManufacturerResult = {
  eventId: number;
  round: number;
  eventName: string;
  carNumber: string;
  teamId: number | null;
  teamName: string;
  raceClass: RaceClass;
  position: number;
  classPosition: number;
  pointsAwarded: number;
  laps: number | null;
  gap: string | null;
};

export type ManufacturerStandingItem = {
  raceClass: RaceClass;
  position: number;
  points: number;
};

export type ManufacturerSeason = {
  year: number;
  raceClass: RaceClass;
  championshipPosition: number | null;
  points: number | null;
  cars: number;
  races: number;
  wins: number;
  podiums: number;
};

export type ManufacturerDetail = {
  id: number;
  name: string;
  country: string | null;
  logoUrl: string | null;
  /** Brand's official racing-arm presence — null when we don't have
   *  a confirmed handle for the slot. Curated server-side. */
  websiteUrl: string | null;
  youtubeUrl: string | null;
  xUrl: string | null;
  instagramUrl: string | null;
  cars: ManufacturerCar[];
  results: ManufacturerResult[];
  standings: ManufacturerStandingItem[];
  seasons: ManufacturerSeason[];
};

export type CircuitWinner = {
  raceClass: RaceClass;
  carNumber: string;
  team: string;
  teamId: number | null;
};

export type CircuitEventEntry = {
  eventId: number;
  seasonYear: number;
  round: number;
  name: string;
  dateStart: string;
  dateEnd: string;
  winners: CircuitWinner[];
};

export type CircuitDetail = {
  id: number;
  name: string;
  country: string;
  lengthKm: number;
  lapRecord: string | null;
  layoutImage: string | null;
  events: CircuitEventEntry[];
};

export type TeamEntry = {
  id: number;
  name: string;
  carNumber: string;
  raceClass: RaceClass;
  model: string | null;
  carModelSlug: string | null;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
};

export type CarModelSummary = {
  id: number;
  slug: string;
  name: string;
  raceClass: RaceClass;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  imageUrl: string | null;
  entries: number;
};

export type CarModelTeamRef = {
  teamId: number;
  teamName: string;
  carNumber: string;
  raceClass: RaceClass;
};

export type CarModelStats = {
  races: number;
  wins: number;
  podiums: number;
  poles: number;
};

export type CarModelDetail = {
  id: number;
  slug: string;
  name: string;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  imageUrl: string | null;
  category: string | null;
  engine: string | null;
  powerHp: number | null;
  weightKg: number | null;
  yearIntroduced: number | null;
  teams: CarModelTeamRef[];
  stats: CarModelStats;
};

export type StandingDriver = {
  position: number;
  driverId: number;
  driverName: string;
  team: string | null;
  teamId: number | null;
  manufacturerLogoUrl: string | null;
  raceClass: RaceClass;
  points: number;
};

export type ProgressionPoint = {
  round: number;
  cumulativePoints: number;
};

export type DriverProgression = {
  isEstimate?: boolean;
  driverId: number;
  driverName: string;
  points: ProgressionPoint[];
};

export type ManufacturerProgression = {
  isEstimate?: boolean;
  manufacturerId: number;
  manufacturerName: string;
  points: ProgressionPoint[];
};

export type TeamProgression = {
  isEstimate?: boolean;
  teamId: number;
  teamName: string;
  carNumber: string;
  points: ProgressionPoint[];
};

export type PodiumCar = {
  classPosition: number;
  carNumber: string;
  team: string;
  teamId: number;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  drivers: string;
};

export type RoundPodium = {
  eventId: number;
  round: number;
  eventName: string;
  podium: PodiumCar[];
};

export type StandingTeam = {
  position: number;
  teamId: number;
  teamName: string;
  carNumber: string | null;
  manufacturer: string | null;
  manufacturerId: number | null;
  manufacturerLogoUrl: string | null;
  raceClass: RaceClass;
  points: number;
};

export type StandingManufacturer = {
  position: number;
  manufacturerId: number;
  manufacturerName: string;
  manufacturerLogoUrl: string | null;
  raceClass: RaceClass;
  points: number;
};

export type StatRow = {
  id: number;
  name: string;
  photoUrl: string | null;
  logoUrl: string | null;
  titles: number;
};

export type DriverStat = {
  id: number;
  name: string;
  photoUrl: string | null;
  wins: number;
};

export type DriverPodiumStat = {
  id: number;
  name: string;
  photoUrl: string | null;
  podiums: number;
};

export type LeMansWinner = {
  year: number;
  eventId: number;
  manufacturer: string | null;
  manufacturerId: number | null;
  manufacturerLogoUrl: string | null;
  team: string;
  teamId: number;
  carNumber: string;
  drivers: string;
  driverRefs: SessionResultDriverRef[];
};

export type AllTimeStats = {
  driverTitles: StatRow[];
  manufacturerTitles: StatRow[];
  teamTitles: StatRow[];
  driverWins: DriverStat[];
  driverPodiums: DriverPodiumStat[];
  leMansWinners: LeMansWinner[];
};

export type Season = {
  id: number;
  year: number;
  championshipName: string;
};

// --- Fetcher ---
//
// Cache windows are intentionally generous: ingestion runs hourly via
// the Railway cron, so anything with a sub-hour revalidate either
// matches the cron cadence (race weekends) or trades freshness for
// edge-cache hit rate (detail pages users browse between weekends).

type FetchOpts = { revalidate?: number };

export class ApiError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    statusText: string,
  ) {
    super(`GET ${path} → ${status} ${statusText}`);
    this.name = "ApiError";
  }
}

export function isApiNotFound(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 404;
}

async function api<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    next: { revalidate: opts.revalidate ?? 300 },
  });
  if (!res.ok) {
    throw new ApiError(path, res.status, res.statusText);
  }
  return res.json() as Promise<T>;
}

/** Append `year=` to the path if specified. Falsy values omit the param so
 *  the API falls back to its own "latest season" default. */
function withYear(path: string, year?: number | null): string {
  if (!year) return path;
  return `${path}${path.includes("?") ? "&" : "?"}year=${year}`;
}

/**
 * Resolve a volatility window from the cached season schedule. The schedule
 * lookup is shared for an hour and is lightweight; unique entity detail URLs
 * can then stay hot off-week while still dropping to 60 seconds on race week.
 * If the schedule source is unavailable, retain the endpoint's old fallback.
 */
async function raceAwareRevalidate(
  year: number | null | undefined,
  fallback: number,
): Promise<number> {
  try {
    const events = await api<Event[]>(withYear("/api/v1/events", year), {
      revalidate: 3600,
    });
    return seasonDataRevalidateSeconds(events);
  } catch {
    return fallback;
  }
}

/**
 * Resolve the cache window for one event without making every historical
 * round volatile whenever the current championship reaches race week.
 * Events outside the current-season schedule are treated as immutable
 * archives. A schedule outage falls back to the caller's conservative TTL.
 */
async function eventAwareRevalidate(
  eventId: number,
  fallback: number,
): Promise<number> {
  try {
    const events = await api<Event[]>("/api/v1/events", {
      revalidate: 3600,
    });
    const event = events.find((candidate) => candidate.id === eventId);
    return event
      ? eventDataRevalidateSeconds(event)
      : ARCHIVE_REVALIDATE_SECONDS;
  } catch {
    return fallback;
  }
}

// --- Sitemap snapshot ---
//
// Sitemap generation must not reuse the race-weekend fetchers below. Their
// 60-second freshness window is correct for rendered race data, but Next uses
// the shortest fetch revalidation in a static route as that route's ISR TTL.
// Reusing getEvents() therefore made sitemap.xml regenerate every minute even
// though the route itself declares a one-hour revalidation window.
const SITEMAP_REVALIDATE_SECONDS = 3600;
const SITEMAP_YEAR_CONCURRENCY = 2;

export type SitemapYearResources = {
  year: number;
  events: Event[];
  carModels: CarModelSummary[];
};

export type SitemapSnapshot = {
  seasons: Season[];
  yearResources: SitemapYearResources[];
  drivers: DriverEntry[];
  teams: TeamEntry[];
  circuits: Circuit[];
  manufacturers: StandingManufacturer[];
};

/**
 * Build the discovery-only API snapshot consumed by sitemap.xml.
 *
 * Every request deliberately has a one-hour cache window, independently of
 * the faster page-data fetchers. Year resources are fetched by two workers;
 * each worker starts an events + cars pair, capping a cold snapshot at four
 * concurrent backend requests instead of the previous eighteen-request wave.
 */
export async function getSitemapSnapshot(): Promise<SitemapSnapshot> {
  const seasons = await api<Season[]>("/api/v1/seasons", {
    revalidate: SITEMAP_REVALIDATE_SECONDS,
  });
  const years = [...new Set(seasons.map((season) => season.year))].sort(
    (a, b) => b - a,
  );

  if (years.length === 0) {
    return {
      seasons,
      yearResources: [],
      drivers: [],
      teams: [],
      circuits: [],
      manufacturers: [],
    };
  }

  const yearResources = await mapWithConcurrency(
    years,
    SITEMAP_YEAR_CONCURRENCY,
    async (year): Promise<SitemapYearResources> => {
      const [events, carModels] = await Promise.all([
        api<Event[]>(withYear("/api/v1/events", year), {
          revalidate: SITEMAP_REVALIDATE_SECONDS,
        }),
        api<CarModelSummary[]>(withYear("/api/v1/cars", year), {
          revalidate: SITEMAP_REVALIDATE_SECONDS,
        }),
      ]);
      return { year, events, carModels };
    },
  );

  const latestYear = years[0]!;
  const [drivers, teams, circuits, manufacturers] = await Promise.all([
    api<DriverEntry[]>(withYear("/api/v1/drivers", latestYear), {
      revalidate: SITEMAP_REVALIDATE_SECONDS,
    }),
    api<TeamEntry[]>(withYear("/api/v1/teams", latestYear), {
      revalidate: SITEMAP_REVALIDATE_SECONDS,
    }),
    api<Circuit[]>(withYear("/api/v1/circuits", latestYear), {
      revalidate: SITEMAP_REVALIDATE_SECONDS,
    }),
    api<StandingManufacturer[]>(
      withYear(
        "/api/v1/standings/manufacturers?raceClass=HYPERCAR",
        latestYear,
      ),
      { revalidate: SITEMAP_REVALIDATE_SECONDS },
    ),
  ]);

  return {
    seasons,
    yearResources,
    drivers,
    teams,
    circuits,
    manufacturers,
  };
}

// --- Endpoints ---

export const getSeasons = () =>
  api<Season[]>("/api/v1/seasons", { revalidate: 3600 });

export const getAllTimeStats = async (opts: FetchOpts = {}) =>
  api<AllTimeStats>("/api/v1/stats/all-time", {
    revalidate: opts.revalidate ?? (await raceAwareRevalidate(null, 3600)),
  });

// Circuits / drivers / teams change rarely during a season — 1 hour.
export const getCircuits = (year?: number | null) =>
  api<Circuit[]>(withYear("/api/v1/circuits", year), { revalidate: 3600 });

export const getCircuit = async (id: number, opts: FetchOpts = {}) =>
  api<CircuitDetail>(`/api/v1/circuits/${id}`, {
    revalidate: opts.revalidate ?? (await raceAwareRevalidate(null, 3600)),
  });

export const getDrivers = (year?: number | null) =>
  api<DriverEntry[]>(withYear("/api/v1/drivers", year), { revalidate: 3600 });

// Result-derived detail pages follow the season schedule: one minute around
// a race weekend, one hour between rounds, and one day for finished seasons.
export const getDriver = async (
  id: number,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<DriverDetail>(withYear(`/api/v1/drivers/${id}`, year), {
    revalidate: opts.revalidate ?? (await raceAwareRevalidate(year, 600)),
  });

export const getTeams = (year?: number | null) =>
  api<TeamEntry[]>(withYear("/api/v1/teams", year), { revalidate: 600 });

export const getTeam = async (
  id: number,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<TeamDetail>(withYear(`/api/v1/teams/${id}`, year), {
    revalidate: opts.revalidate ?? (await raceAwareRevalidate(year, 600)),
  });

export const getManufacturer = async (
  id: number,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<ManufacturerDetail>(withYear(`/api/v1/manufacturers/${id}`, year), {
    revalidate: opts.revalidate ?? (await raceAwareRevalidate(year, 600)),
  });

export const getCarModels = (year?: number | null) =>
  api<CarModelSummary[]>(withYear("/api/v1/cars", year), { revalidate: 1800 });

export const getCarModel = async (
  slug: string,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<CarModelDetail>(withYear(`/api/v1/cars/${slug}`, year), {
    revalidate: opts.revalidate ?? (await raceAwareRevalidate(year, 600)),
  });

export type BopRow = {
  carModelId: number;
  carModelSlug: string;
  carModelName: string;
  manufacturerLogoUrl: string | null;
  minWeightKg: number | null;
  maxPowerKw: number | null;
  maxEnergyPerStintMj: number | null;
  successHandicapKg: number | null;
};

export type BopEvent = {
  eventId: number;
  round: number;
  eventName: string;
  rows: BopRow[];
};

export const getBop = (year?: number | null) =>
  api<BopEvent[]>(withYear("/api/v1/bop", year), { revalidate: 3600 });

// This shared schedule snapshot is lightweight and also drives race-window
// selection for the result endpoints below.
export const getEvents = (year?: number | null) =>
  api<Event[]>(withYear("/api/v1/events", year), { revalidate: 3600 });

// Event detail contains the schedule and session IDs. Only a matching current
// season event follows its race window; historical event IDs stay on a daily
// cache even while a different round is live.
export const getEvent = async (id: number, opts: FetchOpts = {}) =>
  api<EventDetail>(`/api/v1/events/${id}`, {
    revalidate: opts.revalidate ?? (await eventAwareRevalidate(id, 3600)),
  });

export const getSessionResults = (
  sessionId: number,
  opts: FetchOpts = {},
) =>
  api<SessionResult[]>(`/api/v1/sessions/${sessionId}/results`, {
    revalidate: opts.revalidate ?? 60,
  });

export type LapChartCar = {
  carNumber: string;
  team: string;
  raceClass: RaceClass;
  drivers: string;
  lapNumbers: number[];
  positions: number[];
  classPositions: number[];
};

export type LapChartIncident = {
  startLap: number;
  endLap: number;
};

export type LapChart = {
  cars: LapChartCar[];
  totalLaps: number;
  incidents: LapChartIncident[];
};

// Callers on race pages pass the event-aware window. The five-minute default
// remains a conservative fallback for any standalone consumer.
export const getLapChart = (sessionId: number, opts: FetchOpts = {}) =>
  api<LapChart>(`/api/v1/sessions/${sessionId}/lap-chart`, {
    revalidate: opts.revalidate ?? 300,
  });

export type PitStop = {
  carNumber: string;
  team: string;
  teamId: number | null;
  raceClass: RaceClass;
  lap: number;
  durationMs: number | null;
};

export const getPitStops = (sessionId: number, opts: FetchOpts = {}) =>
  api<PitStop[]>(`/api/v1/sessions/${sessionId}/pit-stops`, {
    revalidate: opts.revalidate ?? 300,
  });

export type SessionWeather = {
  airTempC: number | null;
  trackTempC: number | null;
  humidityPct: number | null;
  windKph: number | null;
  rain: boolean;
};

export const getSessionWeather = (sessionId: number, opts: FetchOpts = {}) =>
  api<SessionWeather>(`/api/v1/sessions/${sessionId}/weather`, {
    revalidate: opts.revalidate ?? 600,
  });

// Race-aware pages pass 60/3600/86400 explicitly. Five minutes remains a
// conservative fallback for standalone consumers without a season schedule.
export const getDriverStandings = (
  raceClass?: RaceClass,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<StandingDriver[]>(
    withYear(
      `/api/v1/standings/drivers${raceClass ? `?raceClass=${raceClass}` : ""}`,
      year,
    ),
    { revalidate: opts.revalidate ?? 300 },
  );

export const getDriverProgression = (
  raceClass: RaceClass,
  limit = 5,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<DriverProgression[]>(
    withYear(
      `/api/v1/standings/drivers/progression?raceClass=${raceClass}&limit=${limit}`,
      year,
    ),
    { revalidate: opts.revalidate ?? 300 },
  );

export const getManufacturerProgression = (
  raceClass: RaceClass,
  limit = 8,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<ManufacturerProgression[]>(
    withYear(
      `/api/v1/standings/manufacturers/progression?raceClass=${raceClass}&limit=${limit}`,
      year,
    ),
    { revalidate: opts.revalidate ?? 300 },
  );

export const getTeamProgression = (
  raceClass: RaceClass,
  limit = 8,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<TeamProgression[]>(
    withYear(
      `/api/v1/standings/teams/progression?raceClass=${raceClass}&limit=${limit}`,
      year,
    ),
    { revalidate: opts.revalidate ?? 300 },
  );

export const getRoundPodiums = (
  raceClass: RaceClass,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<RoundPodium[]>(
    withYear(`/api/v1/standings/podiums?raceClass=${raceClass}`, year),
    { revalidate: opts.revalidate ?? 300 },
  );

export const getTeamStandings = (
  raceClass?: RaceClass,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<StandingTeam[]>(
    withYear(
      `/api/v1/standings/teams${raceClass ? `?raceClass=${raceClass}` : ""}`,
      year,
    ),
    { revalidate: opts.revalidate ?? 300 },
  );

export const getManufacturerStandings = (
  raceClass?: RaceClass,
  year?: number | null,
  opts: FetchOpts = {},
) =>
  api<StandingManufacturer[]>(
    withYear(
      `/api/v1/standings/manufacturers${
        raceClass ? `?raceClass=${raceClass}` : ""
      }`,
      year,
    ),
    { revalidate: opts.revalidate ?? 300 },
  );

// --- Derived helpers (mock-data parity) ---

export type EventStatus = "completed" | "upcoming" | "live";

export function eventStatus(
  event: Event,
  today: Date = new Date(),
): EventStatus {
  const todayIso = today.toISOString().slice(0, 10);
  if (event.dateEnd < todayIso) return "completed";
  if (event.dateStart > todayIso) return "upcoming";
  return "live";
}

export function getNextEvent(
  events: Event[],
  today: Date = new Date(),
): Event | undefined {
  const todayIso = today.toISOString().slice(0, 10);
  return events.find((e) => e.dateStart >= todayIso);
}

export function getUpcomingEvents(
  events: Event[],
  count: number,
  today: Date = new Date(),
): Event[] {
  const todayIso = today.toISOString().slice(0, 10);
  return events.filter((e) => e.dateStart >= todayIso).slice(0, count);
}

export function getLastCompletedEvent(
  events: Event[],
  today: Date = new Date(),
): Event | undefined {
  const todayIso = today.toISOString().slice(0, 10);
  const completed = events.filter((e) => e.dateEnd < todayIso);
  return completed[completed.length - 1];
}

// Sessions returned by the API are already in canonical order (FP1→RACE).
export function getSessionByType(
  sessions: Session[],
  type: string,
): Session | undefined {
  return sessions.find((s) => s.type === type);
}
