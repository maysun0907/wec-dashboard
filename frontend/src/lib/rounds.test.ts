import { expect, it } from "vitest";
import { driverInRound } from "./rounds";
import { simulateDrivers } from "../components/simulator";
import type { DriverEntry, Event } from "./api";

it("matches lists, ranges, full-season and unconfirmed schedules", () => {
  for (const value of [null, "All", "Various", "1-3,5–8"]) expect(driverInRound(value, 7)).toBe(true);
  for (const value of ["TBC", "TBA", "5", "1-3,5", "unknown"]) expect(driverInRound(value, 7)).toBe(false);
});

it("does not award future race points to a one-off substitute or twice to a duplicate entry", () => {
  const regular = { id: 1, name: "Regular", carNumber: "12", raceClass: "HYPERCAR", rounds: "All" } as DriverEntry;
  const substitute = { ...regular, id: 2, name: "Substitute", rounds: "5" };
  const event = { id: 7, round: 7, name: "6 Hours of Fuji" } as Event;
  const rows = simulateDrivers([], { 7: { p1: "12" } }, [regular, regular, substitute], [event], "HYPERCAR");
  expect(rows.find((r) => r.name === "Regular")?.delta).toBe(25);
  expect(rows.find((r) => r.name === "Substitute")?.delta).toBe(0);
});
