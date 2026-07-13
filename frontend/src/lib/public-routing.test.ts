import { describe, expect, it } from "vitest";

import {
  buildPublicPath,
  getSeasonLandingPath,
  matchInternalPublicRoute,
  parsePublicPath,
  resolveLocalizedPath,
  shouldBypassPublicRouting,
  switchLocaleInPublicHref,
  switchSeasonInPublicHref,
} from "./public-routing";

describe("public routing", () => {
  it("parses canonical season and locale-only URLs", () => {
    expect(parsePublicPath("/ko/2026/standings/simulator")).toMatchObject({
      locale: "ko",
      year: 2026,
      scope: "season",
      internalPath: "/standings/simulator",
    });
    expect(parsePublicPath("/en/drivers/709")).toMatchObject({
      locale: "en",
      year: null,
      scope: "locale",
      internalPath: "/drivers/709",
    });
  });

  it("does not accept duplicate season/detail URL shapes as canonical", () => {
    expect(parsePublicPath("/ko/races")).toBeNull();
    expect(parsePublicPath("/ko/2026/races/660")).toBeNull();
    expect(resolveLocalizedPath("/ko/races")).toMatchObject({
      scope: "season",
      internalPath: "/races",
    });
    expect(resolveLocalizedPath("/ko/2026/races/660")).toMatchObject({
      scope: "locale",
      internalPath: "/races/660",
    });
  });

  it("builds one deterministic shape for each route scope", () => {
    expect(buildPublicPath("/", "ko", 2026)).toBe("/ko/2026");
    expect(buildPublicPath("/drivers", "en", 2025)).toBe(
      "/en/2025/drivers",
    );
    expect(buildPublicPath("/drivers/709", "ko", 2025)).toBe(
      "/ko/drivers/709",
    );
    expect(buildPublicPath("/cars/genesis-gmr-001", "ko", 2025)).toBe(
      "/ko/2025/cars/genesis-gmr-001",
    );
    expect(buildPublicPath("/not-a-route", "ko", 2026)).toBeNull();
  });

  it("rejects future season URLs instead of rendering thin pages", () => {
    const future = new Date().getUTCFullYear() + 1;
    expect(parsePublicPath(`/ko/${future}/standings`)).toBeNull();
    expect(buildPublicPath("/standings", "ko", future)).toBeNull();
  });

  it("classifies every requested season-scoped route", () => {
    for (const pathname of [
      "/races",
      "/standings",
      "/drivers",
      "/teams",
      "/cars",
      "/circuits",
      "/standings/simulator",
      "/drivers/compare",
      "/manufacturers/compare",
      "/genesis-wec",
    ]) {
      expect(matchInternalPublicRoute(pathname)?.scope).toBe("season");
    }
  });

  it("preserves query strings and hashes while switching locale", () => {
    expect(
      switchLocaleInPublicHref("/en/2025/races?class=HYPERCAR#calendar", "ko"),
    ).toBe("/ko/2025/races?class=HYPERCAR#calendar");
    expect(switchLocaleInPublicHref("https://example.com", "ko")).toBe(
      "https://example.com",
    );
  });

  it("moves timeless/detail pages to a suitable list when changing season", () => {
    expect(getSeasonLandingPath("/ko/drivers/709")).toBe("/drivers");
    expect(
      switchSeasonInPublicHref("/ko/drivers/709?tab=form", "ko", 2024),
    ).toBe("/ko/2024/drivers?tab=form");
    expect(switchSeasonInPublicHref("/en/rules", "en", 2023)).toBe(
      "/en/2023",
    );
    expect(
      switchSeasonInPublicHref(
        "/ko/2026/cars/genesis-gmr-001",
        "ko",
        2024,
      ),
    ).toBe("/ko/2024/cars");
  });

  it("bypasses generated metadata and static asset routes", () => {
    for (const pathname of [
      "/drivers/709/opengraph-image-1wf1s9",
      "/teams/183/opengraph-image-ke0wwa",
      "/cars/foo/twitter-image-abc",
      "/opengraph-image",
      "/apple-icon.png",
      "/favicon.ico",
      "/manifest.webmanifest",
      "/robots.txt",
      "/sitemap.xml",
      "/_next/static/chunk.js",
      "/images/logo.svg",
    ]) {
      expect(shouldBypassPublicRouting(pathname), pathname).toBe(true);
    }
  });
});
