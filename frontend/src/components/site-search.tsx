"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  getCircuits,
  getDrivers,
  getTeams,
  type Circuit,
  type DriverEntry,
  type TeamEntry,
} from "@/lib/api";

type Catalog = {
  drivers: DriverEntry[];
  teams: TeamEntry[];
  circuits: Circuit[];
};

export function SiteSearch() {
  const [open, setOpen] = useState(false);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const router = useRouter();

  // ⌘K / Ctrl+K and the `wec:open-search` custom event used by the
  // mobile hamburger menu's "Search" entry.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("wec:open-search", onOpen);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("wec:open-search", onOpen);
    };
  }, []);

  // Lazy-fetch the catalog the first time the dialog opens.
  useEffect(() => {
    if (!open || catalog !== null) return;
    let cancelled = false;
    Promise.all([getDrivers(), getTeams(), getCircuits()])
      .then(([drivers, teams, circuits]) => {
        if (!cancelled) setCatalog({ drivers, teams, circuits });
      })
      .catch(() => {
        // best-effort; keep dialog open and show "No results"
      });
    return () => {
      cancelled = true;
    };
  }, [open, catalog]);

  // Dedupe teams by id (Toyota Racing has #7 and #8 → one team-entry suffices).
  const dedupedTeams = useMemo(() => {
    if (!catalog) return [];
    const seen = new Set<number>();
    const out: TeamEntry[] = [];
    for (const t of catalog.teams) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        out.push(t);
      }
    }
    return out;
  }, [catalog]);

  function navigate(url: string) {
    setOpen(false);
    router.push(url);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-secondary/40 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        aria-label="Search drivers, teams, circuits"
        title="Search (⌘K)"
      >
        <Search className="size-4" />
      </button>

      <CommandDialog
        open={open}
        onOpenChange={setOpen}
        title="Search"
        description="Drivers, teams, circuits"
      >
        <CommandInput placeholder="Search drivers, teams, circuits…" />
        <CommandList>
          <CommandEmpty>
            {catalog === null ? "Loading…" : "No matches."}
          </CommandEmpty>
          {catalog && (
            <>
              <CommandGroup heading="Drivers">
                {catalog.drivers.map((d) => (
                  <CommandItem
                    key={`d-${d.id}`}
                    value={`driver ${d.name} ${d.team} ${d.carNumber}`}
                    onSelect={() => navigate(`/drivers/${d.id}`)}
                  >
                    <span>{d.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      #{d.carNumber} · {d.raceClass}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Teams">
                {dedupedTeams.map((t) => (
                  <CommandItem
                    key={`t-${t.id}`}
                    value={`team ${t.name} ${t.manufacturer ?? ""}`}
                    onSelect={() => navigate(`/teams/${t.id}`)}
                  >
                    <span>{t.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {t.manufacturer ?? "—"} · {t.raceClass}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
              <CommandGroup heading="Circuits">
                {catalog.circuits.map((c) => (
                  <CommandItem
                    key={`c-${c.id}`}
                    value={`circuit ${c.name} ${c.country}`}
                    onSelect={() => navigate(`/circuits/${c.id}`)}
                  >
                    <span>{c.name}</span>
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.country !== "UNK" ? c.country : ""}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}
        </CommandList>
      </CommandDialog>
    </>
  );
}
