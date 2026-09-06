import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "./proxy";

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
  it("rewrites a canonical season URL and injects route context", () => {
    const response = proxy(request("/ko/2025/races?class=HYPERCAR"));

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://www.wecdash.com/races?class=HYPERCAR",
    );
    expect(response.headers.get("x-middleware-request-x-wec-locale")).toBe(
      "ko",
    );
    expect(response.headers.get("x-middleware-request-x-wec-season")).toBe(
      "2025",
    );
    expect(response.headers.get("x-middleware-request-x-wec-public-path")).toBe(
      "/ko/2025/races",
    );
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("forces locale-only detail pages to the latest data context", () => {
    const response = proxy(
      request("/en/drivers/709", {
        headers: { cookie: "wec_season=2022" },
      }),
    );

    expect(response.headers.get("x-middleware-rewrite")).toBe(
      "https://www.wecdash.com/drivers/709",
    );
    expect(response.headers.get("x-middleware-request-x-wec-season")).toBe(
      "latest",
    );
  });

  it("allows the internal destination on the second rewrite pass", () => {
    const response = proxy(
      request("/standings", {
        headers: {
          "x-wec-public-path": "/ko/2026/standings",
          "x-wec-locale": "ko",
          "x-wec-season": "2026",
        },
      }),
    );

    expect(response.headers.get("x-middleware-next")).toBe("1");
    expect(response.headers.get("location")).toBeNull();
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
    expect(response.headers.get("vary")).toBe("Accept-Language, Cookie");
  });

  it("canonicalizes localized shims and misplaced detail years", () => {
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
