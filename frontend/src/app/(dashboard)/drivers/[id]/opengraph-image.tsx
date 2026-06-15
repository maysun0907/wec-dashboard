import { ImageResponse } from "next/og";
import { getDriver, raceClassLabel } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Driver";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
// Cache the generated card for a day. Without an explicit revalidate a
// dynamic-param route re-runs the Satori render on every scrape; the
// card only changes when the underlying season data does.
export const revalidate = 86400;

type Params = { id: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const fonts = await loadOgFonts();

  // Always render the latest season here. Crawlers never carry the
  // season cookie, so reading it only forced this route dynamic and
  // defeated CDN caching of the generated card.
  let driver: Awaited<ReturnType<typeof getDriver>> | null = null;
  try {
    driver = await getDriver(Number(id), null);
  } catch {
    driver = null;
  }
  if (driver === null) {
    return new ImageResponse(
      <OgCard title="Driver not found" tagline="WEC Dashboard" />,
      { ...size, fonts },
    );
  }

  const teamPart = driver.team
    ? driver.carNumber
      ? `${driver.team} #${driver.carNumber}`
      : driver.team
    : driver.manufacturer ?? null;

  const classPart = driver.raceClass ? raceClassLabel(driver.raceClass) : null;
  const tagline = [
    "DRIVER",
    driver.nationality,
    classPart,
    teamPart,
  ]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <OgCard title={driver.name} tagline={tagline} />,
    { ...size, fonts },
  );
}
