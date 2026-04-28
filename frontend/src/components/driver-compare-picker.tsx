"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { DriverPhoto } from "@/components/driver-photo";
import { type DriverEntry, type RaceClass } from "@/lib/api";

const MAX_DRIVERS = 5;

// Match progression-chart / form-compare-chart so the chip dot matches the
// driver's chart line. Order must agree with those components.
const CHIP_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type SelectedDriver = {
  id: number;
  name: string;
  team: string | null;
  carNumber: string | null;
  photoUrl: string | null;
};

type Props = {
  selected: SelectedDriver[];
  catalog: DriverEntry[];
  raceClass: RaceClass;
};

export function DriverComparePicker({ selected, catalog, raceClass }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selected.map((d) => d.id)),
    [selected],
  );

  // Add-dialog should only show drivers from the same class who aren't
  // already chosen. Keeping the comparison single-class avoids mixing
  // Hypercar's 38pt scoring with LMGT3's 25pt scoring on the same chart.
  const candidates = useMemo(
    () =>
      catalog
        .filter((d) => d.raceClass === raceClass && !selectedIds.has(d.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [catalog, raceClass, selectedIds],
  );

  function pushIds(ids: number[]) {
    const params = new URLSearchParams();
    if (ids.length > 0) params.set("ids", ids.join(","));
    params.set("class", raceClass);
    router.push(`/drivers/compare?${params.toString()}`, { scroll: false });
  }

  function add(id: number) {
    if (selected.length >= MAX_DRIVERS) return;
    setOpen(false);
    pushIds([...selected.map((d) => d.id), id]);
  }

  function remove(id: number) {
    pushIds(selected.filter((d) => d.id !== id).map((d) => d.id));
  }

  function switchClass(next: RaceClass) {
    // Switching class clears the picks — names line up to drivers of the
    // current class.
    const params = new URLSearchParams();
    params.set("class", next);
    router.push(`/drivers/compare?${params.toString()}`, { scroll: false });
  }

  const atMax = selected.length >= MAX_DRIVERS;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="mr-2 inline-flex rounded-md border border-border bg-secondary/40 p-0.5 text-xs">
        {(["HYPERCAR", "LMGT3"] as RaceClass[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => c !== raceClass && switchClass(c)}
            className={
              "rounded px-2.5 py-1 font-medium transition-colors " +
              (c === raceClass
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {c}
          </button>
        ))}
      </div>

      {selected.map((d, i) => (
        <span
          key={d.id}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 py-1 pl-1 pr-2 text-sm"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: CHIP_COLORS[i % CHIP_COLORS.length] }}
          />
          <DriverPhoto src={d.photoUrl} name={d.name} size="sm" />
          <span className="font-medium">{d.name}</span>
          {d.carNumber && (
            <span className="font-mono text-xs text-muted-foreground">
              #{d.carNumber}
            </span>
          )}
          <button
            type="button"
            onClick={() => remove(d.id)}
            aria-label={`Remove ${d.name}`}
            className="ml-0.5 rounded p-0.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        </span>
      ))}

      <button
        type="button"
        disabled={atMax}
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-sm text-muted-foreground transition-colors hover:border-solid hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus className="size-3.5" />
        Add driver
        {atMax && <span className="text-xs">(max {MAX_DRIVERS})</span>}
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Add driver"
        description={`Pick a ${raceClass} driver to compare`}
      >
        <CommandInput placeholder="Search drivers…" />
        <CommandList>
          <CommandEmpty>No drivers match.</CommandEmpty>
          <CommandGroup heading={`${raceClass} drivers`}>
            {candidates.map((d) => (
              <CommandItem
                key={d.id}
                value={`${d.name} ${d.team} ${d.carNumber}`}
                onSelect={() => add(d.id)}
              >
                <DriverPhoto src={d.photoUrl} name={d.name} size="sm" />
                <span>{d.name}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  #{d.carNumber} · {d.team}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
