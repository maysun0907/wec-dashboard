import { cookies, headers } from "next/headers";

import {
  PUBLIC_ROUTE_SEASON_HEADER,
  isSeasonYear,
} from "@/lib/public-routing";

export const SEASON_COOKIE = "wec_season";
/** Sentinel for "use whatever the API treats as latest". Lets the user
 *  reset to the auto-rolling default after exploring an old season. */
export const LATEST_SENTINEL = "latest";

/** Server-side: read the season fixed by the public URL, then the cookie.
 *  `latest` on locale-only routes intentionally wins over a historical
 *  browser cookie so one canonical detail URL always renders the same view. */
export async function getSelectedSeason(): Promise<number | null> {
  const headerStore = await headers();
  const routed = headerStore.get(PUBLIC_ROUTE_SEASON_HEADER);
  if (routed === LATEST_SENTINEL) return null;
  if (routed && isSeasonYear(routed)) return Number(routed);

  const cookieStore = await cookies();
  const raw = cookieStore.get(SEASON_COOKIE)?.value;
  if (!raw || raw === LATEST_SENTINEL) return null;
  return isSeasonYear(raw) ? Number(raw) : null;
}
