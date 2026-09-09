import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";
import { LOCALES } from "./config";
import { catalogTranslator } from "./catalog";
import { dashboardMetadataCopy, type DashboardPage } from "@/lib/dashboard-metadata";

type Catalog = Record<string, Record<string, string>>;
const read = (locale: string): Catalog => JSON.parse(readFileSync(new URL(`../../messages/${locale}.json`, import.meta.url), "utf8"));
const base = read("en");
function argumentsOf(elements: MessageFormatElement[], names = new Set<string>()) {
  for (const element of elements) {
    if (element.type !== TYPE.literal && element.type !== TYPE.pound) names.add(element.value);
    if (element.type === TYPE.select || element.type === TYPE.plural) for (const option of Object.values(element.options)) argumentsOf(option.value, names);
    if (element.type === TYPE.tag) argumentsOf(element.children, names);
  }
  return [...names].sort();
}
describe("translation catalogs", () => {
  it.each(LOCALES)("%s has all UI messages with valid ICU and matching arguments", (locale) => {
    const messages = read(locale);
    for (const [section, entries] of Object.entries(base)) {
      expect(Object.keys(messages[section]).sort(), section).toEqual(Object.keys(entries).sort());
      for (const [key, source] of Object.entries(entries)) {
        const translated = messages[section][key];
        expect(translated.trim(), `${locale}.${section}.${key}`).not.toBe("");
        expect(argumentsOf(parse(translated)), `${locale}.${section}.${key}`).toEqual(argumentsOf(parse(source)));
      }
    }
    for (const entries of Object.values(messages)) for (const value of Object.values(entries)) expect(() => parse(value)).not.toThrow();
  });
  it.each(LOCALES.filter((l) => l !== "en" && l !== "ko"))("%s has unique localized search copy for all page families", (locale) => {
    const pages: DashboardPage[] = ["home", "races", "standings", "drivers", "teams", "cars", "circuits", "rules", "stats", "live", "genesis", "seasonCompare", "standingsSimulator", "driverCompare", "manufacturerCompare"];
    const descriptions = pages.map((page) => {
      const copy = dashboardMetadataCopy(page, locale, 2026);
      expect(copy.title).not.toBe(dashboardMetadataCopy(page, "en", 2026).title);
      expect(copy.description.length).toBeGreaterThan(30);
      expect(copy.title).not.toMatch(/\{year\}/);
      return copy.description;
    });
    expect(new Set(descriptions).size).toBe(pages.length);
    const t = catalogTranslator(locale);
    for (const kind of ["driver", "team", "manufacturer", "car", "circuit"]) {
      expect(t(`seo.${kind}Title`, { name: "Example", year: 2026 })).toContain("Example");
      expect(t(`seo.${kind}Description`, { name: "Example", year: 2026 })).toContain("Example");
    }
  });
});
