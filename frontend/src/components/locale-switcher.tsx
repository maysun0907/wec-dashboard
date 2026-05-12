"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";

import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";

/** Compact single-button locale toggle. Shows the *other* language as
 *  the click target — clicking flips it. Tiny footprint so it doesn't
 *  steal space from the desktop nav, but still discoverable since the
 *  visible glyph is itself the call to action ("KO" when you're on EN
 *  reads as "switch to Korean"). */
export function LocaleSwitcher() {
  const current = useLocale();
  const [pending, startTransition] = useTransition();
  const target = current === "ko" ? "en" : "ko";
  const label = target.toUpperCase();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await setLocale(target);
        })
      }
      aria-label={`Switch language to ${label}`}
      title={`Switch language to ${label}`}
      className={cn(
        "inline-flex h-8 items-center rounded-md border border-border bg-secondary/40 px-2 text-xs font-semibold",
        "text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground",
        pending && "opacity-50",
      )}
    >
      {label}
    </button>
  );
}
