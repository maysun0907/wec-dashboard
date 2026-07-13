import { describe, expect, it } from "vitest";
import { dashboardMetadataCopy } from "./dashboard-metadata";

describe("dashboardMetadataCopy", () => {
  it("makes season pages year-specific in both languages", () => {
    const en = dashboardMetadataCopy("standings", "en", 2025);
    const ko = dashboardMetadataCopy("standings", "ko", 2025);

    expect(en.title).toContain("2025");
    expect(en.title).toContain("Standings");
    expect(ko.title).toContain("2025");
    expect(ko.title).toContain("순위");
    expect(en.description).not.toBe(ko.description);
  });

  it("keeps every page description specific and non-empty", () => {
    const races = dashboardMetadataCopy("races", "en", 2026);
    const drivers = dashboardMetadataCopy("drivers", "en", 2026);

    expect(races.description.length).toBeGreaterThan(40);
    expect(drivers.description.length).toBeGreaterThan(40);
    expect(races.description).not.toBe(drivers.description);
  });

  it("does not claim a Genesis entry before its debut season", () => {
    const archive = dashboardMetadataCopy("genesis", "en", 2025);
    const debut = dashboardMetadataCopy("genesis", "en", 2026);

    expect(archive.title).toContain("Archive");
    expect(archive.description).not.toContain("#17");
    expect(debut.description).toContain("#17");
    expect(debut.description).toContain("#19");
  });
});
