"use client";

import { useLocale } from "next-intl";
import { useViewerTimeZone } from "./use-viewer-time-zone";

/** Calendar dates are not instants: UTC keeps the day stable across viewers. */
export function CalendarDate({ iso, style = "medium" }: { iso: string; style?: "short" | "medium" | "full" }) {
  const locale = useLocale();
  const viewerZone = useViewerTimeZone();
  // Node and WebKit can ship different ICU punctuation for the same locale.
  // Keep the calendar date visible in SSR, then localize after hydration.
  return <time dateTime={iso}>{viewerZone === null ? iso : new Intl.DateTimeFormat(locale, {
    timeZone: "UTC", month: style === "full" ? "long" : "short", day: "numeric",
    ...(style !== "short" ? { year: "numeric" as const } : {}),
    ...(style === "full" ? { weekday: "long" as const } : {}),
  }).format(new Date(iso))}</time>;
}
