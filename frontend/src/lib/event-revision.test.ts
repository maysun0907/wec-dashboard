import { afterEach, describe, expect, it, vi } from "vitest";
import { raceRefreshNeeded } from "./event-revision";

const current = "a".repeat(64);
const next = "b".repeat(64);

afterEach(() => vi.unstubAllGlobals());

describe("race refresh verdict", () => {
  it.each([
    [200, { version: current }, false],
    [200, { version: next }, true],
    [200, { version: "invalid" }, false],
    [503, {}, false],
    [404, {}, true],
  ])("handles a %i response with %j", async (status, payload, expected) => {
    const fetchRevision = vi.fn(async () => Response.json(payload, { status }));
    vi.stubGlobal("fetch", fetchRevision);
    const signal = new AbortController().signal;
    expect(await raceRefreshNeeded(42, current, false, signal)).toBe(expected);
    expect(fetchRevision).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/v1\/events\/42\/revision$/),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("allows a clock transition and a missing baseline without polling the API first", async () => {
    const fetchRevision = vi.fn();
    vi.stubGlobal("fetch", fetchRevision);
    const controller = new AbortController();
    expect(await raceRefreshNeeded(42, current, true, controller.signal)).toBe(true);
    expect(await raceRefreshNeeded(42, null, false, controller.signal)).toBe(true);
    controller.abort();
    expect(await raceRefreshNeeded(42, current, true, controller.signal)).toBe(false);
    expect(fetchRevision).not.toHaveBeenCalled();
  });
});
