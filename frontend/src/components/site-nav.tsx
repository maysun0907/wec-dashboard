"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Menu, Search } from "lucide-react";
import { PublicLink } from "@/components/public-link";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { parsePublicPath } from "@/lib/public-routing";

// hrefs are static; labels resolve through the `nav` namespace at
// render time so the language switcher updates the menu live.
export const NAV_LINKS = [
  { href: "/", key: "home" },
  { href: "/races", key: "races" },
  { href: "/live", key: "live" },
  { href: "/standings", key: "standings" },
  { href: "/drivers", key: "drivers" },
  { href: "/teams", key: "teams" },
  { href: "/cars", key: "cars" },
  { href: "/rules", key: "rules" },
  { href: "/circuits", key: "circuits" },
  { href: "/stats", key: "stats" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Desktop horizontal nav. Hidden below md; on mobile use <MobileMenu />. */
export function SiteNav({ seasonYear }: { seasonYear: number }) {
  const pathname = usePathname();
  const activePathname = parsePublicPath(pathname)?.internalPath ?? pathname;
  const t = useTranslations("nav");
  return (
    <nav className="hidden flex-1 items-center gap-1 overflow-x-auto text-sm scrollbar-none md:flex">
      {NAV_LINKS.map(({ href, key }) => {
        const active = isActive(activePathname, href);
        return (
          <PublicLink
            key={href}
            href={href}
            seasonYear={seasonYear}
            className={cn(
              "shrink-0 rounded-md px-3 py-1.5 transition-colors",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {t(key)}
          </PublicLink>
        );
      })}
    </nav>
  );
}

/** Hamburger trigger + sheet content. Renders only below md so it can
 *  sit at the rightmost end of the header without crowding the desktop
 *  layout. */
export function MobileMenu({ seasonYear }: { seasonYear: number }) {
  const pathname = usePathname();
  const activePathname = parsePublicPath(pathname)?.internalPath ?? pathname;
  const t = useTranslations("nav");
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label={t("openMenu")}
        >
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-72">
        <SheetTitle className="sr-only">{t("navigation")}</SheetTitle>
        <nav className="flex flex-col gap-1 p-4 pt-12">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              // Defer dispatch so the sheet's close animation finishes
              // before the search dialog mounts and steals focus.
              setTimeout(
                () => window.dispatchEvent(new Event("wec:open-search")),
                150,
              );
            }}
            className="mb-2 flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Search className="size-4" />
            <span>{t("search")}</span>
          </button>
          {NAV_LINKS.map(({ href, key }) => {
            const active = isActive(activePathname, href);
            return (
              <PublicLink
                key={href}
                href={href}
                seasonYear={seasonYear}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded-md px-3 py-2 text-base transition-colors",
                  active
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
                )}
              >
                {t(key)}
              </PublicLink>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
