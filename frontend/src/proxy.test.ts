import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";

import { config, proxy } from "./proxy";
import { LOCALES } from "@/i18n/config";
import {
  LOCALE_ONLY_DETAIL_BASES, LOCALE_ONLY_PATHS, RACE_SESSION_TYPES,
  SEASON_SCOPED_PATHS, buildPublicPath,
} from "@/lib/public-routing";

function request(
  pathname: string,
  init?: ConstructorParameters<typeof NextRequest>[1],
) {
  return new NextRequest(`https://www.wecdash.com${pathname}`, init);
}

describe("public URL proxy", () => {
  it("keeps the language of retired BoP links", () => {
    for (const [from, to] of [["/bop", "/en/rules"], ["/ko/bop", "/ko/rules"]]) {
      const response = proxy(request(from));
      expect(response.status).toBe(308);
      expect(response.headers.get("location")).toBe(`https://www.wecdash.com${to}`);
    }
  });
  it("does not invoke Proxy for any canonical page, including RSC requests", () => {
    const paths = [
      ...SEASON_SCOPED_PATHS, ...LOCALE_ONLY_PATHS,
      ...LOCALE_ONLY_DETAIL_BASES.map((base) => `/${base}/123`),
      ...RACE_SESSION_TYPES.map((type) => `/races/123/${type}`),
      "/cars/ferrari-499p",
    ];
    for (const locale of LOCALES) {
      for (const internal of paths) {
        const path = buildPublicPath(internal, locale, 2025)!;
        expect(matches(path), path).toBe(false);
        expect(matches(`${path}?_rsc=123`), path).toBe(false);
      }
    }
  });

  it("matches old entry points and session queries only", () => {
    for (const path of ["/", "/ja", "/cars/ferrari-499p", "/ko/2026/races/665", "/ko/standings", "/ko/races/665?session=q"]) {
      expect(matches(path), path).toBe(true);
    }
    const response = proxy(request("/ko/races/665?session=%20q%20&class=HYPERCAR"));
    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!, "https://www.wecdash.com").href).toBe(
      "https://www.wecdash.com/ko/races/665/Q?class=HYPERCAR",
    );
    expect(proxy(request("/ko/races/665?session=q&session=FP1")).headers.get("location"))
      .toMatch(/\/ko\/races\/665$/);
  });

  it("does not trust headers from the old rewrite", () => {
    const response = proxy(
      request("/standings", {
        headers: {
          "x-wec-public-path": "/ko/2026/standings",
          "x-wec-locale": "ko",
          "x-wec-season": "2026",
        },
      }),
    );

    expect(response.headers.get("location")).toMatch(/\/en\/\d{4}\/standings$/);
    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("redirects legacy routes to one deterministic English destination", () => {
    const response = proxy(
      request("/standings?class=LMGT3", {
        headers: { cookie: "wec_locale=ko; wec_season=2024" },
      }),
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/www\.wecdash\.com\/en\/\d{4}\/standings\?class=LMGT3$/,
    );
    expect(response.headers.get("vary")).toBeNull();
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("uses a temporary localized gateway only for the bare home URL", () => {
    const response = proxy(
      request("/", { headers: { "accept-language": "ko-KR,ko;q=0.9" } }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toMatch(
      /^https:\/\/www\.wecdash\.com\/ko\/\d{4}$/,
    );
    expect(response.headers.get("vary")).toBe("Accept-Language, Cookie, X-Vercel-IP-Country");
  });

  it("canonicalizes localized shims and misplaced detail years", () => {
    expect(proxy(request("/ja")).headers.get("location")).toMatch(/\/ja\/\d{4}$/);
    const seasonShim = proxy(request("/en/races"));
    expect(seasonShim.status).toBe(307);
    expect(seasonShim.headers.get("location")).toMatch(
      /^https:\/\/www\.wecdash\.com\/en\/\d{4}\/races$/,
    );
    const detailShim = proxy(request("/ko/2026/races/660"));
    expect(detailShim.status).toBe(308);
    expect(detailShim.headers.get("location")).toBe(
      "https://www.wecdash.com/ko/races/660",
    );
  });

  it("leaves generated Open Graph image handlers untouched", () => {
    for (const pathname of [
      "/drivers/709/opengraph-image-1wf1s9",
      "/teams/183/opengraph-image-ke0wwa",
      "/cars/mercedes-amg-gt3-evo/opengraph-image-1jvhdl",
    ]) {
      const response = proxy(request(pathname));
      expect(response.headers.get("x-middleware-next"), pathname).toBe("1");
      expect(response.headers.get("location"), pathname).toBeNull();
      expect(response.headers.get("x-middleware-rewrite"), pathname).toBeNull();
    }
  });
});

function matches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}
