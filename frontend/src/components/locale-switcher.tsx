"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { track } from "@vercel/analytics";

import { setLocale } from "@/i18n/actions";
import {
  getDefaultSeasonYear,
  switchLocaleInPublicHref,
} from "@/lib/public-routing";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { code: "en", label: "EN" },
  { code: "ko", label: "KO" },
] as const;

/** Segmented EN / KO toggle for the header. Visible affordance (both
 *  labels shown) so users who don't read either language can still
 *  recognise it as a language switcher. Writes the chosen locale into
 *  a cookie via a server action; next-intl re-renders the tree on the
 *  response. */
export function LocaleSwitcher() {
  const current = useLocale();
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="inline-flex h-8 items-center overflow-hidden rounded-md border border-border bg-secondary/40 text-[11px] font-semibold"
      aria-label="Language"
    >
      {OPTIONS.map((opt) => {
        const active = current === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            disabled={pending || active}
            onClick={() =>
              startTransition(async () => {
                await setLocale(opt.code);
                const currentHref = `${pathname}${window.location.search}${window.location.hash}`;
                const nextHref = switchLocaleInPublicHref(
                  currentHref,
                  opt.code,
                  getDefaultSeasonYear(),
                );
                track("Locale Changed", { from: current, to: opt.code });
                router.replace(nextHref, { scroll: false });
              })
            }
            aria-pressed={active}
            className={cn(
              "h-full px-2 transition-colors",
              active
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              pending && !active && "opacity-50",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
