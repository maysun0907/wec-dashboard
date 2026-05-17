import Link from "next/link";
import { LocaleSwitcher } from "./locale-switcher";
import { SeasonSwitcher } from "./season-switcher";
import { MobileMenu, SiteNav } from "./site-nav";
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
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:gap-6 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="group flex shrink-0 items-center gap-2 sm:gap-3"
          aria-label="WEC Dashboard"
        >
          {/* Official FIA WEC logo (Wikimedia Commons, CC0 / below
              threshold of originality). Aspect 337×144. h-6 on phones
              so the right-aligned controls have breathing room. */}
          <img
            src="/wec-logo.png"
            alt="FIA WEC"
            width={188}
            height={80}
            className="h-6 w-auto transition-opacity group-hover:opacity-80 sm:h-8"
          />
          <span className="hidden font-heading text-xs font-semibold uppercase tracking-[0.25em] text-muted-foreground sm:inline">
            Dashboard
          </span>
        </Link>
        <SiteNav />
        <div className="ml-auto flex items-center gap-2">
          <LocaleSwitcher />
          <SeasonSwitcher seasons={seasons} selected={selected} />
          <SiteSearch />
          <MobileMenu />
        </div>
      </div>
      {/* Two-tone underline: thin border + a 1px red accent stripe that
          ties into the racing palette. */}
      <div className="h-px bg-border" />
      <div className="h-px bg-gradient-to-r from-[var(--racing-red)]/0 via-[var(--racing-red)]/40 to-[var(--racing-red)]/0" />
    </header>
  );
}
