import { describe, expect, it } from "vitest";
import { fujiSessionTime, hasFujiGuide } from "./fuji-guide";

describe("Fuji guide", () => {
  it("converts UTC to explicit Korean and Japanese race times", () => {
    for (const locale of ["en", "ko"] as const) {
      expect(fujiSessionTime("2026-09-27T02:00:00Z", locale)).toContain("11:00");
      expect(fujiSessionTime("2026-09-25T01:15:00Z", locale)).toContain("10:15");
      expect(fujiSessionTime(null, locale)).toBeNull();
      expect(fujiSessionTime("invalid", locale)).toBeNull();
    }
  });
  it("does not attach 2026 guidance to historical or unrelated races", () => {
    const circuit = { id: 31, name: "Fuji Speedway", country: "JPN", lengthKm: 4.563, lapRecord: null, layoutImage: null };
    expect(hasFujiGuide({ circuit, dateStart: "2026-09-27" })).toBe(true);
    expect(hasFujiGuide({ circuit, dateStart: "2025-09-28" })).toBe(false);
    expect(hasFujiGuide({ circuit: { ...circuit, id: 30 }, dateStart: "2026-09-06" })).toBe(false);
  });
});
