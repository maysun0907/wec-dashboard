"use client";

import { useLocale } from "next-intl";
import { useViewerTimeZone } from "@/components/use-viewer-time-zone";

/** Render the same instant in two timezones — circuit-local on top
 *  (always known server-side), viewer-local below (filled in client-only
 *  via Intl after mount, so SSR doesn't try to guess and trip hydration). */
export function SessionTime({
  iso,
  circuitTz,
  className,
}: {
  iso: string;
  circuitTz: string;
  className?: string;
}) {
  const locale = useLocale();
  const viewerTz = useViewerTimeZone();

  const date = new Date(iso);
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }).format(date);

  const showViewer = viewerTz !== null && viewerTz !== circuitTz;

  return (
    <div className={className}>
      <div className="text-sm tabular-nums">{viewerTz === null ? `${date.toISOString().slice(0, 16).replace("T", " ")} UTC` : fmt(circuitTz)}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {viewerTz === null ? "UTC" : "Circuit local"}
      </div>
      {showViewer && (
        <>
          <div className="mt-1.5 text-sm tabular-nums">{fmt(viewerTz!)}</div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Your local
          </div>
        </>
      )}
    </div>
  );
}
