import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import { LOCALES } from "./config";
import { preferredLocale, localeFromAcceptLanguage } from "./negotiation";
import { buildPublicPath, parsePublicPath, switchLocaleInPublicHref } from "@/lib/public-routing";
import { pageMetadataUrls } from "@/lib/page-metadata";

afterEach(() => vi.unstubAllEnvs());

describe("locale negotiation", () => {
  it("respects explicit preference before country, then weighted browser preferences", () => {
    expect(preferredLocale("fr", "JP", "en")).toBe("fr");
    expect(preferredLocale(undefined, "JP", "en")).toBe("ja");
    expect(preferredLocale(undefined, "BR", "en")).toBe("pt-BR");
    expect(preferredLocale(undefined, "CH", "de;q=0.2,fr;q=0.9")).toBe("fr");
    expect(preferredLocale("invalid", null, "xx")).toBe("en");
    expect(localeFromAcceptLanguage("en;q=0,ja;q=0.8,ko;q=0.1")).toBe("ja");
    expect(localeFromAcceptLanguage("zh-Hans-CN")).toBe("zh-CN");
    expect(localeFromAcceptLanguage("pt-PT")).toBe("pt-BR");
    expect(localeFromAcceptLanguage("ja;q=no,en;q=0.5")).toBe("en");
  });
  it("uses edge geo only on Vercel and never redirects a localized URL", () => {
    const request = (path: string) => new NextRequest(`https://www.wecdash.com${path}`, { headers: { "x-vercel-ip-country": "JP", "accept-language": "de" } });
    vi.stubEnv("VERCEL", "0");
    expect(proxy(request("/")).headers.get("location")).toContain("/de/");
    vi.stubEnv("VERCEL", "1");
    const landing = proxy(request("/"));
    expect(landing.headers.get("location")).toContain("/ja/");
    expect(landing.headers.get("cache-control")).toBe("private, no-store");
    const localized = proxy(request("/fr/2026/races"));
    expect(localized.headers.get("location")).toBeNull();
    expect(localized.headers.get("x-middleware-request-x-wec-locale")).toBe("fr");
  });
  it.each(LOCALES)("keeps %s route, query, fragment and reciprocal alternates", (locale) => {
    const path = buildPublicPath("/races", locale, 2025)!;
    expect(parsePublicPath(path)?.locale).toBe(locale);
    expect(switchLocaleInPublicHref("/ko/2025/drivers/compare?ids=1,2#form", locale)).toBe(`/${locale}/2025/drivers/compare?ids=1,2#form`);
    const urls = pageMetadataUrls({ path: "/races/665", locale, year: 2026 });
    expect(urls.canonical).toBe(`/${locale}/races/665`);
    expect(Object.keys(urls.languages)).toHaveLength(10);
    for (const language of LOCALES) expect(urls.languages[language]).toBe(`/${language}/races/665`);
  });
});
