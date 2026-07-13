import { describe, expect, it } from "vitest";
import {
  describeRounds,
  eventStatus,
  getLastCompletedEvent,
  getNextEvent,
  getUpcomingEvents,
  isPlausibleSessionTime,
  RACE_CLASSES,
  raceClassLabel,
  sanitizeSessionSchedule,
  type Event,
  type Session,
} from "./api";

describe("race class catalogue", () => {
  it("keeps LMP2 selectable between prototype and GT classes", () => {
    expect(RACE_CLASSES).toContain("HYPERCAR");
    expect(RACE_CLASSES).toContain("LMP2");
    expect(RACE_CLASSES).toContain("LMGT3");
    expect(RACE_CLASSES.indexOf("LMP2")).toBeLessThan(
      RACE_CLASSES.indexOf("LMGT3"),
    );
    expect(raceClassLabel("LMP2")).toBe("LMP2");
  });
});

const ev = (id: number, dateStart: string, dateEnd: string): Event => ({
  id,
  round: id,
  name: `Event ${id}`,
  dateStart,
  dateEnd,
  format: null,
  posterUrl: null,
  circuit: {
    id: 1,
    name: "T",
    country: "QAT",
    lengthKm: 5,
    lapRecord: null,
    layoutImage: null,
  },
});

describe("describeRounds", () => {
  it("returns null for full-season tags", () => {
    expect(describeRounds(null)).toBeNull();
    expect(describeRounds(undefined)).toBeNull();
    expect(describeRounds("")).toBeNull();
    expect(describeRounds("All")).toBeNull();
    expect(describeRounds("various")).toBeNull();
    expect(describeRounds("  ALL  ")).toBeNull();
  });

  it("trims and returns specific round labels", () => {
    expect(describeRounds("1-3")).toBe("1-3");
    expect(describeRounds(" TBC ")).toBe("TBC");
    expect(describeRounds("4")).toBe("4");
  });
});

describe("eventStatus", () => {
  const today = new Date("2026-04-30T00:00:00Z");

  it("flags past events as completed", () => {
    expect(eventStatus(ev(1, "2026-02-27", "2026-02-28"), today)).toBe(
      "completed",
    );
  });

  it("flags future events as upcoming", () => {
    expect(eventStatus(ev(2, "2026-05-09", "2026-05-09"), today)).toBe(
      "upcoming",
    );
  });

  it("flags in-flight events as live", () => {
    expect(eventStatus(ev(3, "2026-04-29", "2026-05-01"), today)).toBe("live");
    expect(eventStatus(ev(4, "2026-04-30", "2026-04-30"), today)).toBe("live");
  });
});

describe("isPlausibleSessionTime", () => {
  const event = ev(1, "2026-04-17", "2026-04-19");

  it("accepts sessions around the event weekend", () => {
    expect(
      isPlausibleSessionTime(event, {
        startTime: "2026-04-16T08:30:00Z",
      }),
    ).toBe(true);
  });

  it("rejects missing, invalid, and clearly unrelated timestamps", () => {
    expect(isPlausibleSessionTime(event, { startTime: null })).toBe(false);
    expect(isPlausibleSessionTime(event, { startTime: "invalid" })).toBe(false);
    expect(
      isPlausibleSessionTime(event, {
        startTime: "2026-07-10T08:30:00Z",
      }),
    ).toBe(false);
  });

  it("keeps valid sessions and clears only unrelated timestamps", () => {
    const sessions: Session[] = [
      { id: 1, type: "FP1", startTime: "2026-04-16T08:30:00Z" },
      { id: 2, type: "RACE", startTime: "2026-07-10T08:30:00Z" },
      { id: 3, type: "Q", startTime: null },
    ];

    expect(sanitizeSessionSchedule(event, sessions)).toEqual([
      sessions[0],
      { ...sessions[1], startTime: null },
      sessions[2],
    ]);
  });
});

describe("getNextEvent / getUpcomingEvents / getLastCompletedEvent", () => {
  const today = new Date("2026-04-30T00:00:00Z");
  const events = [
    ev(1, "2026-02-27", "2026-02-28"), // past
    ev(2, "2026-04-18", "2026-04-18"), // past
    ev(3, "2026-05-09", "2026-05-09"), // upcoming
    ev(4, "2026-06-13", "2026-06-14"), // upcoming
    ev(5, "2026-09-27", "2026-09-27"), // upcoming
  ];

  it("getNextEvent returns the first dateStart >= today", () => {
    expect(getNextEvent(events, today)?.id).toBe(3);
  });

  it("getUpcomingEvents respects count and ordering", () => {
    const out = getUpcomingEvents(events, 2, today);
    expect(out.map((e) => e.id)).toEqual([3, 4]);
  });

  it("getLastCompletedEvent picks the most recent past event", () => {
    expect(getLastCompletedEvent(events, today)?.id).toBe(2);
  });

  it("returns undefined when no qualifying event exists", () => {
    expect(getNextEvent([], today)).toBeUndefined();
    expect(getLastCompletedEvent([], today)).toBeUndefined();
    const futureOnly = events.filter((e) => e.dateEnd >= "2026-05-01");
    expect(getLastCompletedEvent(futureOnly, today)).toBeUndefined();
  });
});
