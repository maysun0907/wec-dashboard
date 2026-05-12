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
import { DriverPhoto } from "@/components/driver-photo";
import { Flag } from "@/components/flag";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { type DriverEntry } from "@/lib/api";

function matches(d: DriverEntry, q: string): boolean {
  if (!q) return true;
  const t = q.toLowerCase();
  return (
    d.name.toLowerCase().includes(t) ||
    d.team.toLowerCase().includes(t) ||
    d.carNumber.includes(q) ||
    (d.nationality?.toLowerCase().includes(t) ?? false)
  );
}

export function DriversTableFilter({ drivers }: { drivers: DriverEntry[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(
    () => drivers.filter((d) => matches(d, q)),
    [drivers, q],
  );

  if (drivers.length === 0) {
    return (
      <p className="px-4 pb-4 text-sm text-muted-foreground">
        No drivers in this class.
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
          placeholder="Search by name, team, # or nationality"
          className="h-9 pl-8"
        />
        {q && (
          <span className="mt-1 block px-1 text-xs text-muted-foreground">
            {filtered.length} of {drivers.length}
          </span>
        )}
      </div>
      {filtered.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-muted-foreground">
          No drivers match &ldquo;{q}&rdquo;.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-12 pl-4">#</TableHead>
              <TableHead>Driver</TableHead>
              <TableHead className="hidden md:table-cell">Team</TableHead>
              <TableHead className="hidden sm:table-cell">Nat.</TableHead>
              <TableHead className="pr-4">Class</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="pl-4 font-mono tabular-nums">
                  {d.carNumber}
                </TableCell>
                <TableCell className="font-medium">
                  <span className="inline-flex items-center gap-2">
                    <DriverPhoto src={d.photoUrl} name={d.name} size="md" />
                    <Link
                      href={`/drivers/${d.id}`}
                      className="hover:text-[var(--racing-red)]"
                    >
                      {d.name}
                    </Link>
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground md:table-cell">
                  <span className="inline-flex items-center gap-2">
                    <ManufacturerLogo
                      src={d.manufacturerLogoUrl}
                      name={d.team}
                      size="md"
                    />
                    {d.team}
                  </span>
                </TableCell>
                <TableCell className="hidden text-muted-foreground sm:table-cell">
                  <Flag code={d.nationality} />
                </TableCell>
                <TableCell className="pr-4">
                  <ClassBadge raceClass={d.raceClass} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
