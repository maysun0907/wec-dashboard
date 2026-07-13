import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getCarModels,
  getCircuits,
  getDrivers,
  getEvents,
  getSeasons,
  getTeams,
} from "@/lib/api";
import sitemap from "./sitemap";

vi.mock("@/lib/api", () => ({
  getCarModels: vi.fn(),
  getCircuits: vi.fn(),
  getDrivers: vi.fn(),
  getEvents: vi.fn(),
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

const driver = {
  id: 201,
  name: "Test Driver",
  nationality: null,
  carNumber: "1",
  team: "Test Team",
  manufacturerLogoUrl: null,
  photoUrl: null,
  raceClass: "HYPERCAR" as const,
};

const team = {
  id: 301,
  name: "Test Team",
  carNumber: "1",
  raceClass: "HYPERCAR" as const,
  model: null,
  carModelSlug: null,
  manufacturer: null,
  manufacturerLogoUrl: null,
};

const carModel = {
  id: 401,
  slug: "test-car",
  name: "Test Car",
  raceClass: "HYPERCAR" as const,
  manufacturer: null,
  manufacturerLogoUrl: null,
  imageUrl: null,
  entries: 1,
};

const circuit = {
  id: 501,
  name: "Test Circuit",
  country: "KOR",
  lengthKm: 5,
  lapRecord: null,
  layoutImage: null,
};

describe("sitemap", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://www.wecdash.com";
    vi.mocked(getSeasons).mockResolvedValue([
      { id: 1, year: 2025, championshipName: "WEC" },
      { id: 2, year: 2026, championshipName: "WEC" },
    ]);
    vi.mocked(getEvents).mockResolvedValue([event]);
    vi.mocked(getDrivers).mockResolvedValue([driver, driver]);
    vi.mocked(getTeams).mockResolvedValue([team, team]);
    vi.mocked(getCarModels).mockResolvedValue([carModel, carModel]);
    vi.mocked(getCircuits).mockResolvedValue([circuit, circuit]);
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    vi.clearAllMocks();
  });

  it("lists only canonical static routes", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(urls).toContain("https://www.wecdash.com/rules");
    expect(urls).not.toContain("https://www.wecdash.com/bop");
  });

  it("deduplicates repeated dynamic entity URLs", async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    expect(new Set(urls).size).toBe(urls.length);
    expect(urls.filter((url) => url.endsWith("/races/101"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/drivers/201"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/teams/301"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/cars/test-car"))).toHaveLength(1);
    expect(urls.filter((url) => url.endsWith("/circuits/501"))).toHaveLength(1);
  });
});
