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
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { type StandingManufacturer } from "@/lib/api";

const MAX = 5;

const CHIP_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type Props = {
  selected: StandingManufacturer[];
  catalog: StandingManufacturer[];
};

export function ManufacturerComparePicker({ selected, catalog }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const selectedIds = useMemo(
    () => new Set(selected.map((m) => m.manufacturerId)),
    [selected],
  );

  const candidates = useMemo(
    () =>
      catalog
        .filter((m) => !selectedIds.has(m.manufacturerId))
        .sort((a, b) => a.position - b.position),
    [catalog, selectedIds],
  );

  function pushIds(ids: number[]) {
    const params = new URLSearchParams();
    if (ids.length > 0) params.set("ids", ids.join(","));
    router.push(`/manufacturers/compare?${params.toString()}`, {
      scroll: false,
    });
  }

  function add(id: number) {
    if (selected.length >= MAX) return;
    setOpen(false);
    pushIds([...selected.map((m) => m.manufacturerId), id]);
  }

  function remove(id: number) {
    pushIds(
      selected.filter((m) => m.manufacturerId !== id).map((m) => m.manufacturerId),
    );
  }

  const atMax = selected.length >= MAX;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {selected.map((m, i) => (
        <span
          key={m.manufacturerId}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 py-1 pl-1 pr-2 text-sm"
        >
          <span
            className="size-2 rounded-full"
            style={{ background: CHIP_COLORS[i % CHIP_COLORS.length] }}
          />
          <ManufacturerLogo
            src={m.manufacturerLogoUrl}
            name={m.manufacturerName}
          />
          <span className="font-medium">{m.manufacturerName}</span>
          <button
            type="button"
            onClick={() => remove(m.manufacturerId)}
            aria-label={`Remove ${m.manufacturerName}`}
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
        Add manufacturer
        {atMax && <span className="text-xs">(max {MAX})</span>}
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Add manufacturer"
        description="Pick a Hypercar manufacturer to compare"
      >
        <CommandInput placeholder="Search…" />
        <CommandList>
          <CommandEmpty>No matches.</CommandEmpty>
          <CommandGroup heading="Hypercar manufacturers">
            {candidates.map((m) => (
              <CommandItem
                key={m.manufacturerId}
                value={m.manufacturerName}
                onSelect={() => add(m.manufacturerId)}
              >
                <ManufacturerLogo
                  src={m.manufacturerLogoUrl}
                  name={m.manufacturerName}
                />
                <span>{m.manufacturerName}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  P{m.position} · {m.points} pts
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </div>
  );
}
