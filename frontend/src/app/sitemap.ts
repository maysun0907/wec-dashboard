import type { MetadataRoute } from "next";
import {
  getCarModels,
  getCircuits,
  getDrivers,
  getEvents,
  getSeasons,
  getTeams,
} from "@/lib/api";

export const revalidate = 3600;

const STATIC_ROUTES: ReadonlyArray<{
  path: string;
  priority: number;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
}> = [
  { path: "/", priority: 1.0, changeFrequency: "hourly" },
  { path: "/live", priority: 0.9, changeFrequency: "hourly" },
  { path: "/races", priority: 0.9, changeFrequency: "daily" },
  { path: "/standings", priority: 0.9, changeFrequency: "daily" },
  { path: "/drivers", priority: 0.8, changeFrequency: "daily" },
  { path: "/teams", priority: 0.8, changeFrequency: "daily" },
  { path: "/cars", priority: 0.8, changeFrequency: "weekly" },
  { path: "/circuits", priority: 0.7, changeFrequency: "monthly" },
  { path: "/rules", priority: 0.6, changeFrequency: "monthly" },
  { path: "/bop", priority: 0.6, changeFrequency: "weekly" },
  { path: "/stats", priority: 0.6, changeFrequency: "weekly" },
  { path: "/standings/simulator", priority: 0.5, changeFrequency: "weekly" },
  { path: "/drivers/compare", priority: 0.5, changeFrequency: "monthly" },
  { path: "/manufacturers/compare", priority: 0.5, changeFrequency: "monthly" },
  { path: "/seasons/compare", priority: 0.5, changeFrequency: "monthly" },
];

function siteUrl(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const now = new Date();

  const entries: MetadataRoute.Sitemap = STATIC_ROUTES.map((r) => ({
    url: `${base}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));

  // Iterate every season we have so historical race pages also get
  // crawled — those are the long-tail-keyword goldmine (e.g. "WEC
  // Le Mans 2018 results").
  const seasons = await safe(getSeasons(), []);
  const years = seasons.map((s) => s.year);

  const eventsByYear = await Promise.all(
    years.map((y) => safe(getEvents(y), [])),
  );
  for (const events of eventsByYear) {
    for (const ev of events) {
      entries.push({
        url: `${base}/races/${ev.id}`,
        lastModified: new Date(ev.dateEnd ?? ev.dateStart ?? now),
        changeFrequency: "weekly",
        priority: 0.7,
      });
    }
  }

  // Current-season drivers / teams / cars — detail pages include
  // historical data, so one URL per entity is enough.
  const [drivers, teams, carModels, circuits] = await Promise.all([
    safe(getDrivers(), []),
    safe(getTeams(), []),
    safe(getCarModels(), []),
    safe(getCircuits(), []),
  ]);

  for (const d of drivers) {
    entries.push({
      url: `${base}/drivers/${d.id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const t of teams) {
    entries.push({
      url: `${base}/teams/${t.id}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.6,
    });
  }
  for (const c of carModels) {
    entries.push({
      url: `${base}/cars/${c.slug}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }
  for (const c of circuits) {
    entries.push({
      url: `${base}/circuits/${c.id}`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    });
  }

  return entries;
}
