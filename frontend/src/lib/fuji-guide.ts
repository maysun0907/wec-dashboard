import type { Event, Session } from "./api";
import type { Locale } from "@/i18n/config";

export function hasFujiGuide(event: Pick<Event, "dateStart" | "circuit">): boolean {
  return event.dateStart.startsWith("2026-") && event.circuit.id === 31;
}

/** Render in a fixed, labelled zone so crawlers and visitors see the same schedule. */
export function fujiSessionTime(iso: Session["startTime"], locale: Locale): string | null {
  if (!iso || !Number.isFinite(Date.parse(iso))) return null;
  return new Intl.DateTimeFormat(locale, {
    timeZone: locale === "ko" ? "Asia/Seoul" : "Asia/Tokyo",
    month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date(iso));
}
