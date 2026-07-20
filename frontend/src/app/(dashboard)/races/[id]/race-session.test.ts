import { describe, expect, it, vi } from "vitest";

import {
  buildRaceSessionHref,
  loadSelectedRaceSession,
  normalizeRequestedSession,
  selectRaceSession,
} from "./race-session";

const sessions = [
  { id: 11, type: "FP1", startTime: "2026-07-10T10:00:00Z" },
  { id: 12, type: "Q", startTime: "2026-07-11T10:00:00Z" },
  { id: 13, type: "RACE", startTime: "2026-07-12T10:00:00Z" },
];

describe("race session selection", () => {
  it("honors a valid case-insensitive session deep link", () => {
    expect(selectRaceSession(sessions, " q ")).toEqual(sessions[1]);
    expect(normalizeRequestedSession("fp1")).toBe("FP1");
  });

  it("defaults to race, then qualifying, then the first session", () => {
    const afterRace = new Date("2026-07-13T00:00:00Z");
    expect(selectRaceSession(sessions, undefined, afterRace)).toEqual(
      sessions[2],
    );
    expect(
      selectRaceSession(sessions.slice(0, 2), "invalid", afterRace),
    ).toEqual(sessions[1]);
    expect(selectRaceSession(sessions.slice(0, 1), ["FP1"])).toEqual(
      sessions[0],
    );
    expect(selectRaceSession([], "RACE")).toBeNull();
  });

  it("shows the latest session that has started during race week", () => {
    expect(
      selectRaceSession(
        sessions,
        undefined,
        new Date("2026-07-10T12:00:00Z"),
      ),
    ).toEqual(sessions[0]);
    expect(
      selectRaceSession(
        sessions,
        undefined,
        new Date("2026-07-11T12:00:00Z"),
      ),
    ).toEqual(sessions[1]);
  });

  it("uses the type fallback when session times are missing", () => {
    const unscheduled = sessions.map(({ id, type }) => ({ id, type }));
    expect(selectRaceSession(unscheduled, undefined)).toEqual(unscheduled[2]);
  });

  it("loads results for only the selected session", async () => {
    const loadResults = vi.fn(async (sessionId: number) => [sessionId]);

    await expect(
      loadSelectedRaceSession(sessions, "Q", loadResults),
    ).resolves.toEqual({
      session: sessions[1],
      results: [12],
      loadFailed: false,
    });
    expect(loadResults).toHaveBeenCalledTimes(1);
    expect(loadResults).toHaveBeenCalledWith(12);
  });

  it("marks a selected-session request failure separately from no data", async () => {
    const loadResults = vi.fn(async () => {
      throw new Error("temporary API failure");
    });

    await expect(
      loadSelectedRaceSession(sessions, "RACE", loadResults),
    ).resolves.toEqual({
      session: sessions[2],
      results: [],
      loadFailed: true,
    });
    expect(loadResults).toHaveBeenCalledTimes(1);
  });

  it("falls back once to the previous completed session when the latest has no rows", async () => {
    const loadResults = vi.fn(async (sessionId: number) =>
      sessionId === 11 ? [sessionId] : [],
    );

    await expect(
      loadSelectedRaceSession(
        sessions,
        undefined,
        loadResults,
        new Date("2026-07-11T12:00:00Z"),
      ),
    ).resolves.toEqual({
      session: sessions[0],
      results: [11],
      loadFailed: false,
    });
    expect(loadResults.mock.calls.map(([sessionId]) => sessionId)).toEqual([
      12, 11,
    ]);
  });

  it("never falls back from an explicitly requested session", async () => {
    const loadResults = vi.fn(async () => [] as number[]);

    await expect(
      loadSelectedRaceSession(
        sessions,
        "Q",
        loadResults,
        new Date("2026-07-11T12:00:00Z"),
      ),
    ).resolves.toEqual({
      session: sessions[1],
      results: [],
      loadFailed: false,
    });
    expect(loadResults).toHaveBeenCalledTimes(1);
    expect(loadResults).toHaveBeenCalledWith(12);
  });

  it("updates only the session query parameter", () => {
    expect(
      buildRaceSessionHref(
        "/en/races/101?class=HYPERCAR&session=FP1#results",
        "race",
      ),
    ).toBe("/en/races/101?class=HYPERCAR&session=RACE#results");
  });
});
