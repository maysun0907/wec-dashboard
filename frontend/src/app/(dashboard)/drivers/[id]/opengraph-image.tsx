import { ImageResponse } from "next/og";
import { getDriver, raceClassLabel } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Driver";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = { id: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const fonts = await loadOgFonts();

  let driver: Awaited<ReturnType<typeof getDriver>> | null = null;
  try {
    const year = await getSelectedSeason();
    driver = await getDriver(Number(id), year);
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
