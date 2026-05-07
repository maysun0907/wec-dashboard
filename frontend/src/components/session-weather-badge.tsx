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
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs text-muted-foreground">
      <span className="font-mono tabular-nums">
        {w.airTempC != null && (
          <>
            <span className="mr-1" aria-label="weather condition">
              {emoji}
            </span>
            {Math.round(w.airTempC)}°C
          </>
        )}
        {w.trackTempC != null && (
          <>
            <span className="mx-1.5 opacity-60">·</span>
            Track {Math.round(w.trackTempC)}°C
          </>
        )}
        {w.humidityPct != null && (
          <>
            <span className="mx-1.5 opacity-60">·</span>
            <span className="mr-1" aria-label="humidity">💧</span>
            {Math.round(w.humidityPct)}%
          </>
        )}
      </span>
    </span>
  );
}
