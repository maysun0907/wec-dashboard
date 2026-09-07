"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { startVisibleRefresh } from "@/lib/visible-refresh";
import type { RaceWindow } from "@/lib/cache-policy";

export function RaceAutoRefresh({ dateStart, dateEnd }: RaceWindow) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (pending) return;
    return startVisibleRefresh({ dateStart, dateEnd }, () => {
      startTransition(() => router.refresh());
    }, document);
  }, [dateStart, dateEnd, router, pending]);
  return null;
}
