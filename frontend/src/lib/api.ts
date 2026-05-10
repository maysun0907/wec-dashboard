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
};

export type EventDetail = Event & { sessions: Session[] };

export type SessionResultDriverRef = {
  id: number;
  name: string;
};

export type SessionResult = {
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
  driverId: number;
  driverName: string;
  points: ProgressionPoint[];
};

export type ManufacturerProgression = {
  manufacturerId: number;
  manufacturerName: string;
  points: ProgressionPoint[];
};

export type TeamProgression = {
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

type FetchOpts = { revalidate?: number };

async function api<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    next: { revalidate: opts.revalidate ?? 300 },
  });
  if (!res.ok) {
    throw new Error(`GET ${path} → ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

/** Append `year=` to the path if specified. Falsy values omit the param so
 *  the API falls back to its own "latest season" default. */
function withYear(path: string, year?: number | null): string {
  if (!year) return path;
  return `${path}${path.includes("?") ? "&" : "?"}year=${year}`;
}

// --- Endpoints ---

export const getSeasons = () =>
  api<Season[]>("/api/v1/seasons", { revalidate: 3600 });

export const getAllTimeStats = () =>
  api<AllTimeStats>("/api/v1/stats/all-time", { revalidate: 3600 });

// Circuits / drivers / teams change rarely during a season — 1 hour.
export const getCircuits = (year?: number | null) =>
  api<Circuit[]>(withYear("/api/v1/circuits", year), { revalidate: 3600 });

export const getCircuit = (id: number) =>
  api<CircuitDetail>(`/api/v1/circuits/${id}`, { revalidate: 3600 });

export const getDrivers = (year?: number | null) =>
  api<DriverEntry[]>(withYear("/api/v1/drivers", year), { revalidate: 3600 });

export const getDriver = (id: number, year?: number | null) =>
  api<DriverDetail>(withYear(`/api/v1/drivers/${id}`, year), {
    revalidate: 60,
  });

export const getTeams = (year?: number | null) =>
  api<TeamEntry[]>(withYear("/api/v1/teams", year), { revalidate: 600 });

export const getTeam = (id: number, year?: number | null) =>
  api<TeamDetail>(withYear(`/api/v1/teams/${id}`, year), { revalidate: 60 });

export const getManufacturer = (id: number, year?: number | null) =>
  api<ManufacturerDetail>(withYear(`/api/v1/manufacturers/${id}`, year), {
    revalidate: 60,
  });

export const getCarModels = (year?: number | null) =>
  api<CarModelSummary[]>(withYear("/api/v1/cars", year), { revalidate: 600 });

export const getCarModel = (slug: string, year?: number | null) =>
  api<CarModelDetail>(withYear(`/api/v1/cars/${slug}`, year), {
    revalidate: 60,
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

// Status flips (upcoming → live → completed) and ingestion lands new
// session results on race weekends — keep the freshness window under
// the cron tick (hourly) so a refresh always shows the latest pull.
export const getEvents = (year?: number | null) =>
  api<Event[]>(withYear("/api/v1/events", year), { revalidate: 60 });

export const getEvent = (id: number) =>
  api<EventDetail>(`/api/v1/events/${id}`, { revalidate: 60 });

export const getSessionResults = (sessionId: number) =>
  api<SessionResult[]>(`/api/v1/sessions/${sessionId}/results`, {
    revalidate: 60,
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

// Lap charts are still immutable post-race but ingestion can land
// updated lap rows mid-event; 5 min keeps them current without
// re-running the position math on every page hit.
export const getLapChart = (sessionId: number) =>
  api<LapChart>(`/api/v1/sessions/${sessionId}/lap-chart`, {
    revalidate: 300,
  });

export type PitStop = {
  carNumber: string;
  team: string;
  teamId: number | null;
  raceClass: RaceClass;
  lap: number;
  durationMs: number | null;
};

export const getPitStops = (sessionId: number) =>
  api<PitStop[]>(`/api/v1/sessions/${sessionId}/pit-stops`, {
    revalidate: 300,
  });

export type SessionWeather = {
  airTempC: number | null;
  trackTempC: number | null;
  humidityPct: number | null;
  windKph: number | null;
  rain: boolean;
};

export const getSessionWeather = (sessionId: number) =>
  api<SessionWeather>(`/api/v1/sessions/${sessionId}/weather`, {
    revalidate: 600,
  });

export const getDriverStandings = (
  raceClass?: RaceClass,
  year?: number | null,
) =>
  api<StandingDriver[]>(
    withYear(
      `/api/v1/standings/drivers${raceClass ? `?raceClass=${raceClass}` : ""}`,
      year,
    ),
    { revalidate: 60 },
  );

export const getDriverProgression = (
  raceClass: RaceClass,
  limit = 5,
  year?: number | null,
) =>
  api<DriverProgression[]>(
    withYear(
      `/api/v1/standings/drivers/progression?raceClass=${raceClass}&limit=${limit}`,
      year,
    ),
    { revalidate: 60 },
  );

export const getManufacturerProgression = (
  raceClass: RaceClass,
  limit = 8,
  year?: number | null,
) =>
  api<ManufacturerProgression[]>(
    withYear(
      `/api/v1/standings/manufacturers/progression?raceClass=${raceClass}&limit=${limit}`,
      year,
    ),
    { revalidate: 60 },
  );

export const getTeamProgression = (
  raceClass: RaceClass,
  limit = 8,
  year?: number | null,
) =>
  api<TeamProgression[]>(
    withYear(
      `/api/v1/standings/teams/progression?raceClass=${raceClass}&limit=${limit}`,
      year,
    ),
    { revalidate: 60 },
  );

export const getRoundPodiums = (raceClass: RaceClass, year?: number | null) =>
  api<RoundPodium[]>(
    withYear(`/api/v1/standings/podiums?raceClass=${raceClass}`, year),
    { revalidate: 60 },
  );

export const getTeamStandings = (
  raceClass?: RaceClass,
  year?: number | null,
) =>
  api<StandingTeam[]>(
    withYear(
      `/api/v1/standings/teams${raceClass ? `?raceClass=${raceClass}` : ""}`,
      year,
    ),
    { revalidate: 60 },
  );

export const getManufacturerStandings = (
  raceClass?: RaceClass,
  year?: number | null,
) =>
  api<StandingManufacturer[]>(
    withYear(
      `/api/v1/standings/manufacturers${
        raceClass ? `?raceClass=${raceClass}` : ""
      }`,
      year,
    ),
    { revalidate: 60 },
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
