"use client";

import { useEffect, useState } from "react";

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
  const [viewerTz, setViewerTz] = useState<string | null>(null);

  useEffect(() => {
    try {
      setViewerTz(Intl.DateTimeFormat().resolvedOptions().timeZone);
    } catch {
      // Older browsers/locales — leave viewer time hidden.
    }
  }, []);

  const date = new Date(iso);
  const fmt = (tz: string) =>
    new Intl.DateTimeFormat(undefined, {
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
      <div className="text-sm tabular-nums">{fmt(circuitTz)}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        Circuit local
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
