import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ApiError,
  describeRounds,
  eventStatus,
  getAllTimeStats,
  getCarModel,
  getCircuit,
  getDriver,
  getDriverStandings,
  getEvent,
  getEvents,
  getLapChart,
  getLastCompletedEvent,
  getManufacturer,
  getNextEvent,
  getPitStops,
  getSessionResults,
  getSessionWeather,
  getSitemapSnapshot,
  getTeam,
  getUpcomingEvents,
  isApiNotFound,
  isPlausibleSessionTime,
  RACE_CLASSES,
  raceClassLabel,
  sanitizeSessionSchedule,
  type Event,
  type Session,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

describe("API cache overrides", () => {
  type NextFetchInit = RequestInit & {
    next?: { revalidate?: number };
  };

  const stubFetch = () => {
    const fetchMock = vi.fn(
      async (input: string | URL | Request, init?: NextFetchInit) => {
        void input;
        void init;
        return new Response("[]", { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  };

  it("preserves the existing session and standings cache defaults", async () => {
    const fetchMock = stubFetch();

    await getSessionResults(1);
    await getLapChart(1);
    await getPitStops(1);
    await getSessionWeather(1);
    await getDriverStandings("HYPERCAR", 2026);

    expect(
      fetchMock.mock.calls.map(([, init]) => init?.next?.revalidate),
    ).toEqual([60, 300, 300, 600, 300]);
  });

  it("passes explicit cache windows through both endpoint families", async () => {
    const fetchMock = stubFetch();

    await getSessionResults(1, { revalidate: 86_400 });
    await getDriverStandings("HYPERCAR", 2026, { revalidate: 3_600 });

    expect(
      fetchMock.mock.calls.map(([, init]) => init?.next?.revalidate),
    ).toEqual([86_400, 3_600]);
  });

  it("keeps every dynamic OG resource on the route's daily cache window", async () => {
    const fetchMock = stubFetch();
    const daily = { revalidate: 86_400 };

    await getEvent(1, daily);
    await getCircuit(2, daily);
    await getDriver(3, null, daily);
    await getTeam(4, null, daily);
    await getManufacturer(5, null, daily);
    await getCarModel("test-car", null, daily);
    await getSessionResults(6, daily);

    expect(fetchMock).toHaveBeenCalledTimes(7);
    expect(
      fetchMock.mock.calls.map(([, init]) => init?.next?.revalidate),
    ).toEqual(Array(7).fill(86_400));
  });

  it("preserves backend status codes so only real 404s become not-found", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("busy", {
          status: 503,
          statusText: "Service Unavailable",
        }),
      ),
    );

    let error: unknown;
    try {
      await getEvents(2026);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, path: "/api/v1/events?year=2026" });
    expect(isApiNotFound(error)).toBe(false);
    expect(isApiNotFound(new ApiError("/missing", 404, "Not Found"))).toBe(
      true,
    );
  });

  it("drops every result-derived detail cache to 60 seconds during race week", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00Z"));
    const fetchMock = vi.fn(
      async (input: string | URL | Request, _init?: NextFetchInit) => {
        void _init;
        const body = /\/api\/v1\/events(?:\?year=\d+)?$/.test(String(input))
          ? [ev(1, "2026-07-12", "2026-07-12")]
          : {};
        return new Response(JSON.stringify(body), { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await getDriver(7, 2026);
    await getEvent(1);
    await getCircuit(9);
    await getAllTimeStats();

    expect(
      fetchMock.mock.calls.map(([, init]) => init?.next?.revalidate),
    ).toEqual([
      3_600,
      60,
      3_600,
      60,
      3_600,
      60,
      3_600,
      60,
    ]);
  });

  it("keeps event IDs outside the current season on the archive cache", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T12:00:00Z"));
    const fetchMock = vi.fn(
      async (input: string | URL | Request, _init?: NextFetchInit) => {
        void _init;
        const body = String(input).endsWith("/api/v1/events")
          ? [ev(1, "2026-07-12", "2026-07-12")]
          : {};
        return new Response(JSON.stringify(body), { status: 200 });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await getEvent(999);

    expect(
      fetchMock.mock.calls.map(([, init]) => init?.next?.revalidate),
    ).toEqual([3_600, 86_400]);
  });
});

describe("sitemap API snapshot", () => {
  it("uses a one-hour cache for both sitemap and stable event schedules", async () => {
    type NextFetchInit = RequestInit & {
      next?: { revalidate?: number };
    };
    const fetchMock = vi.fn(
      async (input: string | URL | Request, _init?: NextFetchInit) => {
        void _init;
        const url = String(input);
        const body = url.endsWith("/api/v1/seasons")
          ? [{ id: 1, year: 2026, championshipName: "WEC" }]
          : [];
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await getSitemapSnapshot();
    const sitemapCalls = fetchMock.mock.calls;
    expect(sitemapCalls).toHaveLength(7);
    expect(
      sitemapCalls.every(([, init]) => init?.next?.revalidate === 3600),
    ).toBe(true);

    fetchMock.mockClear();
    await getEvents(2026);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[1]?.next?.revalidate).toBe(3600);
  });

  it("caps a cold multi-season snapshot at four concurrent requests", async () => {
    let active = 0;
    let maxActive = 0;
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/api/v1/seasons")) {
        return new Response(
          JSON.stringify(
            [2026, 2025, 2024, 2023].map((year, index) => ({
              id: index + 1,
              year,
              championshipName: "WEC",
            })),
          ),
          { status: 200 },
        );
      }

      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return new Response("[]", { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSitemapSnapshot();
    expect(maxActive).toBeLessThanOrEqual(4);
  });
});
