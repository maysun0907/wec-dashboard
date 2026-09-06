"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { type Season } from "@/lib/api";

const MAX = 3;

const CHIP_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
];

type Props = {
  selected: number[];
  catalog: Season[];
};

export function SeasonComparePicker({ selected, catalog }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("seasons");
  const remaining = catalog
    .map((s) => s.year)
    .filter((y) => !selected.includes(y))
    .sort((a, b) => b - a);

  function pushYears(years: number[]) {
    const params = new URLSearchParams();
    params.set("years", years.join(","));
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  function add(year: number) {
    if (selected.length >= MAX) return;
    pushYears([...selected, year].sort((a, b) => b - a));
  }

  function remove(year: number) {
    pushYears(selected.filter((y) => y !== year));
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((y, i) => (
        <span
          key={y}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 py-1 pl-1 pr-2 text-sm"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: CHIP_COLORS[i % CHIP_COLORS.length] }}
          />
          <span className="px-1 font-mono font-semibold tabular-nums">
            {y}
          </span>
          <button
            type="button"
            onClick={() => remove(y)}
            aria-label={`Remove ${y}`}
            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}

      {selected.length < MAX && remaining.length > 0 && (
        <details className="relative">
          <summary
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-solid hover:text-foreground [&::-webkit-details-marker]:hidden"
          >
            <Plus className="size-3.5" />
            {t("addSeason")}
          </summary>
          <div className="absolute left-0 top-full z-10 mt-1 max-h-72 w-32 overflow-auto rounded-md border border-border bg-popover p-1 shadow-md">
            {remaining.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => add(y)}
                className="block w-full rounded px-2 py-1 text-left text-sm font-mono tabular-nums hover:bg-secondary"
              >
                {y}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
