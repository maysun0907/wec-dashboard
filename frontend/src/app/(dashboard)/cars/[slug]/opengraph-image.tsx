import { ImageResponse } from "next/og";
import { getCarModel, raceClassLabel } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Car";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = { slug: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { slug } = await params;
  const fonts = await loadOgFonts();

  let car: Awaited<ReturnType<typeof getCarModel>> | null = null;
  try {
    const year = await getSelectedSeason();
    car = await getCarModel(slug, year);
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
