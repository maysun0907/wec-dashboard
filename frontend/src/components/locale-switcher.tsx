"use client";

import { useTransition } from "react";
import { useLocale } from "next-intl";

import { setLocale } from "@/i18n/actions";
import { cn } from "@/lib/utils";

const OPTIONS = [
  { code: "en", label: "EN" },
  { code: "ko", label: "KO" },
] as const;

/** Compact EN / KO toggle for the header. Writes the chosen locale
 *  into a cookie via a server action, then lets next-intl re-render
 *  the tree on the response. */
export function LocaleSwitcher() {
  const current = useLocale();
  const [pending, startTransition] = useTransition();

  return (
    <div
      className="inline-flex items-center rounded-md border border-border bg-secondary/40 text-xs font-medium"
      aria-label="Language"
    >
      {OPTIONS.map((opt, i) => {
        const active = current === opt.code;
        return (
          <button
            key={opt.code}
            type="button"
            disabled={pending || active}
            onClick={() =>
              startTransition(async () => {
                await setLocale(opt.code);
              })
            }
            className={cn(
              "px-2.5 py-1 transition-colors",
              i === 0 ? "rounded-l-md" : "rounded-r-md",
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
