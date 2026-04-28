import { ImageResponse } from "next/og";
import { getDriver } from "@/lib/api";

export const alt = "WEC Dashboard — Driver";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image({ params }: { params: { id: string } }) {
  let driver: Awaited<ReturnType<typeof getDriver>> | null = null;
  try {
    driver = await getDriver(Number(params.id));
  } catch {
    driver = null;
  }
  if (driver === null) {
    return new ImageResponse(<Fallback title="Driver not found" />, size);
  }

  const titles = driver.seasons.filter((s) => s.championshipPosition === 1).length;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "linear-gradient(135deg, #0b0b0d 0%, #1a1216 100%)",
          color: "white",
          fontFamily: "sans-serif",
          padding: 64,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            flex: 1,
            paddingRight: 48,
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

          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            {driver.raceClass && (
              <div
                style={{
                  display: "flex",
                  fontSize: 24,
                  color: "#9ca3af",
                  textTransform: "uppercase",
                  letterSpacing: 4,
                }}
              >
                {driver.raceClass} {driver.carNumber ? `· #${driver.carNumber}` : ""}
              </div>
            )}
            <div style={{ display: "flex", fontSize: 92, fontWeight: 800, lineHeight: 1 }}>
              {driver.name}
            </div>
            {driver.team && (
              <div style={{ display: "flex", fontSize: 32, color: "#9ca3af" }}>
                {driver.team}
              </div>
            )}
            {titles > 0 && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  fontSize: 28,
                  color: "#fbbf24",
                  fontWeight: 700,
                }}
              >
                🏆 {titles}× WEC champion
              </div>
            )}
          </div>

          <div style={{ display: "flex", fontSize: 18, color: "#6b7280" }}>
            wec-dashboard.vercel.app
          </div>
        </div>

        {driver.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={driver.photoUrl}
            alt=""
            width={420}
            height={500}
            style={{
              width: 420,
              height: 500,
              objectFit: "cover",
              borderRadius: 24,
              alignSelf: "center",
            }}
          />
        )}
      </div>
    ),
    size,
  );
}

function Fallback({ title }: { title: string }) {
  return (
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
      {title}
    </div>
  );
}
