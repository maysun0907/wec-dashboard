const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export function parseEventRevision(value: unknown): string | null {
  if (!value || typeof value !== "object" || !("version" in value)) return null;
  return typeof value.version === "string" && /^[a-f0-9]{64}$/.test(value.version)
    ? value.version
    : null;
}

/** Check Railway directly; unchanged snapshots do not touch Vercel. */
export async function raceRefreshNeeded(
  eventId: number,
  current: string | null,
  crossedBoundary: boolean,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return false;
  if (crossedBoundary || !current) return true;
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timeout = setTimeout(abort, 8_000);
  signal.addEventListener("abort", abort, { once: true });
  try {
    const response = await fetch(`${API_URL}/api/v1/events/${eventId}/revision`, {
      signal: controller.signal,
    });
    if (controller.signal.aborted) return false;
    if (response.status === 404) return true; // Old backend or removed event.
    if (!response.ok) return false;
    const next = parseEventRevision(await response.json());
    return !controller.signal.aborted && next !== null && next !== current;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
