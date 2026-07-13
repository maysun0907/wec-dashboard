import { describe, expect, it } from "vitest";
import { pageMetadata } from "./page-metadata";

describe("pageMetadata", () => {
  it("uses the page route for canonical and Open Graph URLs", () => {
    const metadata = pageMetadata({
      title: "Drivers",
      path: "/drivers",
    });

    expect(metadata.alternates?.canonical).toBe("/drivers");
    expect(metadata.openGraph?.url).toBe("/drivers");
    expect(metadata.openGraph?.title).toBe("Drivers · WEC Dashboard");
    expect(metadata.twitter?.title).toBe("Drivers · WEC Dashboard");
  });

  it("keeps a page-specific description in the social metadata", () => {
    const metadata = pageMetadata({
      title: "Rules",
      path: "/rules",
      description: "Rules description",
    });

    expect(metadata.description).toBe("Rules description");
    expect(metadata.openGraph?.description).toBe("Rules description");
    expect(metadata.twitter?.description).toBe("Rules description");
  });
});
