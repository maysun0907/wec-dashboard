"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClassBadge } from "@/components/class-badge";
import { TeamLink } from "@/components/entity-link";
import { PublicLink } from "@/components/public-link";
import { RaceClassFilter } from "@/components/race-class-filter";
import { RACE_CLASSES, type SessionResult } from "@/lib/api";
import { lapTimeMs } from "@/lib/lap-time";

type SortMode = "grid" | "q" | "hyperpole";

const SORT_OPTIONS: Array<{ mode: SortMode; tKey: "sortGrid" | "sortQ" | "sortHyperpole" }> = [
  { mode: "grid", tKey: "sortGrid" },
  { mode: "q", tKey: "sortQ" },
  { mode: "hyperpole", tKey: "sortHyperpole" },
];

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function activeDriver(row: SessionResult, sort: SortMode): string | null {
  if (sort === "grid") return row.hyperpoleDriver ?? row.qualifyingDriver;
  if (sort === "q") return row.qualifyingDriver;
  return row.hyperpoleDriver;
}

function DriversCell({
  drivers,
  refs,
  active,
}: {
  drivers: string;
  refs: { id: number; name: string }[];
  active: string | null;
}) {
  const parts = drivers.split(/\s*\/\s*/).filter(Boolean);
  if (parts.length === 0) return null;
  const target = active ? normalize(active) : null;
  const refByNorm = new Map<string, number>(
    refs.map((r) => [normalize(r.name), r.id]),
  );
  return (
    <span className="text-muted-foreground/60">
      {parts.map((name, i) => {
        const isActive = target !== null && normalize(name) === target;
        const id = refByNorm.get(normalize(name));
        const inner = (
          <span
            className={
              isActive ? "font-semibold text-foreground" : undefined
            }
          >
            {name}
          </span>
        );
        return (
          <span key={`${name}-${i}`}>
            {i > 0 && " / "}
            {id !== undefined ? (
              <PublicLink
                href={`/drivers/${id}`}
                className="hover:text-[var(--racing-red)]"
              >
                {inner}
              </PublicLink>
            ) : (
              inner
            )}
          </span>
        );
      })}
    </span>
  );
}

export function QualifyingResultsTable({ rows }: { rows: SessionResult[] }) {
  const [sort, setSort] = useState<SortMode>("grid");

  const visible = useMemo(() => {
    // Hyperpole tab hides cars that didn't advance. Wikipedia data only
    // records hyperpoleLap when a lap was posted, so cars that advanced
    // but failed to set a time will currently be filtered out too.
    const filtered =
      sort === "hyperpole"
        ? rows.filter((r) => r.hyperpoleLap !== null)
        : rows;
    const copy = [...filtered];
    if (sort === "grid") {
      copy.sort((a, b) => (a.position || Infinity) - (b.position || Infinity));
    } else {
      const key = sort === "q" ? "qualifyingLap" : "hyperpoleLap";
      copy.sort((a, b) => {
        const am = lapTimeMs(a[key]);
        const bm = lapTimeMs(b[key]);
        if (am === null && bm === null) return a.position - b.position;
        if (am === null) return 1;
        if (bm === null) return -1;
        return am - bm;
      });
    }
    return copy;
  }, [rows, sort]);

  const classRanks = useMemo(() => {
    const counts: Record<string, number> = {};
    return visible.map((r) => {
      counts[r.raceClass] = (counts[r.raceClass] ?? 0) + 1;
      return counts[r.raceClass]!;
    });
  }, [visible]);

  const presentClasses = useMemo(
    () =>
      RACE_CLASSES.filter((raceClass) =>
        rows.some((row) => row.raceClass === raceClass),
      ),
    [rows],
  );

  const t = useTranslations("raceDetail");
  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle>{t("qualifyingResults")}</CardTitle>
        <div className="inline-flex rounded-md border border-border bg-secondary/40 p-0.5 text-xs">
          {SORT_OPTIONS.map((o) => (
            <button
              key={o.mode}
              type="button"
              onClick={() => setSort(o.mode)}
              className={
                "rounded px-2.5 py-1 font-medium transition-colors " +
                (sort === o.mode
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t(o.tKey)}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <RaceClassFilter classes={presentClasses}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 pl-4">
                  {sort === "grid" ? t("colGrid") : t("colCar")}
                </TableHead>
                <TableHead className="w-12">{t("colCar2")}</TableHead>
                <TableHead>{t("colTeam")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("colDrivers")}</TableHead>
                <TableHead className="w-16">{t("colRaceClass")}</TableHead>
                {sort === "grid" && (
                  <TableHead className="pr-4 w-24 text-right">{t("colTime")}</TableHead>
                )}
                {sort === "q" && (
                  <TableHead className="pr-4 w-24 text-right">{t("colQLap")}</TableHead>
                )}
                {sort === "hyperpole" && (
                  <TableHead className="pr-4 w-24 text-right">
                    {t("colHyperpole")}
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((row, i) => {
                const isPole = sort === "grid" ? row.position === 1 : i === 0;
                const classRank = classRanks[i] ?? 0;
                return (
                  <TableRow
                    key={`${row.position}-${row.carNumber}`}
                    data-race-class={row.raceClass}
                    className={isPole ? "bg-[var(--racing-yellow)]/5" : undefined}
                  >
                    <TableCell
                      className={
                        "pl-4 font-mono tabular-nums " +
                        (isPole
                          ? "font-semibold text-[var(--racing-yellow)]"
                          : "")
                      }
                    >
                      {sort === "grid" ? row.position : i + 1}
                      {sort !== "grid" && (
                        <span className="ml-1 text-[10px] text-muted-foreground">
                          ({row.raceClass}-{classRank})
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono tabular-nums">
                      {row.carNumber}
                    </TableCell>
                    <TableCell className="font-medium">
                      <TeamLink id={row.teamId}>{row.team}</TeamLink>
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <DriversCell
                        drivers={row.drivers}
                        refs={row.driverRefs}
                        active={activeDriver(row, sort)}
                      />
                    </TableCell>
                    <TableCell>
                      <ClassBadge raceClass={row.raceClass} />
                    </TableCell>
                    {sort === "grid" && (
                      <TableCell className="pr-4 text-right font-mono tabular-nums">
                        {row.hyperpoleLap ?? row.qualifyingLap ?? "—"}
                      </TableCell>
                    )}
                    {sort === "q" && (
                      <TableCell className="pr-4 text-right font-mono tabular-nums">
                        {row.qualifyingLap ?? "—"}
                      </TableCell>
                    )}
                    {sort === "hyperpole" && (
                      <TableCell
                        className={
                          "pr-4 text-right font-mono tabular-nums " +
                          (row.hyperpoleLap
                            ? "text-foreground"
                            : "text-muted-foreground/40")
                        }
                      >
                        {row.hyperpoleLap ?? "—"}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </RaceClassFilter>
      </CardContent>
    </Card>
  );
}
