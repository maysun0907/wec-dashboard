"use client";

import type { ComponentProps } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale } from "next-intl";

import {
  buildPublicPath,
  getDefaultSeasonYear,
  localeOrDefault,
  parsePublicPath,
} from "@/lib/public-routing";

type Props = ComponentProps<typeof Link> & {
  /** Used when linking from a locale-only page to a season-scoped page. */
  seasonYear?: number;
};

/**
 * `next/link` wrapper for internal routes. It removes the legacy redirect hop
 * by adding the current locale and, where required, season to known app URLs.
 * External links, anchors, URL objects, and unknown paths pass through intact.
 */
export function PublicLink({ href, seasonYear, ...props }: Props) {
  const currentPathname = usePathname();
  const locale = localeOrDefault(useLocale());

  let publicHref = href;
  if (typeof href === "string" && href.startsWith("/") && !href.startsWith("//")) {
    const url = new URL(href, "https://www.wecdash.com");
    const currentRoute = parsePublicPath(currentPathname);
    const year =
      currentRoute?.year ?? seasonYear ?? getDefaultSeasonYear();
    const localizedPath = buildPublicPath(url.pathname, locale, year);
    if (localizedPath) {
      publicHref = `${localizedPath}${url.search}${url.hash}`;
    }
  }

  return <Link href={publicHref} {...props} />;
}
