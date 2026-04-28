"use client";

import { useState, useTransition } from "react";
import { ChevronDown } from "lucide-react";
import { setSelectedSeason } from "@/app/_actions/season";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Season } from "@/lib/api";

const LATEST_VALUE = "latest";

type Props = {
  seasons: Season[];
  /** Current pinned year, or null when the user is on "latest". */
  selected: number | null;
};

export function SeasonSwitcher({ seasons, selected }: Props) {
  const [pending, startTransition] = useTransition();
  const [value, setValue] = useState<string>(
    selected === null ? LATEST_VALUE : String(selected),
  );

  if (seasons.length === 0) return null;
  // Don't bother rendering a switcher for a single-season database.
  if (seasons.length === 1) return null;

  const latest = seasons[0]!;

  function handleChange(next: string) {
    setValue(next);
    const year = next === LATEST_VALUE ? null : Number(next);
    startTransition(async () => {
      await setSelectedSeason(year);
    });
  }

  return (
    <Select value={value} onValueChange={handleChange} disabled={pending}>
      <SelectTrigger
        className="h-8 gap-1.5 text-xs"
        aria-label="Season"
      >
        <SelectValue />
        <ChevronDown className="size-3 opacity-60" />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value={LATEST_VALUE}>Latest ({latest.year})</SelectItem>
        {seasons.map((s) => (
          <SelectItem key={s.id} value={String(s.year)}>
            {s.year}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
