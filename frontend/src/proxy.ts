import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  type Locale,
  isLocale,
} from "@/i18n/config";
import {
  PUBLIC_ROUTE_LOCALE_HEADER,
  PUBLIC_ROUTE_PATH_HEADER,
  PUBLIC_ROUTE_SEASON_HEADER,
  buildPublicPath,
  getDefaultSeasonYear,
  isSeasonYear,
  matchInternalPublicRoute,
  parsePublicPath,
  resolveLocalizedPath,
  shouldBypassPublicRouting,
} from "@/lib/public-routing";
import { LATEST_SENTINEL, SEASON_COOKIE } from "@/lib/season";

function landingLocale(request: NextRequest): Locale {
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (isLocale(cookieLocale)) return cookieLocale;
  const accepted = request.headers.get("accept-language") ?? "";
  return accepted
    .split(",")
    .map((part) => part.split(";")[0]?.trim().toLowerCase())
    .some((tag) => tag === "ko" || tag?.startsWith("ko-"))
    ? "ko"
    : DEFAULT_LOCALE;
}

function landingSeason(request: NextRequest): number {
  const cookieYear = request.cookies.get(SEASON_COOKIE)?.value;
  return isSeasonYear(cookieYear)
    ? Number(cookieYear)
    : getDefaultSeasonYear();
}

function redirectLanding(request: NextRequest, pathname: string) {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  const response = NextResponse.redirect(destination, 307);
  response.headers.set("cache-control", "private, no-store");
  response.headers.set("vary", "Accept-Language, Cookie");
  return response;
}

function redirectToPublicPath(
  request: NextRequest,
  pathname: string,
  status: 307 | 308,
) {
  const destination = request.nextUrl.clone();
  destination.pathname = pathname;
  const response = NextResponse.redirect(destination, status);
  response.headers.set("cache-control", "no-store");
  return response;
}

function rewritePublicRoute(
  request: NextRequest,
  route: NonNullable<ReturnType<typeof parsePublicPath>>,
) {
  const destination = request.nextUrl.clone();
  destination.pathname = route.internalPath;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(PUBLIC_ROUTE_LOCALE_HEADER, route.locale);
  requestHeaders.set(
    PUBLIC_ROUTE_SEASON_HEADER,
    route.scope === "season" ? String(route.year) : LATEST_SENTINEL,
  );
  requestHeaders.set(PUBLIC_ROUTE_PATH_HEADER, route.publicPath);

  const response = NextResponse.rewrite(destination, {
    request: { headers: requestHeaders },
  });
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (shouldBypassPublicRouting(pathname)) return NextResponse.next();
  const legacyBop = pathname.match(/^\/(?:(en|ko)\/)?bop\/?$/);
  if (legacyBop) {
    return redirectToPublicPath(request, `/${legacyBop[1] ?? DEFAULT_LOCALE}/rules`, 308);
  }

  // Next 16 can run Proxy again for the internal destination of a rewrite.
  // Let that second pass reach the App Router instead of treating `/races`,
  // `/standings`, etc. as a fresh legacy request and redirecting forever.
  const rewrittenPublicPath = request.headers.get(PUBLIC_ROUTE_PATH_HEADER);
  const rewrittenRoute = rewrittenPublicPath
    ? parsePublicPath(rewrittenPublicPath)
    : null;
  const rewrittenSeason =
    rewrittenRoute?.scope === "season"
      ? String(rewrittenRoute.year)
      : LATEST_SENTINEL;
  if (
    rewrittenRoute?.internalPath === pathname &&
    request.headers.get(PUBLIC_ROUTE_LOCALE_HEADER) === rewrittenRoute.locale &&
    request.headers.get(PUBLIC_ROUTE_SEASON_HEADER) === rewrittenSeason
  ) {
    return NextResponse.next();
  }

  const canonicalPublicRoute = parsePublicPath(pathname);
  if (canonicalPublicRoute) {
    return rewritePublicRoute(request, canonicalPublicRoute);
  }

  // A known route with a locale but the wrong URL shape gets one permanent
  // canonical redirect (for example `/ko/races` or `/ko/2026/races/660`).
  const localizedShim = resolveLocalizedPath(pathname);
  if (localizedShim) {
    const canonicalPath = buildPublicPath(
      localizedShim.internalPath,
      localizedShim.locale,
      localizedShim.year ?? getDefaultSeasonYear(),
    );
    if (canonicalPath) {
      return redirectToPublicPath(
        request,
        canonicalPath,
        localizedShim.scope === "season" && localizedShim.year === null
          ? 307
          : 308,
      );
    }
  }

  // Legacy unprefixed indexable routes are kept as permanent entry points but
  // never rendered, preventing duplicate language/season pages in search.
  const legacyRoute = matchInternalPublicRoute(pathname);
  if (legacyRoute) {
    if (pathname === "/") {
      const landingPath = buildPublicPath(
        legacyRoute.internalPath,
        landingLocale(request),
        landingSeason(request),
      );
      if (landingPath) return redirectLanding(request, landingPath);
    }
    const canonicalPath = buildPublicPath(
      legacyRoute.internalPath,
      DEFAULT_LOCALE,
      getDefaultSeasonYear(),
    );
    if (canonicalPath) {
      return redirectToPublicPath(
        request,
        canonicalPath,
        legacyRoute.scope === "season" ? 307 : 308,
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\..*).*)",
  ],
};
