import Link from "next/link";
import { SeasonSwitcher } from "./season-switcher";
import { SiteNav } from "./site-nav";
import { SiteSearch } from "./site-search";
import { getSeasons, type Season } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

export async function SiteHeader() {
  // Best-effort — the API may be cold or down. Header should still render.
  const [seasons, selected] = await Promise.all([
    getSeasons().catch(() => [] as Season[]),
    getSelectedSeason(),
  ]);

  return (
    <header className="sticky top-0 z-40 bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-baseline gap-2"
          aria-label="WEC Dashboard"
        >
          <span className="size-2 self-center rounded-full bg-[var(--racing-red)] shadow-[0_0_10px_var(--racing-red)]" />
          <span className="font-heading text-2xl font-extrabold tracking-tight uppercase leading-none transition-colors group-hover:text-[var(--racing-red)]">
            WEC
          </span>
          <span className="hidden font-heading text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:inline">
            Dashboard
          </span>
        </Link>
        <SiteNav />
        <div className="ml-auto flex items-center gap-2">
          <SeasonSwitcher seasons={seasons} selected={selected} />
          <SiteSearch />
        </div>
      </div>
      {/* Two-tone underline: thin border + a 1px red accent stripe that
          ties into the racing palette. */}
      <div className="h-px bg-border" />
      <div className="h-px bg-gradient-to-r from-[var(--racing-red)]/0 via-[var(--racing-red)]/40 to-[var(--racing-red)]/0" />
    </header>
  );
}
