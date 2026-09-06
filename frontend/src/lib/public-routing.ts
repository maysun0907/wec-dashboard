import {
  DEFAULT_LOCALE,
  type Locale,
  isLocale,
} from "@/i18n/config";

export const PUBLIC_ROUTE_LOCALE_HEADER = "x-wec-locale";
export const PUBLIC_ROUTE_SEASON_HEADER = "x-wec-season";
export const PUBLIC_ROUTE_PATH_HEADER = "x-wec-public-path";

export const MIN_SEASON_YEAR = 2012;

/**
 * Routes whose rendered data changes with the selected championship season.
 * Keep this list explicit: it is also the source of truth for metadata and
 * sitemap generation, so adding a page here is an intentional SEO decision.
 */
export const SEASON_SCOPED_PATHS = [
  "/",
  "/races",
  "/standings",
  "/standings/simulator",
  "/drivers",
  "/drivers/compare",
  "/teams",
  "/cars",
  "/circuits",
  "/manufacturers/compare",
  "/genesis-wec",
] as const;

/** Routes that have one canonical URL per language rather than per season. */
export const LOCALE_ONLY_PATHS = [
  "/live",
  "/rules",
  "/stats",
  "/seasons/compare",
] as const;

/** Detail pages identify a stable entity/event and therefore omit the year. */
export const LOCALE_ONLY_DETAIL_BASES = [
  "races",
  "drivers",
  "teams",
  "circuits",
  "manufacturers",
] as const;

/** Detail data for these entities changes materially by season. */
export const SEASON_SCOPED_DETAIL_BASES = ["cars"] as const;

export type PublicRouteScope = "season" | "locale";

export type PublicRoute = {
  locale: Locale;
  year: number | null;
  scope: PublicRouteScope;
  internalPath: string;
  publicPath: string;
};

type InternalRoute = {
  scope: PublicRouteScope;
  internalPath: string;
};

function normalizePathname(pathname: string): string {
  const withLeadingSlash = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (withLeadingSlash === "/") return withLeadingSlash;
  return withLeadingSlash.replace(/\/+$/, "");
}

export function isSeasonYear(value: string | number | undefined): boolean {
  const year = typeof value === "number" ? value : Number(value);
  return (
    Number.isInteger(year) &&
    year >= MIN_SEASON_YEAR &&
    year <= getDefaultSeasonYear()
  );
}

export function getDefaultSeasonYear(now = new Date()): number {
  return Math.max(MIN_SEASON_YEAR, now.getUTCFullYear());
}

export function matchInternalPublicRoute(pathname: string): InternalRoute | null {
  const normalized = normalizePathname(pathname);

  if ((SEASON_SCOPED_PATHS as readonly string[]).includes(normalized)) {
    return { scope: "season", internalPath: normalized };
  }

  if ((LOCALE_ONLY_PATHS as readonly string[]).includes(normalized)) {
    return { scope: "locale", internalPath: normalized };
  }

  const segments = normalized.split("/").filter(Boolean);
  if (
    segments.length === 2 &&
    (SEASON_SCOPED_DETAIL_BASES as readonly string[]).includes(segments[0]!) &&
    segments[1]
  ) {
    return { scope: "season", internalPath: normalized };
  }
  if (
    segments.length === 2 &&
    (LOCALE_ONLY_DETAIL_BASES as readonly string[]).includes(segments[0]!) &&
    segments[1]
  ) {
    return { scope: "locale", internalPath: normalized };
  }

  return null;
}

/** Parse only canonical public URLs. Non-canonical localized shims return null. */
export function parsePublicPath(pathname: string): PublicRoute | null {
  const normalized = normalizePathname(pathname);
  const segments = normalized.split("/").filter(Boolean);
  const localeSegment = segments[0];
  if (!isLocale(localeSegment)) return null;

  const possibleYear = segments[1];
  if (isSeasonYear(possibleYear)) {
    const internalPath = `/${segments.slice(2).join("/")}`;
    const route = matchInternalPublicRoute(internalPath);
    if (!route || route.scope !== "season") return null;
    return {
      locale: localeSegment,
      year: Number(possibleYear),
      scope: route.scope,
      internalPath: route.internalPath,
      publicPath: normalized,
    };
  }

  const internalPath = `/${segments.slice(1).join("/")}`;
  const route = matchInternalPublicRoute(internalPath);
  if (!route || route.scope !== "locale") return null;
  return {
    locale: localeSegment,
    year: null,
    scope: route.scope,
    internalPath: route.internalPath,
    publicPath: normalized,
  };
}

/**
 * Resolve both canonical URLs and localized compatibility shims. This lets the
 * proxy redirect `/ko/races` to `/ko/2026/races` and strip an accidental year
 * from detail URLs without rendering duplicate pages.
 */
export function resolveLocalizedPath(pathname: string): PublicRoute | null {
  const canonical = parsePublicPath(pathname);
  if (canonical) return canonical;

  const normalized = normalizePathname(pathname);
  const segments = normalized.split("/").filter(Boolean);
  const localeSegment = segments[0];
  if (!isLocale(localeSegment)) return null;

  const possibleYear = segments[1];
  if (isSeasonYear(possibleYear)) {
    const internalPath = `/${segments.slice(2).join("/")}`;
    const route = matchInternalPublicRoute(internalPath);
    if (!route) return null;
    return {
      locale: localeSegment,
      year: Number(possibleYear),
      scope: route.scope,
      internalPath: route.internalPath,
      publicPath: normalized,
    };
  }

  const internalPath = `/${segments.slice(1).join("/")}`;
  const route = matchInternalPublicRoute(internalPath);
  if (!route) return null;
  return {
    locale: localeSegment,
    year: null,
    scope: route.scope,
    internalPath: route.internalPath,
    publicPath: normalized,
  };
}

export function buildPublicPath(
  pathname: string,
  locale: Locale,
  year: number,
): string | null {
  const parsed = parsePublicPath(pathname);
  const localized = parsed ?? resolveLocalizedPath(pathname);
  const route = localized
    ? { scope: localized.scope, internalPath: localized.internalPath }
    : matchInternalPublicRoute(pathname);
  if (!route) return null;

  if (route.scope === "season") {
    if (!isSeasonYear(year)) return null;
    return route.internalPath === "/"
      ? `/${locale}/${year}`
      : `/${locale}/${year}${route.internalPath}`;
  }

  return `/${locale}${route.internalPath}`;
}

/** Landing page used when a user chooses a season while on a timeless page. */
export function getSeasonLandingPath(pathname: string): string {
  const route = resolveLocalizedPath(pathname);
  const internalPath = route?.internalPath ?? normalizePathname(pathname);
  const [base] = internalPath.split("/").filter(Boolean);

  if (
    base &&
    ["races", "drivers", "teams", "cars", "circuits"].includes(base)
  ) {
    return `/${base}`;
  }

  return "/";
}

function parseRelativeHref(href: string): URL | null {
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  return new URL(href, "https://www.wecdash.com");
}

export function switchLocaleInPublicHref(
  href: string,
  locale: Locale,
  fallbackYear = getDefaultSeasonYear(),
): string {
  const url = parseRelativeHref(href);
  if (!url) return href;
  const current = resolveLocalizedPath(url.pathname);
  const nextPath = buildPublicPath(
    url.pathname,
    locale,
    current?.year ?? fallbackYear,
  );
  return nextPath ? `${nextPath}${url.search}${url.hash}` : href;
}

export function switchSeasonInPublicHref(
  href: string,
  locale: Locale,
  year: number,
): string {
  const url = parseRelativeHref(href);
  if (!url || !isSeasonYear(year)) return href;

  const current = resolveLocalizedPath(url.pathname);
  const currentSegments = current?.internalPath.split("/").filter(Boolean) ?? [];
  const isSeasonScopedDetail =
    current?.scope === "season" &&
    currentSegments.length === 2 &&
    (SEASON_SCOPED_DETAIL_BASES as readonly string[]).includes(
      currentSegments[0]!,
    );
  const targetInternalPath =
    current?.scope === "season" && !isSeasonScopedDetail
      ? current.internalPath
      : getSeasonLandingPath(url.pathname);
  const nextPath = buildPublicPath(targetInternalPath, locale, year);
  // Entity IDs and simulator picks belong to the previous season's grid.
  if (current?.year !== year) {
    for (const parameter of ["ids", "p", "session"]) url.searchParams.delete(parameter);
  }
  return nextPath ? `${nextPath}${url.search}${url.hash}` : href;
}

/** Metadata/static assets must reach Next's generated handlers untouched. */
export function shouldBypassPublicRouting(pathname: string): boolean {
  if (pathname.startsWith("/_next/") || pathname.startsWith("/api/")) {
    return true;
  }

  if (
    /\/(?:opengraph-image|twitter-image|icon|apple-icon)(?:[/-]|$)/.test(
      pathname,
    )
  ) {
    return true;
  }

  if (
    [
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
      "/manifest.webmanifest",
    ].includes(pathname)
  ) {
    return true;
  }

  return /\.[^/]+$/.test(pathname);
}

export function localeOrDefault(value: string | undefined): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
