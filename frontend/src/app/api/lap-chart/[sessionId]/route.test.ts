import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

type NextFetchInit = RequestInit & {
  next?: { revalidate?: number };
};

function request(revalidate?: string): Request {
  const url = new URL("https://www.wecdash.com/api/lap-chart/42");
  if (revalidate !== undefined) {
    url.searchParams.set("revalidate", revalidate);
  }
  return new Request(url);
}

function context(sessionId = "42") {
  return { params: Promise.resolve({ sessionId }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("lap-chart proxy route", () => {
  it.each([60, 3_600, 86_400])(
    "uses the approved %i-second Next Data Cache window",
    async (revalidate) => {
      const chart = { cars: [], totalLaps: 0, incidents: [] };
      const fetchMock = vi.fn(async () => Response.json(chart));
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(request(String(revalidate)), context());

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual(chart);
      expect(fetchMock).toHaveBeenCalledOnce();
      const [input, init] = fetchMock.mock.calls[0] as unknown as [
        string | URL | Request,
        NextFetchInit,
      ];
      expect(String(input)).toMatch(
        /\/api\/v1\/sessions\/42\/lap-chart$/,
      );
      expect(init.next?.revalidate).toBe(revalidate);
    },
  );

  it.each([undefined, "0", "59", "300", "86401", "not-a-number"])(
    "rejects an unsupported revalidate value (%s)",
    async (revalidate) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(request(revalidate), context());

      expect(response.status).toBe(400);
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each(["0", "-1", "1.5", "not-a-number"])(
    "rejects an invalid session ID (%s)",
    async (sessionId) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);

      const response = await GET(request("60"), context(sessionId));

      expect(response.status).toBe(400);
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it.each([
    [404, "Not Found"],
    [503, "Service Unavailable"],
  ])("preserves backend status %i", async (status, statusText) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("upstream error", { status, statusText })),
    );

    const response = await GET(request("60"), context());

    expect(response.status).toBe(status);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("maps a backend network failure to bad gateway", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("connection failed");
      }),
    );

    const response = await GET(request("60"), context());

    expect(response.status).toBe(502);
  });
});
