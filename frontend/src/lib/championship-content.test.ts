import { describe, expect, it } from "vitest";
import type {
  DriverEntry,
  StandingDriver,
  StandingManufacturer,
  StandingTeam,
} from "./api";
import {
  buildChampionshipSnapshot,
  buildGenesisTracker,
} from "./championship-content";

const driver = (
  overrides: Partial<StandingDriver> & Pick<StandingDriver, "driverId" | "points">,
): StandingDriver => ({
  position: 1,
  driverName: `Driver ${overrides.driverId}`,
  team: null,
  teamId: null,
  manufacturerLogoUrl: null,
  raceClass: "HYPERCAR",
  ...overrides,
});

const team = (
  overrides: Partial<StandingTeam> & Pick<StandingTeam, "teamId" | "points">,
): StandingTeam => ({
  position: 1,
  teamName: `Team ${overrides.teamId}`,
  carNumber: "1",
  manufacturer: null,
  manufacturerId: null,
  manufacturerLogoUrl: null,
  raceClass: "HYPERCAR",
  ...overrides,
});

const manufacturer = (
  overrides: Partial<StandingManufacturer> &
    Pick<StandingManufacturer, "manufacturerId" | "points">,
): StandingManufacturer => ({
  position: 1,
  manufacturerName: `Manufacturer ${overrides.manufacturerId}`,
  manufacturerLogoUrl: null,
  raceClass: "HYPERCAR",
  ...overrides,
});

const entry = (
  overrides: Partial<DriverEntry> & Pick<DriverEntry, "id" | "name">,
): DriverEntry => ({
  nationality: null,
  carNumber: "17",
  team: "Genesis Magma Racing",
  manufacturerLogoUrl: null,
  photoUrl: null,
  raceClass: "HYPERCAR",
  ...overrides,
});

describe("buildChampionshipSnapshot", () => {
  it("returns an empty snapshot when no standings exist", () => {
    expect(buildChampionshipSnapshot([], [], [])).toEqual([]);
  });

  it("keeps tied leaders and removes duplicated entities", () => {
    const snapshot = buildChampionshipSnapshot(
      [driver({ driverId: 1, points: 42 }), driver({ driverId: 2, points: 42 }), driver({ driverId: 1, points: 10 })],
      [team({ teamId: 7, carNumber: "17", points: 30 }), team({ teamId: 7, carNumber: "17", points: 20 })],
      [manufacturer({ manufacturerId: 3, points: 50 })],
    );

    expect(snapshot).toHaveLength(1);
    expect(snapshot[0]?.drivers.map((row) => row.driverId)).toEqual([1, 2]);
    expect(snapshot[0]?.teams).toHaveLength(1);
    expect(snapshot[0]?.manufacturers).toHaveLength(1);
  });
});

describe("buildGenesisTracker", () => {
  it("returns null when the season lists contain no Genesis entry", () => {
    expect(
      buildGenesisTracker(
        [entry({ id: 1, name: "A", team: "Other Racing" })],
        [manufacturer({ manufacturerId: 4, points: 10, manufacturerName: "Other" })],
      ),
    ).toBeNull();
  });

  it("deduplicates drivers and car entries", () => {
    const tracker = buildGenesisTracker(
      [
        entry({ id: 1, name: "A" }),
        entry({ id: 1, name: "A" }),
        entry({ id: 2, name: "B", carNumber: "19" }),
      ],
      [manufacturer({ manufacturerId: 9, points: 24, manufacturerName: "Genesis" })],
    );

    expect(tracker?.drivers).toHaveLength(2);
    expect(tracker?.entries.map((item) => item.carNumber)).toEqual(["17", "19"]);
    expect(tracker?.manufacturerStanding?.points).toBe(24);
  });
});
