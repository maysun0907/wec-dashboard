"use server";

import { cookies } from "next/headers";

import { isSeasonYear } from "@/lib/public-routing";
import { SEASON_COOKIE } from "@/lib/season";

/** Pin a season for this browser. Pass `null` to clear the pin and let
 *  the API auto-roll to the latest ingested season. */
export async function setSelectedSeason(year: number | null): Promise<void> {
  if (year !== null && !isSeasonYear(year)) return;
  const c = await cookies();
  if (year === null) {
    c.delete(SEASON_COOKIE);
  } else {
    c.set(SEASON_COOKIE, String(year), {
      path: "/",
      // 1 year — the only thing this controls is the user's view default
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
}
