"use client";

import { useMemo, useState } from "react";
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
import { type SessionResult } from "@/lib/api";

type SortMode = "grid" | "q" | "hyperpole";

const SORT_OPTIONS: Array<{ mode: SortMode; label: string }> = [
  { mode: "grid", label: "Grid" },
  { mode: "q", label: "Q lap" },
  { mode: "hyperpole", label: "Hyperpole" },
];

function lapMs(lap: string | null | undefined): number | null {
  if (!lap) return null;
  const m = lap.match(/^(\d+):(\d{2})\.(\d+)$/);
  if (!m) return null;
  return Number(m[1]) * 60_000 + Number(m[2]) * 1_000 + Number(m[3]);
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
      copy.sort((a, b) => a.position - b.position);
    } else {
      const key = sort === "q" ? "qualifyingLap" : "hyperpoleLap";
      copy.sort((a, b) => {
        const am = lapMs(a[key]);
        const bm = lapMs(b[key]);
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

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <CardTitle>Qualifying results</CardTitle>
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
              {o.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="px-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">
                {sort === "grid" ? "Grid" : "#"}
              </TableHead>
              <TableHead className="w-12">Car</TableHead>
              <TableHead>Team</TableHead>
              <TableHead className="hidden md:table-cell">Drivers</TableHead>
              <TableHead className="w-16">Class</TableHead>
              {sort === "q" && (
                <TableHead className="pr-4 w-24 text-right">Q lap</TableHead>
              )}
              {sort === "hyperpole" && (
                <TableHead className="pr-4 w-24 text-right">
                  Hyperpole
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
                  <TableCell className="font-medium">{row.team}</TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {row.drivers}
                  </TableCell>
                  <TableCell>
                    <ClassBadge raceClass={row.raceClass} />
                  </TableCell>
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
      </CardContent>
    </Card>
  );
}
