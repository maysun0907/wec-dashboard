"use client";

import { useEffect, useState } from "react";

type Props = {
  iso: string;
  circuitTz: string;
  now: number;
  status: "past" | "live" | "upcoming";
};

function fmt(date: Date, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone: tz,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(date);
}

function relative(diffMin: number, status: Props["status"]): string {
  if (status === "live") return "now";
  const dir = status === "upcoming" ? "in" : "ago";
  const minutes = Math.abs(diffMin);
  if (minutes < 60) return `${dir === "in" ? "in " : ""}${minutes}m${dir === "ago" ? " ago" : ""}`;
  const hours = Math.round(minutes / 60);
  if (hours < 48)
    return `${dir === "in" ? "in " : ""}${hours}h${dir === "ago" ? " ago" : ""}`;
  const days = Math.round(hours / 24);
  return `${dir === "in" ? "in " : ""}${days}d${dir === "ago" ? " ago" : ""}`;
}

/** Renders the schedule-row time line: circuit local datetime, viewer
 *  local datetime (only shown when different from circuit), and the
 *  relative offset from now. Viewer tz is read from Intl in the
 *  browser to avoid hydration mismatch. */
export function ScheduleRowTime({ iso, circuitTz, now, status }: Props) {
  const [viewerTz, setViewerTz] = useState<string | null>(null);
  useEffect(() => {
    try {
      setViewerTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // older browsers — leave hidden
    }
  }, []);
  const date = new Date(iso);
  const startMs = date.getTime();
  const diffMin = Math.round((startMs - now) / 60_000);
  const showViewer = viewerTz !== null && viewerTz !== circuitTz;
  return (
    <span className="inline-flex flex-wrap gap-x-2">
      <span>{fmt(date, circuitTz)}</span>
      {showViewer && (
        <>
          <span className="text-muted-foreground/50">·</span>
          <span>{fmt(date, viewerTz!)}</span>
        </>
      )}
      <span className="text-muted-foreground/50">·</span>
      <span>{relative(diffMin, status)}</span>
    </span>
  );
}
