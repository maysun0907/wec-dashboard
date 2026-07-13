import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCarModels,
  getCircuits,
  getDrivers,
  getEvents,
  getManufacturerStandings,
  getSeasons,
  getTeams,
} from "@/lib/api";
import sitemap from "./sitemap";

vi.mock("@/lib/api", () => ({
  getCarModels: vi.fn(),
  getCircuits: vi.fn(),
  getDrivers: vi.fn(),
  getEvents: vi.fn(),
  getManufacturerStandings: vi.fn(),
  getSeasons: vi.fn(),
  getTeams: vi.fn(),
}));

const event = {
  id: 101,
  round: 1,
  name: "Test Race",
  dateStart: "2026-03-01",
  dateEnd: "2026-03-02",
  format: null,
  posterUrl: null,
  circuit: {
    id: 1,
    name: "Test Circuit",
    country: "KOR",
    lengthKm: 5,
    lapRecord: null,
    layoutImage: null,
  },
};

describe("sitemap", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.wecdash.com";
    vi.mocked(getSeasons).mockResolvedValue([
      { id: 1, year: 2025, championshipName: "WEC" },
      { id: 2, year: 2026, championshipName: "WEC" },
    ]);
    vi.mocked(getEvents).mockResolvedValue([event]);
    vi.mocked(getDrivers).mockResolvedValue([
      {
        id: 201,
        name: "Test Driver",
        nationality: null,
        carNumber: "1",
        team: "Test Team",
        manufacturerLogoUrl: null,
        photoUrl: null,
        raceClass: "HYPERCAR" as const,
      },
    ]);
    vi.mocked(getTeams).mockResolvedValue([
      {
        id: 301,
        name: "Test Team",
        carNumber: "1",
        raceClass: "HYPERCAR" as const,
        model: null,
        carModelSlug: null,
        manufacturer: null,
        manufacturerLogoUrl: null,
      },
    ]);
    vi.mocked(getCarModels).mockResolvedValue([
      {
        id: 401,
        slug: "test-car",
        name: "Test Car",
        raceClass: "HYPERCAR" as const,
        manufacturer: null,
        manufacturerLogoUrl: null,
        imageUrl: null,
        entries: 1,
      },
    ]);
    vi.mocked(getCircuits).mockResolvedValue([event.circuit]);
    vi.mocked(getManufacturerStandings).mockResolvedValue([
      {
        position: 1,
        manufacturerId: 601,
        manufacturerName: "Test Manufacturer",
        manufacturerLogoUrl: null,
        raceClass: "HYPERCAR" as const,
        points: 10,
      },
    ]);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.clearAllMocks();
  });

  it("lists canonical locale and season URLs without legacy pages", async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls).toContain("https://www.wecdash.com/en/2026/standings");
    expect(urls).toContain("https://www.wecdash.com/ko/2025/races");
    expect(urls).toContain("https://www.wecdash.com/en/rules");
    expect(urls).toContain("https://www.wecdash.com/ko/2026/genesis-wec");
    expect(urls).not.toContain("https://www.wecdash.com/ko/genesis-wec");
    expect(urls).not.toContain("https://www.wecdash.com/ko/2025/genesis-wec");
    expect(urls).not.toContain("https://www.wecdash.com/standings");
    expect(urls).not.toContain("https://www.wecdash.com/bop");
  });

  it("publishes reciprocal language alternates with English x-default", async () => {
    const entries = await sitemap();
    const en = entries.find(
      (entry) => entry.url === "https://www.wecdash.com/en/2026/standings",
    );
    const ko = entries.find(
      (entry) => entry.url === "https://www.wecdash.com/ko/2026/standings",
    );

    const expected = {
      en: "https://www.wecdash.com/en/2026/standings",
      ko: "https://www.wecdash.com/ko/2026/standings",
      "x-default": "https://www.wecdash.com/en/2026/standings",
    };
    expect(en?.alternates?.languages).toEqual(expected);
    expect(ko?.alternates?.languages).toEqual(expected);
  });

  it("deduplicates repeated event and entity URLs", async () => {
    vi.mocked(getEvents).mockResolvedValue([event, event]);
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((url) => url.endsWith("/en/races/101"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/ko/races/101"))).toHaveLength(1);
    expect(urls).toContain("https://www.wecdash.com/en/drivers/201");
    expect(urls).toContain("https://www.wecdash.com/ko/manufacturers/601");
    expect(urls).toContain("https://www.wecdash.com/en/2025/cars/test-car");
    expect(urls).toContain("https://www.wecdash.com/ko/2026/cars/test-car");
  });

  it("refuses to publish a partial sitemap when season data is empty", async () => {
    vi.mocked(getSeasons).mockResolvedValue([]);

    await expect(sitemap()).rejects.toThrow(
      "Cannot generate a complete sitemap without season data",
    );
  });
});
