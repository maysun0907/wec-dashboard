import { ImageResponse } from "next/og";
import { getCarModel, raceClassLabel } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Car";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Cache the generated card instead of re-rendering it on every scrape.
// A dynamic-param route needs force-static for the first request to a
// given id to be cached at the CDN (revalidate alone isn't enough);
// revalidate then sets the daily refresh window. The card only changes
// when the underlying season data does.
export const dynamic = "force-static";
export const revalidate = 86400;

type Params = { slug: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fonts = await loadOgFonts();

  // Always render the latest season here. Crawlers never carry the
  // season cookie, so reading it only forced this route dynamic and
  // defeated CDN caching of the generated card.
  let car: Awaited<ReturnType<typeof getCarModel>> | null = null;
  try {
    car = await getCarModel(slug, null);
  } catch {
    car = null;
  }
  if (car === null) {
    return new ImageResponse(
      <OgCard title="Car not found" tagline="WEC Dashboard" />,
      { ...size, fonts },
    );
  }

  const primaryClass =
    car.teams.length > 0 ? raceClassLabel(car.teams[0].raceClass) : null;
  const debutPart = car.yearIntroduced ? `DEBUT ${car.yearIntroduced}` : null;
  const tagline = [
    primaryClass,
    car.manufacturer,
    car.engine,
    debutPart,
  ]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <OgCard title={car.name} tagline={tagline} />,
    { ...size, fonts },
  );
}
