"use client";

import { useEffect, useState } from "react";

type Parts = { days: number; hours: number; minutes: number; seconds: number };

function compute(targetMs: number): Parts {
  const diff = Math.max(0, targetMs - Date.now());
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

export function RaceCountdown({ targetIso }: { targetIso: string }) {
  const target = new Date(targetIso).getTime();
  // Compute initial digits server-side so the first paint isn't a frozen
  // 00:00:00:00. Server Date.now() and client Date.now() differ by a few
  // ms which would normally trip a hydration warning — suppress on the
  // root since the discrepancy is correct, not a bug.
  const [parts, setParts] = useState<Parts>(() => compute(target));

  useEffect(() => {
    const tick = () => setParts(compute(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);

  return (
    <div
      className="flex flex-wrap items-stretch gap-2 sm:gap-3"
      suppressHydrationWarning
    >
      <Unit value={pad(parts.days)} label="Days" />
      <Sep />
      <Unit value={pad(parts.hours)} label="Hours" />
      <Sep />
      <Unit value={pad(parts.minutes)} label="Min" />
      <Sep />
      <Unit value={pad(parts.seconds)} label="Sec" />
    </div>
  );
}

function Unit({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="flex min-w-[68px] flex-col items-center justify-center rounded-md border border-border/60 bg-background/40 px-3 py-2 backdrop-blur-sm sm:min-w-[96px] sm:px-4 sm:py-3">
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
