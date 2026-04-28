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
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 font-bold tracking-tight"
        >
          <span className="size-2 rounded-full bg-[var(--racing-red)] shadow-[0_0_8px_var(--racing-red)]" />
          <span>WEC</span>
          <span className="hidden text-muted-foreground sm:inline">
            Dashboard
          </span>
        </Link>
        <SiteNav />
        <div className="ml-auto flex items-center gap-2">
          <SeasonSwitcher seasons={seasons} selected={selected} />
          <SiteSearch />
        </div>
      </div>
    </header>
  );
}
