import { ImageResponse } from "next/og";
import { getCircuit } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgResource } from "@/lib/og-data";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Circuit";
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

  const circuit = await loadOgResource(() =>
    getCircuit(Number(id), { revalidate }),
  );
  if (circuit === null) {
    return new ImageResponse(
      <OgCard title="Circuit not found" tagline="WEC Dashboard" />,
      { ...size, fonts },
    );
  }

  const lengthPart = circuit.lengthKm
    ? `${circuit.lengthKm.toFixed(3)} KM`
    : null;
  const racesPart =
    circuit.events.length > 0
      ? `${circuit.events.length} WEC RACE${circuit.events.length === 1 ? "" : "S"}`
      : null;
  const tagline = ["CIRCUIT", circuit.country, lengthPart, racesPart]
    .filter(Boolean)
    .join(" · ");

  return new ImageResponse(
    <OgCard title={circuit.name} tagline={tagline} />,
    { ...size, fonts },
  );
}
