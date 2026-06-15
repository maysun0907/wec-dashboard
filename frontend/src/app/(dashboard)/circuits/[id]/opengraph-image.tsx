import { ImageResponse } from "next/og";
import { getCircuit } from "@/lib/api";
import { OgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og-card";
import { loadOgFonts } from "@/lib/og-fonts";

export const alt = "WEC Dashboard - Circuit";
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

  let circuit: Awaited<ReturnType<typeof getCircuit>> | null = null;
  try {
    circuit = await getCircuit(Number(id));
  } catch {
    circuit = null;
  }
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
