"use client";

import { useLocale } from "next-intl";

/** Calendar dates are not instants: UTC keeps the day stable across viewers. */
export function CalendarDate({ iso, style = "medium" }: { iso: string; style?: "short" | "medium" | "full" }) {
  const locale = useLocale();
  return <time dateTime={iso}>{new Intl.DateTimeFormat(locale, {
    timeZone: "UTC", month: style === "full" ? "long" : "short", day: "numeric",
    ...(style !== "short" ? { year: "numeric" as const } : {}),
    ...(style === "full" ? { weekday: "long" as const } : {}),
  }).format(new Date(iso))}</time>;
}
