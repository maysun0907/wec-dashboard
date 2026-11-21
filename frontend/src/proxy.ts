import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  type Locale,
} from "@/i18n/config";
import {
  SEASON_COOKIE,
  RACE_SESSION_TYPES,
  buildPublicPath,
  getDefaultSeasonYear,
  isSeasonYear,
  matchInternalPublicRoute,
  resolveLocalizedPath,
  shouldBypassPublicRouting,
} from "@/lib/public-routing";
import { preferredLocale } from "@/i18n/negotiation";

function landingLocale(request: NextRequest): Locale {
  return preferredLocale(
    request.cookies.get(LOCALE_COOKIE)?.value,
    process.env.VERCEL === "1" ? request.headers.get("x-vercel-ip-country") : null,
    request.headers.get("accept-language"),
  );
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
  response.headers.set("vary", "Accept-Language, Cookie, X-Vercel-IP-Country");
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

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (shouldBypassPublicRouting(pathname)) return NextResponse.next();
  const legacyBop = pathname.match(new RegExp(`^/(?:(` + LOCALES.join("|") + `)/)?bop/?$`));
  if (legacyBop) {
    return redirectToPublicPath(request, `/${legacyBop[1] ?? DEFAULT_LOCALE}/rules`, 308);
  }

  // Preserve old shared links while avoiding unbounded query-based renders.
  const session = request.nextUrl.searchParams.getAll("session");
  const type = session.length === 1 ? session[0]?.trim().toUpperCase() : null;
  if (/^\/[^/]+\/races\/[1-9]\d*$/.test(pathname) && session.length > 0) {
    const destination = request.nextUrl.clone();
    destination.searchParams.delete("session");
    if (RACE_SESSION_TYPES.some((allowed) => allowed === type)) {
      destination.pathname = `${pathname}/${type}`;
    }
    return NextResponse.redirect(destination, 307);
  }

  // Preserve old localized entry points without rendering duplicate pages.
  const localizedShim = resolveLocalizedPath(pathname);
  if (localizedShim) {
    const canonicalPath = buildPublicPath(
      localizedShim.internalPath,
      localizedShim.locale,
      localizedShim.year ?? getDefaultSeasonYear(),
    );
    if (canonicalPath && canonicalPath !== localizedShim.publicPath) {
      return redirectToPublicPath(
        request,
        canonicalPath,
        localizedShim.scope === "season" && localizedShim.year === null
          ? 307
          : 308,
      );
    }
  }

  // Legacy unprefixed entry points redirect before reaching page rendering.
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
  // Next requires literal matchers. The tests check every canonical family
  // against this list so cacheable page and RSC traffic never runs Proxy.
  matcher: [
    "/",
    "/:section(bop|races|standings|drivers|teams|cars|circuits|manufacturers|genesis-wec|live|rules|stats|seasons)",
    "/:section(races|drivers|teams|circuits|manufacturers)/:id(\\d+)",
    "/cars/:slug",
    "/:section(standings|drivers|manufacturers|seasons)/:tool(simulator|compare)",
    "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)",
    "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)/:section(bop|races|standings|drivers|teams|cars|circuits|genesis-wec)",
    "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)/cars/:slug",
    "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)/:section(standings|drivers|manufacturers)/:tool(simulator|compare)",
    "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)/:year(\\d{4})/:section(live|rules|stats)",
    "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)/:year(\\d{4})/:section(races|drivers|teams|circuits|manufacturers)/:id(\\d+)",
    "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)/:year(\\d{4})/seasons/compare",
    {
      source: "/:locale(en|ko|ja|zh-CN|fr|de|it|es|pt-BR)/races/:id([1-9]\\d*)",
      has: [{ type: "query", key: "session" }],
    },
  ],
};
