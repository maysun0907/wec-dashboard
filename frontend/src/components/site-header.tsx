import Image from "next/image";
import { LocaleSwitcher } from "./locale-switcher";
import { PublicLink } from "./public-link";
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
  const publicSeasonYear =
    selected ?? seasons[0]?.year ?? new Date().getUTCFullYear();

  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/94 shadow-[0_10px_30px_-24px_rgba(0,0,0,0.95)] backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-[96rem] items-center gap-2 px-3 sm:h-16 sm:gap-4 sm:px-6 lg:px-8">
        <PublicLink
          href="/"
          seasonYear={publicSeasonYear}
          className="group flex shrink-0 items-center gap-2 sm:gap-3"
          aria-label="WEC Dashboard"
        >
          {/* Official FIA WEC logo (Wikimedia Commons, CC0 / below
              threshold of originality). Aspect 337×144. h-6 on phones
              so the right-aligned controls have breathing room. */}
          <Image
            src="/wec-logo.png"
            alt="FIA WEC official logo"
            width={188}
            height={80}
            loading="eager"
            className="h-5 w-auto transition-opacity group-hover:opacity-80 sm:h-7"
          />
          <span className="hidden font-heading text-[10px] font-semibold uppercase tracking-[0.25em] text-muted-foreground xl:inline">
            Dashboard
          </span>
        </PublicLink>
        <SiteNav seasonYear={publicSeasonYear} />
        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <LocaleSwitcher />
          <SeasonSwitcher seasons={seasons} selected={selected} />
          <SiteSearch key={publicSeasonYear} year={publicSeasonYear} />
          <MobileMenu seasonYear={publicSeasonYear} />
        </div>
      </div>
      <div className="h-px bg-gradient-to-r from-[var(--racing-red)]/0 via-[var(--racing-red)]/75 to-[var(--racing-red)]/0" />
    </header>
  );
}
