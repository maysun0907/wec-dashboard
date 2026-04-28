// API client for the WEC Dashboard backend.
//
// All `fetch` calls run server-side (Server Components) and use Next.js
// time-based revalidation. Tune per resource by data volatility.

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// --- Types (mirror backend Pydantic schemas, camelCase) ---

// Schema keeps LMP2 as a valid value (it may return as a one-off Le Mans
// category in some seasons) but the 2026 WEC grid only has Hypercar + LMGT3.
// Drop LMP2 from RACE_CLASSES so empty tabs don't render.
export type RaceClass = "HYPERCAR" | "LMP2" | "LMGT3";

export const RACE_CLASSES: RaceClass[] = ["HYPERCAR", "LMGT3"];

export type Circuit = {
  id: number;
  name: string;
  country: string;
  lengthKm: number;
  lapRecord: string | null;
};

export type Event = {
  id: number;
  round: number;
  name: string;
  dateStart: string; // ISO date
  dateEnd: string;
  format: string | null;
  circuit: Circuit;
};

export type Session = {
  id: number;
  type: string; // "FP1" | "FP2" | "FP3" | "Q" | "RACE"
  startTime: string | null;
};

export type EventDetail = Event & { sessions: Session[] };

export type SessionResult = {
  position: number; // overall
  classPosition: number;
  pointsAwarded: number;
  carNumber: string;
  team: string;
  drivers: string;
  raceClass: RaceClass;
  laps: number | null;
  gap: string | null;
  bestLap: string | null;
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

export type DriverDetail = {
  id: number;
  name: string;
  nationality: string | null;
  carNumber: string | null;
  team: string | null;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  photoUrl: string | null;
  raceClass: RaceClass | null;
  carModel: string | null;
  coDrivers: DriverRef[];
  results: DriverResult[];
  standing: DriverStandingRef | null;
};

export type TeamCar = {
  carId: number;
  number: string;
  raceClass: RaceClass;
  model: string | null;
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

export type TeamDetail = {
  id: number;
  name: string;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  cars: TeamCar[];
  results: TeamResult[];
};

export type ManufacturerCar = {
  carId: number;
  carNumber: string;
  raceClass: RaceClass;
  teamId: number;
  teamName: string;
  model: string | null;
  drivers: DriverRef[];
};

export type ManufacturerResult = {
  eventId: number;
  round: number;
  eventName: string;
  carNumber: string;
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

export type ManufacturerDetail = {
  id: number;
  name: string;
  country: string | null;
  logoUrl: string | null;
  cars: ManufacturerCar[];
  results: ManufacturerResult[];
  standings: ManufacturerStandingItem[];
};

export type CircuitWinner = {
  raceClass: RaceClass;
  carNumber: string;
  team: string;
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
  events: CircuitEventEntry[];
};

export type TeamEntry = {
  id: number;
  name: string;
  carNumber: string;
  raceClass: RaceClass;
  model: string | null;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
};

export type StandingDriver = {
  position: number;
  driverId: number;
  driverName: string;
  team: string | null;
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

export type StandingTeam = {
  position: number;
  teamId: number;
  teamName: string;
  carNumber: string | null;
  manufacturer: string | null;
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

export type Season = {
  id: number;
  year: number;
  championshipName: string;
};

// --- Fetcher ---

type FetchOpts = { revalidate?: number };

async function api<T>(path: string, opts: FetchOpts = {}): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    next: { revalidate: opts.revalidate ?? 600 },
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

// Circuits / drivers / teams change rarely during a season — 1 hour.
export const getCircuits = () =>
  api<Circuit[]>("/api/v1/circuits", { revalidate: 3600 });

export const getCircuit = (id: number) =>
  api<CircuitDetail>(`/api/v1/circuits/${id}`, { revalidate: 3600 });

export const getDrivers = (year?: number | null) =>
  api<DriverEntry[]>(withYear("/api/v1/drivers", year), { revalidate: 3600 });

export const getDriver = (id: number, year?: number | null) =>
  api<DriverDetail>(withYear(`/api/v1/drivers/${id}`, year), {
    revalidate: 600,
  });

export const getTeams = (year?: number | null) =>
  api<TeamEntry[]>(withYear("/api/v1/teams", year), { revalidate: 3600 });

export const getTeam = (id: number, year?: number | null) =>
  api<TeamDetail>(withYear(`/api/v1/teams/${id}`, year), { revalidate: 600 });

export const getManufacturer = (id: number, year?: number | null) =>
  api<ManufacturerDetail>(withYear(`/api/v1/manufacturers/${id}`, year), {
    revalidate: 600,
  });

// Events change occasionally (status transitions) — 10 minutes.
export const getEvents = (year?: number | null) =>
  api<Event[]>(withYear("/api/v1/events", year), { revalidate: 600 });

export const getEvent = (id: number) =>
  api<EventDetail>(`/api/v1/events/${id}`, { revalidate: 600 });

// Results and standings update on race weekends — 5 minutes.
export const getSessionResults = (sessionId: number) =>
  api<SessionResult[]>(`/api/v1/sessions/${sessionId}/results`, {
    revalidate: 300,
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
    { revalidate: 300 },
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
    { revalidate: 300 },
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
    { revalidate: 300 },
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
    { revalidate: 300 },
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
    { revalidate: 300 },
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
    { revalidate: 300 },
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
