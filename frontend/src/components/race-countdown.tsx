"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function compute(targetMs: number): Parts {
  const diff = Number.isFinite(targetMs) ? Math.max(0, targetMs - Date.now()) : 0;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
  };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function RaceCountdown({ targetIso }: { targetIso: string | null }) {
  // Null targetIso happens when the API hasn't filled the next race's
  // RACE.startTime yet — render an empty placeholder rather than NaN.
  const target = targetIso ? new Date(targetIso).getTime() : Number.NaN;
  // Server and first client paint must agree. Start ticking after mount.
  const [parts, setParts] = useState<Parts>({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  useEffect(() => {
    const tick = () => setParts(compute(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  const t = useTranslations("home");
  return (
    <div
      className="flex flex-wrap items-stretch gap-2 sm:gap-3"
    >
      <Unit value={Number.isFinite(target) ? pad(parts.days) : "—"} label={t("countdownDays")} />
      <Sep />
      <Unit value={Number.isFinite(target) ? pad(parts.hours) : "—"} label={t("countdownHours")} />
      <Sep />
      <Unit value={Number.isFinite(target) ? pad(parts.minutes) : "—"} label={t("countdownMin")} />
      <Sep />
      <Unit value={Number.isFinite(target) ? pad(parts.seconds) : "—"} label={t("countdownSec")} />
    </div>
  );
}

function Unit({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex min-w-12 flex-1 flex-col items-center justify-center rounded-md border border-border/60 bg-background/40 px-2 py-2 backdrop-blur-sm sm:min-w-[96px] sm:flex-none sm:px-4 sm:py-3">
      <span className="font-heading text-4xl font-extrabold leading-none tabular-nums tracking-tight sm:text-6xl">
        {value}
      </span>
      <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground sm:text-xs">
        {label}
      </span>
    </div>
  );
}

function Sep() {
  return (
    <span className="hidden self-center font-heading text-3xl font-bold text-[var(--racing-red)]/40 sm:inline sm:text-5xl">
      :
    </span>
  );
}
