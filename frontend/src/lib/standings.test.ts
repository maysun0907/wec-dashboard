import { describe, expect, it } from "vitest";
import {
  teamStandingDetail,
  teamStandingRowKey,
} from "./standings";

describe("team standings presentation", () => {
  it("uses the car number to distinguish two entries from one team", () => {
    const first = teamStandingRowKey({
      teamId: 12,
      carNumber: "23",
      position: 9,
    });
    const second = teamStandingRowKey({
      teamId: 12,
      carNumber: "27",
      position: 12,
    });

    expect(first).not.toBe(second);
  });

  it("shows both car number and manufacturer", () => {
    expect(
      teamStandingDetail({
        carNumber: "54",
        manufacturer: "Ferrari",
      }),
    ).toBe("#54 · Ferrari");
  });
});
