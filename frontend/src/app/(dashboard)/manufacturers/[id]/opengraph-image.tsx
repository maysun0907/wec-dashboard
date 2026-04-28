import { ImageResponse } from "next/og";
import { getManufacturer } from "@/lib/api";

export const alt = "WEC Dashboard — Manufacturer";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  let manuf: Awaited<ReturnType<typeof getManufacturer>> | null = null;
  try {
    manuf = await getManufacturer(Number(params.id));
  } catch {
    manuf = null;
  }
  if (manuf === null) {
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
          Manufacturer not found
        </div>
      ),
      size,
    );
  }

  const titles = manuf.seasons.filter((s) => s.championshipPosition === 1).length;
  const carCount = manuf.cars.length;

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
          WEC Dashboard
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 56 }}>
          {manuf.logoUrl && (
            <div
              style={{
                width: 280,
                height: 280,
                borderRadius: 32,
                background: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 32,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={manuf.logoUrl}
                alt=""
                width={216}
                height={216}
                style={{ width: "100%", height: "100%", objectFit: "contain" }}
              />
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", fontSize: 100, fontWeight: 800, lineHeight: 1 }}>
              {manuf.name}
            </div>
            {titles > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 32,
                  color: "#fbbf24",
                  fontWeight: 700,
                }}
              >
                🏆 {titles}× constructor&rsquo;s champion
              </div>
            )}
            <div style={{ display: "flex", fontSize: 28, color: "#9ca3af" }}>
              {carCount > 0
                ? `${carCount} cars · ${manuf.seasons.length} seasons`
                : `${manuf.seasons.length} seasons`}
            </div>
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
