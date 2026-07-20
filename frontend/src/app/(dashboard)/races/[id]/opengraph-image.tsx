import { ImageResponse } from "next/og";
import { getEvent, getSessionResults, type RaceClass, raceClassLabel } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgResource } from "@/lib/og-data";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Race";
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

  const event = await loadOgResource(() =>
    getEvent(Number(id), { revalidate }),
  );
  if (event === null) {
    return new ImageResponse(
      <OgCard title="Race not found" tagline="WEC Dashboard" />,
      { ...size, fonts },
    );
  }

  // A missing result set is optional, but a transient upstream error must
  // fail regeneration so ISR retains the previous successful card.
  let classes: RaceClass[] = [];
  const race = event.sessions?.find((s) => s.type?.toUpperCase() === "RACE");
  if (race) {
    const results = await loadOgResource(() =>
      getSessionResults(race.id, { revalidate }),
    );
    if (results) {
      const set = new Set<RaceClass>();
      results.forEach((r) => set.add(r.raceClass));
      classes = Array.from(set);
    }
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
