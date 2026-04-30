import { ImageResponse } from "next/og";

export const alt = "WEC Dashboard — schedule, results, standings";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
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
          padding: 80,
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 16,
            fontSize: 26,
            color: "#cf1b2c",
            fontWeight: 700,
            letterSpacing: 6,
            textTransform: "uppercase",
          }}
        >
          <div
            style={{
              width: 16,
              height: 16,
              borderRadius: 999,
              background: "#cf1b2c",
            }}
          />
          FIA World Endurance Championship
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div
            style={{
              display: "flex",
              fontSize: 132,
              fontWeight: 900,
              lineHeight: 0.95,
              letterSpacing: -2,
              textTransform: "uppercase",
            }}
          >
            WEC Dashboard
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 38,
              color: "#9ca3af",
              maxWidth: 980,
              lineHeight: 1.25,
            }}
          >
            Schedule, results, standings, drivers, teams, cars, and Balance
            of Performance for the 2026 Hypercar and LMGT3 grids.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 22,
            color: "#6b7280",
          }}
        >
          <span>wec-dashboard.vercel.app</span>
          <div style={{ display: "flex", gap: 16 }}>
            <span style={{ color: "#cf1b2c" }}>HYPERCAR</span>
            <span>·</span>
            <span style={{ color: "#22c55e" }}>LMGT3</span>
          </div>
        </div>
      </div>
    ),
    size,
  );
}
