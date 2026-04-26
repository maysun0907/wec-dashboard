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
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    const target = new Date(targetIso).getTime();
    const tick = () => setParts(compute(target));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);

  const display = parts ?? { days: 0, hours: 0, minutes: 0, seconds: 0 };

  return (
    <div className="flex items-baseline gap-3 font-mono text-3xl font-semibold tabular-nums sm:text-5xl">
      <Unit value={display.days} label="d" />
      <Sep />
      <Unit value={pad(display.hours)} label="h" />
      <Sep />
      <Unit value={pad(display.minutes)} label="m" />
      <Sep />
      <Unit value={pad(display.seconds)} label="s" />
    </div>
  );
}

function Unit({ value, label }: { value: number | string; label: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span>{value}</span>
      <span className="text-sm font-medium text-muted-foreground sm:text-base">
        {label}
      </span>
    </span>
  );
}

function Sep() {
  return <span className="text-muted-foreground/40">·</span>;
}
