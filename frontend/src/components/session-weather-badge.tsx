import { getSessionWeather } from "@/lib/api";

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
  const parts: string[] = [];
  if (w.airTempC != null) parts.push(`Air ${Math.round(w.airTempC)}°C`);
  if (w.trackTempC != null) parts.push(`Track ${Math.round(w.trackTempC)}°C`);
  if (w.humidityPct != null) parts.push(`${Math.round(w.humidityPct)}%`);
  return (
    <span className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2 py-0.5 text-xs text-muted-foreground">
      {w.rain && (
        <span className="font-medium text-[var(--racing-yellow)]">Rain</span>
      )}
      <span className="font-mono tabular-nums">{parts.join(" · ")}</span>
    </span>
  );
}
