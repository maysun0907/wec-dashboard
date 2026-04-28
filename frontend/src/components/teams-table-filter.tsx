"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ClassBadge } from "@/components/class-badge";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { type TeamEntry } from "@/lib/api";

function matches(t: TeamEntry, q: string): boolean {
  if (!q) return true;
  const s = q.toLowerCase();
  return (
    t.name.toLowerCase().includes(s) ||
    (t.manufacturer?.toLowerCase().includes(s) ?? false) ||
    (t.model?.toLowerCase().includes(s) ?? false) ||
    t.carNumber.includes(q)
  );
}

export function TeamsTableFilter({ teams }: { teams: TeamEntry[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => teams.filter((t) => matches(t, q)),
    [teams, q],
  );

  if (teams.length === 0) {
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">
        No teams in this class.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="relative px-4 pt-3">
        <Search className="pointer-events-none absolute left-7 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by team, manufacturer, model or car #"
          className="h-9 pl-8"
        />
        {q && (
          <span className="mt-1 block px-1 text-xs text-muted-foreground">
            {filtered.length} of {teams.length}
          </span>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          No teams match &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">#</TableHead>
              <TableHead>Team</TableHead>
              <TableHead>Manufacturer</TableHead>
              <TableHead className="pr-4">Class</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((t) => (
              <TableRow key={`${t.id}-${t.carNumber}`}>
                <TableCell className="pl-4 font-mono tabular-nums">
                  {t.carNumber}
                </TableCell>
                <TableCell className="font-medium">
                  <Link
                    href={`/teams/${t.id}`}
                    className="hover:text-[var(--racing-red)]"
                  >
                    {t.name}
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <ManufacturerLogo
                      src={t.manufacturerLogoUrl}
                      name={t.manufacturer}
                    />
                    {t.manufacturer ?? "—"}
                  </span>
                </TableCell>
                <TableCell className="pr-4">
                  <ClassBadge raceClass={t.raceClass} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
