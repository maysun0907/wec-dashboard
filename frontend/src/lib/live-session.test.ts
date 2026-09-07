import { describe, expect, it } from "vitest";
import { classifySession, selectLiveEvent, sessionDurationMin } from "./live-session";
import type { Event, Session } from "./api";

describe("live timing", () => {
  it("uses equal durations across languages without mistaking COTA for Le Mans", () => {
    for (const [en, ko, minutes] of [
      ["24 Hours of Le Mans", "르망 24시간", 1440],
      ["8 Hours of Bahrain", "바레인 8시간", 480],
      ["Qatar 1812 km", "카타르 1812km", 600],
      ["Lone Star Le Mans", "론 스타 르망", 360],
    ] as const) {
      expect(sessionDurationMin("RACE", en)).toBe(minutes);
      expect(sessionDurationMin("RACE", ko)).toBe(minutes);
    }
  });
  it("respects final results and fresh delayed live publications", () => {
    const now = Date.parse("2026-09-06T23:00:00Z");
    const session: Session = { id: 1, type: "RACE", startTime: "2026-09-06T16:00:00Z",
      resultStatus: "live", resultsUpdatedAt: "2026-09-06T22:59:00Z" };
    expect(classifySession(session, "6 Hours", now).status).toBe("live");
    expect(classifySession({ ...session, resultStatus: "final" }, "24 Hours", now).status).toBe("past");
    expect(classifySession({ ...session, resultsUpdatedAt: "2026-09-06T21:00:00Z" }, "6 Hours", now).status).toBe("past");
    expect(classifySession({ ...session, startTime: null, resultStatus: null }, "6 Hours", now).status).toBe("upcoming");
  });
  it("retains an American race when UTC has already crossed midnight", () => {
    const event = { id: 1, dateStart: "2026-09-06", dateEnd: "2026-09-06",
      circuit: { name: "Circuit of the Americas" } } as Event;
    expect(selectLiveEvent([event], new Date("2026-09-07T00:30:00Z"))?.id).toBe(1);
    expect(selectLiveEvent([event], new Date("2026-09-07T08:00:00Z"))).toBeNull();
  });
});
