"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { ClassBadge } from "@/components/class-badge";
import { RACE_CLASSES, type RaceClass } from "@/lib/api";
import { cn } from "@/lib/utils";

type ActiveClass = RaceClass | "ALL";

type Props = {
  /** Only classes that have data should be offered. This is what exposes
   * LMP2 automatically on Le Mans / historical result pages without
   * presenting an empty selection for the rest of the current calendar. */
  classes: readonly RaceClass[];
  children: ReactNode;
  className?: string;
  defaultClass?: ActiveClass;
};

/**
 * A client-side class selector for server-rendered result tables/cards.
 *
 * Children retain their server rendering and deep links. Rows or cards just
 * add data-race-class="LMP2" etc.; global CSS hides non-matching nodes when
 * a button is pressed. It makes multi-class races scannable without forcing
 * a navigation or duplicating result fetches.
 */
export function RaceClassFilter({
  classes,
  children,
  className,
  defaultClass = "ALL",
}: Props) {
  const t = useTranslations("raceDetail");
  const ordered = useMemo(
    () => RACE_CLASSES.filter((raceClass) => classes.includes(raceClass)),
    [classes],
  );
  const [active, setActive] = useState<ActiveClass>(
    ordered.includes(defaultClass as RaceClass) || defaultClass === "ALL"
      ? defaultClass
      : "ALL",
  );

  if (ordered.length < 2) return <>{children}</>;

  return (
    <section
      data-race-class-filter={active}
      className={cn("space-y-3", className)}
      aria-label={t("classView")}
    >
      <div className="flex flex-wrap items-center gap-2 border-y border-border/65 bg-secondary/25 px-3 py-2 sm:justify-between">
        <span className="data-kicker">{t("classView")}</span>
        <div
          className="flex max-w-full items-center gap-1 overflow-x-auto no-scrollbar"
          role="group"
          aria-label={t("classView")}
        >
          <button
            type="button"
            onClick={() => setActive("ALL")}
            aria-pressed={active === "ALL"}
            className={cn(
              "h-6 rounded-sm border px-2 text-[10px] font-bold tracking-[0.12em] uppercase transition-colors",
              active === "ALL"
                ? "border-[var(--racing-red)]/70 bg-[var(--racing-red)]/15 text-foreground"
                : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
            )}
          >
            {t("allClasses")}
          </button>
          {ordered.map((raceClass) => (
            <button
              key={raceClass}
              type="button"
              onClick={() => setActive(raceClass)}
              aria-pressed={active === raceClass}
              className={cn(
                "rounded-sm border p-0.5 transition-colors",
                active === raceClass
                  ? "border-[var(--racing-red)]/70 bg-[var(--racing-red)]/10"
                  : "border-transparent opacity-65 hover:border-border hover:opacity-100",
              )}
            >
              <ClassBadge raceClass={raceClass} />
            </button>
          ))}
        </div>
      </div>
      {children}
    </section>
  );
}
