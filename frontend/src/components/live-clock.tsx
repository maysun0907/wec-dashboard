"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";

const LiveClock = createContext(0);

/** Live clocks keep moving on a cached page without any network request. */
export function LiveClockProvider({ initial, children }: { initial: number; children: ReactNode }) {
  const [localNow, setLocalNow] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => {
      if (document.visibilityState === "visible") setLocalNow(Date.now());
    };
    tick();
    const timer = window.setInterval(tick, 10_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);
  return (
    <LiveClock.Provider value={localNow ?? initial}>
      <div className="space-y-6">{children}</div>
    </LiveClock.Provider>
  );
}

export function useLiveClock() {
  return useContext(LiveClock);
}

function formatMinutes(minutes: number): string {
  return minutes < 60 ? `${minutes}m` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function LiveSessionClock({ start, end }: { start: number; end: number | null }) {
  const now = useLiveClock();
  const t = useTranslations("live");
  const elapsed = Math.max(0, Math.floor((now - start) / 60_000));
  const remaining = end === null ? null : Math.max(0, Math.floor((end - now) / 60_000));
  return (
    <>
      <div className="font-mono text-3xl font-bold tabular-nums">
        {formatMinutes(elapsed)}{" "}
        <span className="text-base text-muted-foreground">{t("elapsed")}</span>
      </div>
      {remaining !== null && (
        <div className="font-mono text-sm text-muted-foreground tabular-nums">
          ~{formatMinutes(remaining)} {t("remaining")}
        </div>
      )}
    </>
  );
}
