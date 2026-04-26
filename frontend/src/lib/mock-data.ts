// Placeholder data for UI development — will be replaced by API responses
// once the backend (Phase 2) is in place.

export type RaceClass = "HYPERCAR" | "LMP2" | "LMGT3";

export type Circuit = {
  id: string;
  name: string;
  country: string;
  lengthKm: number;
  lapRecord?: string;
};

export type WecEvent = {
  id: string;
  round: number;
  name: string;
  circuitId: string;
  startDate: string; // ISO
  endDate: string; // ISO
  format: string; // "6 Hours" / "24 Hours" / "1812 km" etc.
  status: "completed" | "upcoming" | "live";
};

export type Driver = {
  id: string;
  name: string;
  nationality: string; // ISO 3166-1 alpha-3
  carNumber: number;
  teamId: string;
  raceClass: RaceClass;
};

export type Team = {
  id: string;
  name: string;
  manufacturer: string;
  carNumber: number;
  raceClass: RaceClass;
};

export type StandingRow = {
  position: number;
  entityId: string;
  name: string;
  detail?: string; // team for driver, manufacturer for team, etc.
  raceClass: RaceClass;
  points: number;
};

export type SessionResultRow = {
  position: number;
  carNumber: number;
  team: string;
  drivers: string;
  raceClass: RaceClass;
  laps: number;
  gap: string; // "+12.345" or "—" for leader
};

export const CURRENT_SEASON = 2026;

export const CIRCUITS: Circuit[] = [
  { id: "qatar", name: "Lusail International Circuit", country: "QAT", lengthKm: 5.419 },
  { id: "imola", name: "Autodromo Enzo e Dino Ferrari", country: "ITA", lengthKm: 4.909 },
  { id: "spa", name: "Circuit de Spa-Francorchamps", country: "BEL", lengthKm: 7.004 },
  { id: "lemans", name: "Circuit de la Sarthe", country: "FRA", lengthKm: 13.626 },
  { id: "interlagos", name: "Autódromo José Carlos Pace", country: "BRA", lengthKm: 4.309 },
  { id: "cota", name: "Circuit of the Americas", country: "USA", lengthKm: 5.513 },
  { id: "fuji", name: "Fuji Speedway", country: "JPN", lengthKm: 4.563 },
  { id: "bahrain", name: "Bahrain International Circuit", country: "BHR", lengthKm: 5.412 },
];

export const EVENTS: WecEvent[] = [
  {
    id: "2026-r1-qatar",
    round: 1,
    name: "Qatar 1812 km",
    circuitId: "qatar",
    startDate: "2026-02-27",
    endDate: "2026-02-28",
    format: "1812 km",
    status: "completed",
  },
  {
    id: "2026-r2-imola",
    round: 2,
    name: "6 Hours of Imola",
    circuitId: "imola",
    startDate: "2026-04-18",
    endDate: "2026-04-18",
    format: "6 Hours",
    status: "completed",
  },
  {
    id: "2026-r3-spa",
    round: 3,
    name: "TotalEnergies 6 Hours of Spa-Francorchamps",
    circuitId: "spa",
    startDate: "2026-05-09",
    endDate: "2026-05-09",
    format: "6 Hours",
    status: "upcoming",
  },
  {
    id: "2026-r4-lemans",
    round: 4,
    name: "24 Hours of Le Mans",
    circuitId: "lemans",
    startDate: "2026-06-13",
    endDate: "2026-06-14",
    format: "24 Hours",
    status: "upcoming",
  },
  {
    id: "2026-r5-interlagos",
    round: 5,
    name: "Rolex 6 Hours of São Paulo",
    circuitId: "interlagos",
    startDate: "2026-07-12",
    endDate: "2026-07-12",
    format: "6 Hours",
    status: "upcoming",
  },
  {
    id: "2026-r6-cota",
    round: 6,
    name: "Lone Star Le Mans",
    circuitId: "cota",
    startDate: "2026-09-05",
    endDate: "2026-09-05",
    format: "6 Hours",
    status: "upcoming",
  },
  {
    id: "2026-r7-fuji",
    round: 7,
    name: "6 Hours of Fuji",
    circuitId: "fuji",
    startDate: "2026-09-27",
    endDate: "2026-09-27",
    format: "6 Hours",
    status: "upcoming",
  },
  {
    id: "2026-r8-bahrain",
    round: 8,
    name: "Bapco Energies 8 Hours of Bahrain",
    circuitId: "bahrain",
    startDate: "2026-11-07",
    endDate: "2026-11-07",
    format: "8 Hours",
    status: "upcoming",
  },
];

export const TEAMS: Team[] = [
  { id: "ferrari-51", name: "Ferrari AF Corse", manufacturer: "Ferrari", carNumber: 51, raceClass: "HYPERCAR" },
  { id: "ferrari-50", name: "Ferrari AF Corse", manufacturer: "Ferrari", carNumber: 50, raceClass: "HYPERCAR" },
  { id: "ferrari-83", name: "AF Corse", manufacturer: "Ferrari", carNumber: 83, raceClass: "HYPERCAR" },
  { id: "toyota-7", name: "Toyota Gazoo Racing", manufacturer: "Toyota", carNumber: 7, raceClass: "HYPERCAR" },
  { id: "toyota-8", name: "Toyota Gazoo Racing", manufacturer: "Toyota", carNumber: 8, raceClass: "HYPERCAR" },
  { id: "porsche-6", name: "Porsche Penske Motorsport", manufacturer: "Porsche", carNumber: 6, raceClass: "HYPERCAR" },
  { id: "porsche-5", name: "Porsche Penske Motorsport", manufacturer: "Porsche", carNumber: 5, raceClass: "HYPERCAR" },
  { id: "cadillac-12", name: "Cadillac Hertz Team Jota", manufacturer: "Cadillac", carNumber: 12, raceClass: "HYPERCAR" },
  { id: "bmw-15", name: "BMW M Team WRT", manufacturer: "BMW", carNumber: 15, raceClass: "HYPERCAR" },
  { id: "alpine-36", name: "Alpine Endurance Team", manufacturer: "Alpine", carNumber: 36, raceClass: "HYPERCAR" },
];

export const DRIVERS: Driver[] = [
  { id: "kubica", name: "Robert Kubica", nationality: "POL", carNumber: 83, teamId: "ferrari-83", raceClass: "HYPERCAR" },
  { id: "ye-yifei", name: "Yifei Ye", nationality: "CHN", carNumber: 83, teamId: "ferrari-83", raceClass: "HYPERCAR" },
  { id: "hanson", name: "Phil Hanson", nationality: "GBR", carNumber: 83, teamId: "ferrari-83", raceClass: "HYPERCAR" },
  { id: "pier-guidi", name: "Alessandro Pier Guidi", nationality: "ITA", carNumber: 51, teamId: "ferrari-51", raceClass: "HYPERCAR" },
  { id: "calado", name: "James Calado", nationality: "GBR", carNumber: 51, teamId: "ferrari-51", raceClass: "HYPERCAR" },
  { id: "giovinazzi", name: "Antonio Giovinazzi", nationality: "ITA", carNumber: 51, teamId: "ferrari-51", raceClass: "HYPERCAR" },
  { id: "fuoco", name: "Antonio Fuoco", nationality: "ITA", carNumber: 50, teamId: "ferrari-50", raceClass: "HYPERCAR" },
  { id: "molina", name: "Miguel Molina", nationality: "ESP", carNumber: 50, teamId: "ferrari-50", raceClass: "HYPERCAR" },
  { id: "nielsen", name: "Nicklas Nielsen", nationality: "DNK", carNumber: 50, teamId: "ferrari-50", raceClass: "HYPERCAR" },
  { id: "kobayashi", name: "Kamui Kobayashi", nationality: "JPN", carNumber: 7, teamId: "toyota-7", raceClass: "HYPERCAR" },
  { id: "lopez", name: "José María López", nationality: "ARG", carNumber: 7, teamId: "toyota-7", raceClass: "HYPERCAR" },
  { id: "buemi", name: "Sébastien Buemi", nationality: "CHE", carNumber: 8, teamId: "toyota-8", raceClass: "HYPERCAR" },
  { id: "hirakawa", name: "Ryo Hirakawa", nationality: "JPN", carNumber: 8, teamId: "toyota-8", raceClass: "HYPERCAR" },
  { id: "estre", name: "Kévin Estre", nationality: "FRA", carNumber: 6, teamId: "porsche-6", raceClass: "HYPERCAR" },
  { id: "vanthoor", name: "Laurens Vanthoor", nationality: "BEL", carNumber: 6, teamId: "porsche-6", raceClass: "HYPERCAR" },
];

export type ClassStandings = {
  drivers: StandingRow[];
  teams: StandingRow[];
  manufacturers?: StandingRow[];
};

export const RACE_CLASSES: RaceClass[] = ["HYPERCAR", "LMP2", "LMGT3"];

export const STANDINGS: Record<RaceClass, ClassStandings> = {
  HYPERCAR: {
    drivers: [
      { position: 1, entityId: "kubica", name: "Kubica / Ye / Hanson", detail: "AF Corse — Ferrari", raceClass: "HYPERCAR", points: 50 },
      { position: 2, entityId: "pier-guidi", name: "Pier Guidi / Calado / Giovinazzi", detail: "Ferrari AF Corse", raceClass: "HYPERCAR", points: 38 },
      { position: 3, entityId: "fuoco", name: "Fuoco / Molina / Nielsen", detail: "Ferrari AF Corse", raceClass: "HYPERCAR", points: 32 },
      { position: 4, entityId: "kobayashi", name: "Kobayashi / López", detail: "Toyota Gazoo Racing", raceClass: "HYPERCAR", points: 28 },
      { position: 5, entityId: "estre", name: "Estre / Vanthoor", detail: "Porsche Penske Motorsport", raceClass: "HYPERCAR", points: 24 },
    ],
    teams: [
      { position: 1, entityId: "ferrari-83", name: "AF Corse #83", detail: "Ferrari", raceClass: "HYPERCAR", points: 50 },
      { position: 2, entityId: "ferrari-51", name: "Ferrari AF Corse #51", detail: "Ferrari", raceClass: "HYPERCAR", points: 38 },
      { position: 3, entityId: "ferrari-50", name: "Ferrari AF Corse #50", detail: "Ferrari", raceClass: "HYPERCAR", points: 32 },
      { position: 4, entityId: "toyota-7", name: "Toyota Gazoo Racing #7", detail: "Toyota", raceClass: "HYPERCAR", points: 28 },
      { position: 5, entityId: "porsche-6", name: "Porsche Penske Motorsport #6", detail: "Porsche", raceClass: "HYPERCAR", points: 24 },
    ],
    manufacturers: [
      { position: 1, entityId: "ferrari", name: "Ferrari", raceClass: "HYPERCAR", points: 95 },
      { position: 2, entityId: "toyota", name: "Toyota", raceClass: "HYPERCAR", points: 58 },
      { position: 3, entityId: "porsche", name: "Porsche", raceClass: "HYPERCAR", points: 47 },
      { position: 4, entityId: "cadillac", name: "Cadillac", raceClass: "HYPERCAR", points: 31 },
      { position: 5, entityId: "bmw", name: "BMW", raceClass: "HYPERCAR", points: 22 },
    ],
  },
  LMP2: {
    drivers: [
      { position: 1, entityId: "ao-tf-22", name: "Vautier / Costa / Doquin", detail: "AO by TF — Oreca 07", raceClass: "LMP2", points: 44 },
      { position: 2, entityId: "ieurop-43", name: "Pin / Yifei / Caldwell", detail: "Inter Europol — Oreca 07", raceClass: "LMP2", points: 36 },
      { position: 3, entityId: "vector-10", name: "Cullen / Bell / Ricci", detail: "Vector Sport — Oreca 07", raceClass: "LMP2", points: 30 },
      { position: 4, entityId: "idec-28", name: "Lapierre / Chatin / Andrade", detail: "IDEC Sport — Oreca 07", raceClass: "LMP2", points: 24 },
      { position: 5, entityId: "nielsen-24", name: "Hodes / Cassidy / Nielsen", detail: "Nielsen Racing — Oreca 07", raceClass: "LMP2", points: 18 },
    ],
    teams: [
      { position: 1, entityId: "ao-tf-22", name: "AO by TF #22", detail: "Oreca 07", raceClass: "LMP2", points: 44 },
      { position: 2, entityId: "ieurop-43", name: "Inter Europol Competition #43", detail: "Oreca 07", raceClass: "LMP2", points: 36 },
      { position: 3, entityId: "vector-10", name: "Vector Sport #10", detail: "Oreca 07", raceClass: "LMP2", points: 30 },
      { position: 4, entityId: "idec-28", name: "IDEC Sport #28", detail: "Oreca 07", raceClass: "LMP2", points: 24 },
      { position: 5, entityId: "nielsen-24", name: "Nielsen Racing #24", detail: "Oreca 07", raceClass: "LMP2", points: 18 },
    ],
  },
  LMGT3: {
    drivers: [
      { position: 1, entityId: "manthey-92", name: "Andlauer / Schuring / Lietz", detail: "Manthey EMA — Porsche", raceClass: "LMGT3", points: 46 },
      { position: 2, entityId: "wrt-46", name: "Rossi / Martin / van der Linde", detail: "Team WRT — BMW", raceClass: "LMGT3", points: 40 },
      { position: 3, entityId: "vista-21", name: "Mann / Rovera / Riccitelli", detail: "Vista AF Corse — Ferrari", raceClass: "LMGT3", points: 34 },
      { position: 4, entityId: "united-59", name: "Cottingham / Caygill / Sales", detail: "United Autosports — McLaren", raceClass: "LMGT3", points: 28 },
      { position: 5, entityId: "ironlynx-77", name: "Frey / Bovy / Gatting", detail: "Iron Dames — Mercedes-AMG", raceClass: "LMGT3", points: 20 },
    ],
    teams: [
      { position: 1, entityId: "manthey-92", name: "Manthey EMA #92", detail: "Porsche 911 GT3 R", raceClass: "LMGT3", points: 46 },
      { position: 2, entityId: "wrt-46", name: "Team WRT #46", detail: "BMW M4 GT3 EVO", raceClass: "LMGT3", points: 40 },
      { position: 3, entityId: "vista-21", name: "Vista AF Corse #21", detail: "Ferrari 296 GT3", raceClass: "LMGT3", points: 34 },
      { position: 4, entityId: "united-59", name: "United Autosports #59", detail: "McLaren 720S GT3 EVO", raceClass: "LMGT3", points: 28 },
      { position: 5, entityId: "ironlynx-77", name: "Iron Dames #77", detail: "Mercedes-AMG GT3", raceClass: "LMGT3", points: 20 },
    ],
    manufacturers: [
      { position: 1, entityId: "porsche", name: "Porsche", raceClass: "LMGT3", points: 72 },
      { position: 2, entityId: "bmw", name: "BMW", raceClass: "LMGT3", points: 58 },
      { position: 3, entityId: "ferrari", name: "Ferrari", raceClass: "LMGT3", points: 49 },
      { position: 4, entityId: "mclaren", name: "McLaren", raceClass: "LMGT3", points: 36 },
      { position: 5, entityId: "mercedes", name: "Mercedes-AMG", raceClass: "LMGT3", points: 28 },
    ],
  },
};

// Backwards-compat aliases — home page reads top Hypercar rows.
export const DRIVER_STANDINGS: StandingRow[] = STANDINGS.HYPERCAR.drivers;
export const TEAM_STANDINGS: StandingRow[] = STANDINGS.HYPERCAR.teams;
export const MANUFACTURER_STANDINGS: StandingRow[] =
  STANDINGS.HYPERCAR.manufacturers ?? [];

// Last completed event: R2 Imola — top 5 in Hypercar
export const LAST_RACE_RESULT: SessionResultRow[] = [
  { position: 1, carNumber: 83, team: "AF Corse", drivers: "Kubica / Ye / Hanson", raceClass: "HYPERCAR", laps: 174, gap: "—" },
  { position: 2, carNumber: 51, team: "Ferrari AF Corse", drivers: "Pier Guidi / Calado / Giovinazzi", raceClass: "HYPERCAR", laps: 174, gap: "+8.412" },
  { position: 3, carNumber: 7, team: "Toyota Gazoo Racing", drivers: "Kobayashi / López", raceClass: "HYPERCAR", laps: 174, gap: "+15.207" },
  { position: 4, carNumber: 6, team: "Porsche Penske Motorsport", drivers: "Estre / Vanthoor", raceClass: "HYPERCAR", laps: 174, gap: "+22.843" },
  { position: 5, carNumber: 50, team: "Ferrari AF Corse", drivers: "Fuoco / Molina / Nielsen", raceClass: "HYPERCAR", laps: 174, gap: "+31.106" },
];

export function getNextEvent(today: Date = new Date()): WecEvent | undefined {
  const todayIso = today.toISOString().slice(0, 10);
  return EVENTS.find((e) => e.startDate >= todayIso && e.status !== "completed");
}

export function getLastCompletedEvent(): WecEvent | undefined {
  const completed = EVENTS.filter((e) => e.status === "completed");
  return completed[completed.length - 1];
}

export function getCircuit(id: string): Circuit | undefined {
  return CIRCUITS.find((c) => c.id === id);
}

export const CLASS_COLOR: Record<RaceClass, string> = {
  HYPERCAR: "var(--class-hypercar)",
  LMP2: "var(--class-lmp2)",
  LMGT3: "var(--class-lmgt3)",
};
