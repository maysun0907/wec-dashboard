"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { ChevronDown } from "lucide-react";
import { track } from "@vercel/analytics";
import { setSelectedSeason } from "@/app/_actions/season";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type Season } from "@/lib/api";
import {
  localeOrDefault,
  switchSeasonInPublicHref,
} from "@/lib/public-routing";

const LATEST_VALUE = "latest";

type Props = {
  seasons: Season[];
  /** Current pinned year, or null when the user is on "latest". */
  selected: number | null;
};

export function SeasonSwitcher({ seasons, selected }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = localeOrDefault(useLocale());
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
      const destinationYear = year ?? latest.year;
      const currentHref = `${pathname}${window.location.search}${window.location.hash}`;
      const nextHref = switchSeasonInPublicHref(
        currentHref,
        locale,
        destinationYear,
      );
      track("Season Changed", { to: next });
      router.replace(nextHref, { scroll: false });
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
