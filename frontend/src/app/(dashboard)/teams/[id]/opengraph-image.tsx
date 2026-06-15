import { ImageResponse } from "next/og";
import { getTeam, raceClassLabel, type RaceClass } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Team";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = { id: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const fonts = await loadOgFonts();

  // Always render the latest season here (the tagline falls back to
  // the newest season the team appears in). Crawlers never carry the
  // season cookie, so reading it only forced this route dynamic and
  // defeated CDN caching of the generated card.
  let team: Awaited<ReturnType<typeof getTeam>> | null = null;
  const year: number | null = null;
  try {
    team = await getTeam(Number(id), null);
  } catch {
    team = null;
  }
  if (team === null) {
    return new ImageResponse(
      <OgCard title="Team not found" tagline="WEC Dashboard" />,
      { ...size, fonts },
    );
  }

  const classes = Array.from(
    new Set<RaceClass>(team.cars.map((c) => c.raceClass)),
  ).map(raceClassLabel);
  const carCount = team.cars.length;
  const yearLabel =
    year ?? (team.seasons.length > 0
      ? Math.max(...team.seasons.map((s) => s.year))
      : null);

  const carsPart =
    carCount > 0 ? `${carCount} CAR${carCount === 1 ? "" : "S"}` : null;
  const tagline = [
    "TEAM",
    yearLabel ? String(yearLabel) : null,
    classes.length > 0 ? classes.join(" + ") : null,
    carsPart,
  ]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <OgCard title={team.name} tagline={tagline} />,
    { ...size, fonts },
  );
}
