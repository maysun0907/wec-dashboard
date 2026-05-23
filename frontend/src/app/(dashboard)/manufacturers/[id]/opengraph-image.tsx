import { ImageResponse } from "next/og";
import { getManufacturer } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Manufacturer";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = { id: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const fonts = await loadOgFonts();

  let manuf: Awaited<ReturnType<typeof getManufacturer>> | null = null;
  try {
    const year = await getSelectedSeason();
    manuf = await getManufacturer(Number(id), year);
  } catch {
    manuf = null;
  }
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
