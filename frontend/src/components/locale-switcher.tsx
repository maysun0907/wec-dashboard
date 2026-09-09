"use client";

import { useTransition } from "react";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { track } from "@vercel/analytics";
import { Globe } from "lucide-react";
import { setLocale } from "@/i18n/actions";
import { LOCALES, LANGUAGE_NAMES, isLocale } from "@/i18n/config";
import { getDefaultSeasonYear, switchLocaleInPublicHref } from "@/lib/public-routing";

/** Native names remain recognisable even when the current UI is unfamiliar. */
export function LocaleSwitcher() {
  const current = useLocale();
  const t = useTranslations("common");
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();

  return (
    <label className="relative inline-flex h-8 shrink-0 items-center gap-1 rounded-sm border border-border bg-secondary/40 pl-2">
      <Globe size={13} aria-hidden="true" className="text-muted-foreground" />
      <select
        aria-label={t("language")}
        value={current}
        disabled={pending}
        className="h-full w-16 cursor-pointer bg-transparent pr-1 text-[11px] font-semibold disabled:opacity-50 sm:w-24 [&>option]:bg-background [&>option]:text-foreground"
        onChange={(event) => {
          const locale = event.target.value;
          if (!isLocale(locale) || locale === current) return;
          startTransition(async () => {
            try {
              await setLocale(locale);
            } catch {
              // An old tab can outlive its Server Action deployment. The
              // explicit locale URL still works even if preference saving fails.
            }
            const href = `${pathname}${window.location.search}${window.location.hash}`;
            track("Locale Changed", { from: current, to: locale });
            // A locale changes the root provider and html lang. A document
            // navigation avoids retained layouts from a previous rewritten URL.
            window.location.assign(switchLocaleInPublicHref(href, locale, getDefaultSeasonYear()));
          });
        }}
      >
        {LOCALES.map((locale) => <option key={locale} value={locale} lang={locale}>{LANGUAGE_NAMES[locale]}</option>)}
      </select>
    </label>
  );
}
