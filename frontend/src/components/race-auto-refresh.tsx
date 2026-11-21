"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { startVisibleRefresh } from "@/lib/visible-refresh";
import type { RaceWindow } from "@/lib/cache-policy";
import { raceRefreshNeeded } from "@/lib/event-revision";

export function RaceAutoRefresh({
  dateStart,
  dateEnd,
  eventId,
  revision,
  refreshAt,
}: RaceWindow & { eventId: number; revision: string | null; refreshAt?: number }) {
  const router = useRouter();
  useEffect(() => {
    return startVisibleRefresh({ dateStart, dateEnd }, async (signal, crossedBoundary) => {
      if (await raceRefreshNeeded(eventId, revision, crossedBoundary, signal) &&
          !signal.aborted && document.visibilityState === "visible") router.refresh();
    }, document, refreshAt);
  }, [dateStart, dateEnd, eventId, revision, refreshAt, router]);
  return null;
}
