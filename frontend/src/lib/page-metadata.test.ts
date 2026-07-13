import { describe, expect, it } from "vitest";
import { pageMetadata } from "./page-metadata";

describe("pageMetadata", () => {
  it("uses the page route for canonical and Open Graph URLs", () => {
    const metadata = pageMetadata({
      title: "Drivers",
      path: "/drivers",
      description: "Driver description",
      locale: "en",
      year: 2026,
    });

    expect(metadata.alternates?.canonical).toBe("/en/2026/drivers");
    expect(metadata.alternates?.languages).toEqual({
      en: "/en/2026/drivers",
      ko: "/ko/2026/drivers",
      "x-default": "/en/2026/drivers",
    });
    expect(metadata.openGraph?.url).toBe("/en/2026/drivers");
    expect(metadata.openGraph?.title).toBe("Drivers · WEC Dashboard");
    expect(metadata.twitter?.title).toBe("Drivers · WEC Dashboard");
  });

  it("keeps a page-specific description in the social metadata", () => {
    const metadata = pageMetadata({
      title: "Rules",
      path: "/rules",
      description: "Rules description",
      locale: "ko",
      year: 2026,
    });

    expect(metadata.description).toBe("Rules description");
    expect(metadata.openGraph?.description).toBe("Rules description");
    expect(metadata.twitter?.description).toBe("Rules description");
    expect(metadata.openGraph?.locale).toBe("ko_KR");
    expect(metadata.openGraph?.alternateLocale).toEqual(["en_US"]);
    expect(metadata.alternates?.canonical).toBe("/ko/rules");
  });
});
