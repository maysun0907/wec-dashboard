"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

const COOKIE = "wec_season";

/** Pin a season for this browser. Pass `null` to clear the pin and let
 *  the API auto-roll to the latest ingested season. */
export async function setSelectedSeason(year: number | null): Promise<void> {
  const c = await cookies();
  if (year === null) {
    c.delete(COOKIE);
  } else {
    c.set(COOKIE, String(year), {
      path: "/",
      // 1 year — the only thing this controls is the user's view default
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }
  // Bust ISR caches so the revisited pages reflect the new season.
  revalidatePath("/", "layout");
}
