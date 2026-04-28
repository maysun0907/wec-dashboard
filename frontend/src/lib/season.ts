import { cookies } from "next/headers";

const COOKIE = "wec_season";
/** Sentinel for "use whatever the API treats as latest". Lets the user
 *  reset to the auto-rolling default after exploring an old season. */
export const LATEST_SENTINEL = "latest";

/** Server-side: read the user's selected season (year) from cookies.
 *  Returns null when no season is pinned — getters should omit the
 *  `?year=` query so the API picks the latest ingested season. */
export async function getSelectedSeason(): Promise<number | null> {
  const c = await cookies();
  const raw = c.get(COOKIE)?.value;
  if (!raw || raw === LATEST_SENTINEL) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}
