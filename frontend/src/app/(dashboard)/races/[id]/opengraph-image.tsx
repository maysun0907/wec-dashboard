import { ImageResponse } from "next/og";
import { getEvent, getSessionResults, type RaceClass, raceClassLabel } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Race";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

type Params = { id: string };

export default async function Image({ params }: { params: Promise<Params> }) {
  const { id } = await params;
  const fonts = await loadOgFonts();

  let event: Awaited<ReturnType<typeof getEvent>> | null = null;
  try {
    event = await getEvent(Number(id));
  } catch {
    event = null;
  }
  if (event === null) {
    return new ImageResponse(
      <OgCard title="Race not found" tagline="WEC Dashboard" />,
      { ...size, fonts },
    );
  }

  // Try to derive the set of classes that raced - fall back gracefully.
  let classes: RaceClass[] = [];
  try {
    const race = event.sessions?.find((s) => s.type?.toUpperCase() === "RACE");
    if (race) {
      const results = await getSessionResults(race.id);
      const set = new Set<RaceClass>();
      results.forEach((r) => set.add(r.raceClass));
      classes = Array.from(set);
    }
  } catch {
    classes = [];
  }

  const year = event.dateStart ? event.dateStart.slice(0, 4) : null;
  const classPart =
    classes.length > 0
      ? classes.map(raceClassLabel).join(" + ")
      : null;
  const tagline = [
    `ROUND ${event.round}`,
    year,
    classPart,
    event.circuit.country,
  ]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <OgCard title={event.name} tagline={tagline} />,
    { ...size, fonts },
  );
}
