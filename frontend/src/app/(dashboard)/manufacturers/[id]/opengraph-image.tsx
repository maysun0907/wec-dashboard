import { ImageResponse } from "next/og";
import { getManufacturer } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgResource } from "@/lib/og-data";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Manufacturer";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Cache the generated card instead of re-rendering it on every scrape.
// A dynamic-param route needs force-static for the first request to a
// given id to be cached at the CDN (revalidate alone isn't enough);
// revalidate then sets the daily refresh window. The card only changes
// when the underlying season data does.
export const dynamic = "force-static";
export const revalidate = 86400;

type Params = { id: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const fonts = await loadOgFonts();

  // Always render the latest season here. Crawlers never carry the
  // season cookie, so reading it only forced this route dynamic and
  // defeated CDN caching of the generated card.
  const manuf = await loadOgResource(() =>
    getManufacturer(Number(id), null, { revalidate }),
  );
  if (manuf === null) {
    return new ImageResponse(
      <OgCard title="Manufacturer not found" tagline="WEC Dashboard" />,
      { ...size, fonts },
    );
  }

  const teamCount = new Set(manuf.cars.map((c) => c.teamId)).size;
  const carCount = manuf.cars.length;
  const teamsPart =
    teamCount > 0 ? `${teamCount} TEAM${teamCount === 1 ? "" : "S"}` : null;
  const carsPart =
    carCount > 0 ? `${carCount} CAR${carCount === 1 ? "" : "S"}` : null;

  const tagline = [
    "MANUFACTURER",
    manuf.country,
    teamsPart,
    carsPart,
  ]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <OgCard title={manuf.name} tagline={tagline} />,
    { ...size, fonts },
  );
}
