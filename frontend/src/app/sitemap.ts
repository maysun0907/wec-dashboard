import type { MetadataRoute } from "next";
import { LOCALES, type Locale } from "@/i18n/config";
import { getSitemapSnapshot } from "@/lib/api";
import {
  LOCALE_ONLY_PATHS,
  SEASON_SCOPED_PATHS,
  buildPublicPath,
} from "@/lib/public-routing";
import { siteUrl } from "@/lib/site-url";

export const revalidate = 3600;

type SitemapEntry = MetadataRoute.Sitemap[number];
type Frequency = SitemapEntry["changeFrequency"];

const PRIORITY: Record<string, number> = {
  "/": 1,
  "/live": 0.9,
  "/races": 0.9,
  "/standings": 0.9,
  "/genesis-wec": 0.85,
  "/drivers": 0.8,
  "/teams": 0.8,
  "/cars": 0.8,
  "/circuits": 0.7,
  "/rules": 0.6,
  "/stats": 0.6,
  "/standings/simulator": 0.5,
  "/drivers/compare": 0.5,
  "/manufacturers/compare": 0.5,
  "/seasons/compare": 0.5,
};

const FREQUENCY: Record<string, Frequency> = {
  "/": "hourly",
  "/live": "hourly",
  "/races": "daily",
  "/standings": "daily",
  "/genesis-wec": "daily",
  "/drivers": "daily",
  "/teams": "daily",
  "/cars": "weekly",
  "/circuits": "monthly",
  "/rules": "monthly",
  "/stats": "weekly",
  "/standings/simulator": "weekly",
  "/drivers/compare": "monthly",
  "/manufacturers/compare": "monthly",
  "/seasons/compare": "monthly",
};

function lastModifiedForSeason(
  year: number,
  latestYear: number,
): Date | undefined {
  return year === latestYear
    ? undefined
    : new Date(`${year}-12-31T00:00:00.000Z`);
}

function lastModifiedForEvent(
  event: { dateStart?: string | null; dateEnd?: string | null },
): Date | undefined {
  for (const value of [event.dateEnd, event.dateStart]) {
    if (!value) continue;
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return new Date(timestamp);
  }
  return undefined;
}

function publicPath(
  internalPath: string,
  locale: Locale,
  year: number,
): string {
  const path = buildPublicPath(internalPath, locale, year);
  if (!path) throw new Error(`No public route for ${internalPath}`);
  return path;
}

function localizedEntries({
  base,
  internalPath,
  year,
  lastModified,
  changeFrequency,
  priority,
}: {
  base: string;
  internalPath: string;
  year: number;
  lastModified?: Date;
  changeFrequency: Frequency;
  priority: number;
}): SitemapEntry[] {
  const paths = Object.fromEntries(
    LOCALES.map((locale) => [locale, publicPath(internalPath, locale, year)]),
  ) as Record<Locale, string>;
  const languages = {
    en: `${base}${paths.en}`,
    ko: `${base}${paths.ko}`,
    "x-default": `${base}${paths.en}`,
  };

  return LOCALES.map((locale) => ({
    url: `${base}${paths[locale]}`,
    ...(lastModified ? { lastModified } : {}),
    changeFrequency,
    priority,
    alternates: { languages },
  }));
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl().replace(/\/+$/, "");
  // Sitemap regeneration is atomic: if a critical API call fails, throw so
  // ISR keeps serving the last successful complete sitemap instead of
  // publishing a truncated document with valid 200 status.
  const snapshot = await getSitemapSnapshot();
  const { seasons, yearResources, drivers, teams, circuits, manufacturers } =
    snapshot;
  const years = [...new Set(seasons.map((season) => season.year))].sort(
    (a, b) => b - a,
  );
  if (years.length === 0) {
    throw new Error("Cannot generate a complete sitemap without season data");
  }
  const latestYear = years[0]!;
  const entries: SitemapEntry[] = [];

  for (const year of years) {
    for (const internalPath of SEASON_SCOPED_PATHS) {
      // Genesis entered the championship in 2026. Earlier URLs are valid for
      // user navigation but intentionally stay out of search as empty archives.
      if (internalPath === "/genesis-wec" && year < 2026) continue;
      entries.push(
        ...localizedEntries({
          base,
          internalPath,
          year,
          lastModified: lastModifiedForSeason(year, latestYear),
          changeFrequency: FREQUENCY[internalPath] ?? "weekly",
          priority: PRIORITY[internalPath] ?? 0.5,
        }),
      );
    }
  }

  for (const internalPath of LOCALE_ONLY_PATHS) {
    entries.push(
      ...localizedEntries({
        base,
        internalPath,
        year: latestYear,
        changeFrequency: FREQUENCY[internalPath] ?? "weekly",
        priority: PRIORITY[internalPath] ?? 0.5,
      }),
    );
  }

  // Events are stable, locale-only detail URLs: the event itself already
  // identifies its season. Walking every season keeps long-tail race history
  // discoverable without multiplying the same event by a year segment.
  for (const { events } of yearResources) {
    for (const event of events) {
      entries.push(
        ...localizedEntries({
          base,
          internalPath: `/races/${event.id}`,
          year: latestYear,
          lastModified: lastModifiedForEvent(event),
          changeFrequency: "weekly",
          priority: 0.7,
        }),
      );
    }
  }

  // Detail pages contain career/history data, so each current entity needs one
  // URL per language rather than one copy for every season.
  const details: Array<{
    path: string;
    frequency: Frequency;
    priority: number;
  }> = [
    ...drivers.map((driver) => ({
      path: `/drivers/${driver.id}`,
      frequency: "weekly" as const,
      priority: 0.6,
    })),
    ...teams.map((team) => ({
      path: `/teams/${team.id}`,
      frequency: "weekly" as const,
      priority: 0.6,
    })),
    ...circuits.map((circuit) => ({
      path: `/circuits/${circuit.id}`,
      frequency: "monthly" as const,
      priority: 0.5,
    })),
    ...manufacturers.map((manufacturer) => ({
      path: `/manufacturers/${manufacturer.manufacturerId}`,
      frequency: "weekly" as const,
      priority: 0.6,
    })),
  ];

  for (const detail of details) {
    entries.push(
      ...localizedEntries({
        base,
        internalPath: detail.path,
        year: latestYear,
        changeFrequency: detail.frequency,
        priority: detail.priority,
      }),
    );
  }

  for (const { year, carModels } of yearResources) {
    for (const car of carModels) {
      entries.push(
        ...localizedEntries({
          base,
          internalPath: `/cars/${car.slug}`,
          year,
          lastModified: lastModifiedForSeason(year, latestYear),
          changeFrequency: "monthly",
          priority: 0.5,
        }),
      );
    }
  }

  const uniqueEntries = new Map<string, SitemapEntry>();
  for (const entry of entries) {
    if (!uniqueEntries.has(entry.url)) uniqueEntries.set(entry.url, entry);
  }
  return [...uniqueEntries.values()];
}
