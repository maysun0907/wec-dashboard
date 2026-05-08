import type { ReactNode } from "react";
import { getSessionWeather } from "@/lib/api";

/** Pick an at-a-glance condition emoji from rain + humidity. We don't
 *  have a cloud-cover reading from Al Kamel, so humidity is the proxy:
 *  85+ = overcast, 65-84 = partly cloudy, 45-64 = mostly clear, <45 =
 *  clear. Rain wins outright. */
function conditionEmoji(
  humidity: number | null,
  rain: boolean,
): string {
  if (rain) return "🌧️";
  if (humidity == null) return "🌡️";
  if (humidity >= 85) return "☁️";
  if (humidity >= 65) return "⛅";
  if (humidity >= 45) return "🌤️";
  return "☀️";
}

/** Small inline badge that shows session weather summary. Server
 *  component — fetches at render time and serves nothing if the Al
 *  Kamel weather CSV hasn't been published yet. */
export async function SessionWeatherBadge({
  sessionId,
}: {
  sessionId: number;
}) {
  let w;
  try {
    w = await getSessionWeather(sessionId);
  } catch {
    return null;
  }
  if (
    w.airTempC == null &&
    w.trackTempC == null &&
    w.humidityPct == null &&
    !w.rain
  ) {
    return null;
  }
  const emoji = conditionEmoji(w.humidityPct, w.rain);
  // Build the parts list bottom-up so a session that only reports
  // rain (no temperatures) still shows the rain emoji + "Rain" text
  // — the original code gated the emoji on airTempC and rendered an
  // empty span in that edge case.
  const parts: ReactNode[] = [];
  if (w.airTempC != null) {
    parts.push(`${Math.round(w.airTempC)}°C`);
  } else if (w.rain) {
    parts.push("Rain");
  }
  if (w.trackTempC != null) {
    parts.push(`Track ${Math.round(w.trackTempC)}°C`);
  }
  if (w.humidityPct != null) {
    parts.push(
      <>
        <span aria-hidden className="mr-1">
          💧
        </span>
        {Math.round(w.humidityPct)}%
      </>,
    );
  }
  const ariaLabel = [
    w.rain ? "rain" : "dry",
    w.airTempC != null ? `air ${Math.round(w.airTempC)}°C` : null,
    w.trackTempC != null ? `track ${Math.round(w.trackTempC)}°C` : null,
    w.humidityPct != null ? `${Math.round(w.humidityPct)}% humidity` : null,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <span
      className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs text-muted-foreground"
      aria-label={ariaLabel}
    >
      <span aria-hidden>{emoji}</span>
      <span className="font-mono tabular-nums">
        {parts.map((p, i) => (
          <span key={i}>
            {i > 0 && <span className="mx-1.5 opacity-60">·</span>}
            {p}
          </span>
        ))}
      </span>
    </span>
  );
}
