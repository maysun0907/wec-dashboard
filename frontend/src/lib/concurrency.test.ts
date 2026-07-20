import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserves order while bounding active work", async () => {
    let active = 0;
    let maxActive = 0;

    const result = await mapWithConcurrency([5, 4, 3, 2, 1], 2, async (n) => {
      active += 1;
      maxActive = Math.max(maxActive, active);
      await new Promise((resolve) => setTimeout(resolve, n));
      active -= 1;
      return n * 2;
    });

    expect(result).toEqual([10, 8, 6, 4, 2]);
    expect(maxActive).toBeLessThanOrEqual(2);
  });

  it("rejects an invalid limit", async () => {
    await expect(mapWithConcurrency([1], 0, async (n) => n)).rejects.toThrow(
      "concurrency must be a positive integer",
    );
  });
});
