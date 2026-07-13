import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CarModelDetail } from "./api";
import { JsonLd, buildSiteUrl, carSchema } from "./json-ld";

const car: CarModelDetail = {
  id: 1,
  slug: "ferrari-499p",
  name: "Ferrari 499P",
  manufacturer: "Ferrari",
  manufacturerLogoUrl: null,
  imageUrl: null,
  category: "LMH",
  engine: "3.0 L twin-turbo V6",
  powerHp: 680,
  weightKg: 1030,
  yearIntroduced: 2023,
  teams: [],
  stats: { races: 0, wins: 0, podiums: 0, poles: 0 },
};

describe("car structured data", () => {
  it("uses Car without declaring product rich-result data", () => {
    const schema = carSchema(car) as Record<string, unknown>;

    expect(schema["@type"]).toBe("Car");
    expect(schema).not.toHaveProperty("offers");
    expect(schema).not.toHaveProperty("review");
    expect(schema).not.toHaveProperty("aggregateRating");
  });

  it("uses the localized public URL for an entity", () => {
    const schema = carSchema(car, { locale: "ko", year: 2026 }) as Record<
      string,
      unknown
    >;

    expect(schema.url).toMatch(/\/ko\/2026\/cars\/ferrari-499p$/);
  });
});

describe("localized structured-data URLs", () => {
  it("adds locale and season to collection URLs", () => {
    expect(buildSiteUrl("/cars", { locale: "ko", year: 2026 })).toMatch(
      /\/ko\/2026\/cars$/,
    );
  });
});

describe("JSON-LD rendering", () => {
  it("escapes less-than signs before embedding external strings", () => {
    const markup = renderToStaticMarkup(
      JsonLd({
        schema: {
          "@context": "https://schema.org",
          "@type": "Thing",
          name: "</script><script>alert(1)</script>",
        },
      }),
    );

    expect(markup).not.toContain("</script><script>");
    expect(markup).toContain("\\u003c/script>");
  });
});
