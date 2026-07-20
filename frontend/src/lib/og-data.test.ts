import { describe, expect, it } from "vitest";

import { ApiError } from "./api";
import { loadOgResource } from "./og-data";

describe("loadOgResource", () => {
  it("returns successful data", async () => {
    await expect(loadOgResource(async () => ({ id: 7 }))).resolves.toEqual({
      id: 7,
    });
  });

  it("maps only a real API 404 to an absent resource", async () => {
    await expect(
      loadOgResource(async () => {
        throw new ApiError("/missing", 404, "Not Found");
      }),
    ).resolves.toBeNull();
  });

  it("rethrows overload and network failures so ISR keeps the prior image", async () => {
    const overloaded = new ApiError(
      "/busy",
      503,
      "Service Unavailable",
    );
    await expect(
      loadOgResource(async () => {
        throw overloaded;
      }),
    ).rejects.toBe(overloaded);

    const networkFailure = new TypeError("fetch failed");
    await expect(
      loadOgResource(async () => {
        throw networkFailure;
      }),
    ).rejects.toBe(networkFailure);
  });
});
