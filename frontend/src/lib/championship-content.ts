import {
  RACE_CLASSES,
  type DriverEntry,
  type RaceClass,
  type StandingDriver,
  type StandingManufacturer,
  type StandingTeam,
} from "@/lib/api";

export type ChampionshipSnapshot = {
  raceClass: RaceClass;
  drivers: StandingDriver[];
  teams: StandingTeam[];
  manufacturers: StandingManufacturer[];
};

function leadersByPoints<T>(
  rows: T[],
  key: (row: T) => string,
  points: (row: T) => number,
): T[] {
  const unique = new Map<string, T>();
  for (const row of rows) {
    const rowKey = key(row);
    const current = unique.get(rowKey);
    if (!current || points(row) > points(current)) unique.set(rowKey, row);
  }

  const values = [...unique.values()];
  if (values.length === 0) return [];
  const leaderPoints = Math.max(...values.map(points));
  return values.filter((row) => points(row) === leaderPoints);
}

/** Build one fact-only championship summary per class from standings rows. */
export function buildChampionshipSnapshot(
  drivers: StandingDriver[],
  teams: StandingTeam[],
  manufacturers: StandingManufacturer[],
): ChampionshipSnapshot[] {
  return RACE_CLASSES.map((raceClass) => ({
    raceClass,
    drivers: leadersByPoints(
      drivers.filter((row) => row.raceClass === raceClass),
      (row) => String(row.driverId),
      (row) => row.points,
    ),
    teams: leadersByPoints(
      teams.filter((row) => row.raceClass === raceClass),
      (row) => `${row.teamId}:${row.carNumber ?? ""}`,
      (row) => row.points,
    ),
    manufacturers: leadersByPoints(
      manufacturers.filter((row) => row.raceClass === raceClass),
      (row) => String(row.manufacturerId),
      (row) => row.points,
    ),
  })).filter(
    (item) =>
      item.drivers.length > 0 ||
      item.teams.length > 0 ||
      item.manufacturers.length > 0,
  );
}

export type GenesisTracker = {
  teamNames: string[];
  entries: { raceClass: RaceClass; team: string; carNumber: string }[];
  drivers: {
    id: number;
    name: string;
    raceClass: RaceClass;
    team: string;
    carNumber: string;
  }[];
  manufacturerStanding: StandingManufacturer | null;
};

const isGenesis = (value: string | null | undefined) =>
  value != null && /genesis/i.test(value);

/**
 * Extract only facts present in season entry and standings lists. This never
 * infers race performance from session/result feeds.
 */
export function buildGenesisTracker(
  drivers: DriverEntry[],
  manufacturers: StandingManufacturer[],
): GenesisTracker | null {
  const genesisDrivers = drivers.filter((driver) => isGenesis(driver.team));
  const manufacturerStanding =
    manufacturers
      .filter((row) => isGenesis(row.manufacturerName))
      .sort((a, b) => a.position - b.position)[0] ?? null;

  if (genesisDrivers.length === 0 && manufacturerStanding === null) return null;

  const teamNames = [...new Set(genesisDrivers.map((driver) => driver.team))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const entries = [
    ...new Map(
      genesisDrivers.map((driver) => [
        `${driver.raceClass}:${driver.team}:${driver.carNumber}`,
        {
          raceClass: driver.raceClass,
          team: driver.team,
          carNumber: driver.carNumber,
        },
      ]),
    ).values(),
  ].sort((a, b) => Number(a.carNumber) - Number(b.carNumber));
  const uniqueDrivers = [
    ...new Map(
      genesisDrivers.map((driver) => [
        driver.id,
        {
          id: driver.id,
          name: driver.name,
          raceClass: driver.raceClass,
          team: driver.team,
          carNumber: driver.carNumber,
        },
      ]),
    ).values(),
  ].sort((a, b) => a.name.localeCompare(b.name));

  return {
    teamNames,
    entries,
    drivers: uniqueDrivers,
    manufacturerStanding,
  };
}
