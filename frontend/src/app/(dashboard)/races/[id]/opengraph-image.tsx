import { ImageResponse } from "next/og";
import { getEvent } from "@/lib/api";

export const alt = "WEC Dashboard — Race";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  let event: Awaited<ReturnType<typeof getEvent>> | null = null;
  try {
    event = await getEvent(Number(params.id));
  } catch {
    event = null;
  }
  if (event === null) {
    return new ImageResponse(
      (
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#0b0b0d",
            color: "white",
            fontSize: 64,
            fontFamily: "sans-serif",
          }}
        >
          Race not found
        </div>
      ),
      size,
    );
  }

  const dateStart = event.dateStart;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "linear-gradient(135deg, #0b0b0d 0%, #1a1216 100%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: 64,
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            fontSize: 22,
            color: "#cf1b2c",
            fontWeight: 700,
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          <div style={{ width: 14, height: 14, borderRadius: 999, background: "#cf1b2c" }} />
          WEC Dashboard · Round {event.round}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <div
            style={{
              display: "flex",
              fontSize: 96,
              fontWeight: 800,
              lineHeight: 1.05,
              maxWidth: "100%",
            }}
          >
            {event.name}
          </div>
          <div style={{ display: "flex", fontSize: 36, color: "#9ca3af" }}>
            {event.circuit.name}
          </div>
          <div style={{ display: "flex", gap: 24, fontSize: 28, color: "#d1d5db" }}>
            <span>{dateStart}</span>
            {event.format && <span>· {event.format}</span>}
          </div>
        </div>

        <div style={{ display: "flex", fontSize: 18, color: "#6b7280" }}>
          wec-dashboard.vercel.app
        </div>
      </div>
    ),
    size,
  );
}
