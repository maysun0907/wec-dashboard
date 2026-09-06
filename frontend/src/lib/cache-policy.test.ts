import { describe, expect, it } from "vitest";
import {
  ARCHIVE_REVALIDATE_SECONDS,
  eventDataRevalidateSeconds,
  isRaceWeek,
  OFF_WEEK_REVALIDATE_SECONDS,
  RACE_WEEK_REVALIDATE_SECONDS,
  seasonDataRevalidateSeconds,
} from "./cache-policy";

const saoPaulo = {
  dateStart: "2026-07-12",
  dateEnd: "2026-07-12",
};

describe("race-aware cache policy", () => {
  it("does not freeze results or standings during the post-race appeal window", () => {
    const now = new Date("2026-08-20T00:00:00Z");
    expect(eventDataRevalidateSeconds(saoPaulo, now)).toBe(OFF_WEEK_REVALIDATE_SECONDS);
    expect(seasonDataRevalidateSeconds([saoPaulo], now)).toBe(OFF_WEEK_REVALIDATE_SECONDS);
  });
  it("uses the fast cache from Monday of race week through post-race ingest", () => {
    expect(isRaceWeek(saoPaulo, new Date("2026-07-06T00:00:00Z"))).toBe(true);
    expect(isRaceWeek(saoPaulo, new Date("2026-07-14T23:59:59Z"))).toBe(true);
    expect(
      eventDataRevalidateSeconds(
        saoPaulo,
        new Date("2026-07-12T12:00:00Z"),
      ),
    ).toBe(RACE_WEEK_REVALIDATE_SECONDS);
  });

  it("uses hourly caches around appeals and daily caches for old archives", () => {
    expect(
      eventDataRevalidateSeconds(
        saoPaulo,
        new Date("2026-06-20T00:00:00Z"),
      ),
    ).toBe(OFF_WEEK_REVALIDATE_SECONDS);
    expect(
      eventDataRevalidateSeconds(
        saoPaulo,
        new Date("2027-07-15T00:00:00Z"),
      ),
    ).toBe(ARCHIVE_REVALIDATE_SECONDS);
  });

  it("keeps season-wide data fast if any event is in race week", () => {
    const future = { dateStart: "2026-09-06", dateEnd: "2026-09-06" };
    expect(
      seasonDataRevalidateSeconds(
        [saoPaulo, future],
        new Date("2026-07-10T00:00:00Z"),
      ),
    ).toBe(RACE_WEEK_REVALIDATE_SECONDS);
  });

  it("uses hourly current-season and daily completed-season caches", () => {
    const future = { dateStart: "2026-09-06", dateEnd: "2026-09-06" };
    expect(
      seasonDataRevalidateSeconds(
        [saoPaulo, future],
        new Date("2026-07-21T00:00:00Z"),
      ),
    ).toBe(OFF_WEEK_REVALIDATE_SECONDS);
    expect(
      seasonDataRevalidateSeconds(
        [saoPaulo],
        new Date("2027-07-21T00:00:00Z"),
      ),
    ).toBe(ARCHIVE_REVALIDATE_SECONDS);
  });

  it("falls back safely when schedule dates are invalid or absent", () => {
    expect(
      eventDataRevalidateSeconds(
        { dateStart: "invalid", dateEnd: "invalid" },
        new Date("2026-07-21T00:00:00Z"),
      ),
    ).toBe(OFF_WEEK_REVALIDATE_SECONDS);
    expect(
      seasonDataRevalidateSeconds([], new Date("2026-07-21T00:00:00Z")),
    ).toBe(OFF_WEEK_REVALIDATE_SECONDS);
  });
});
