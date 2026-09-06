import type { ReactNode } from "react";
import { PublicLink } from "@/components/public-link";
import { cn } from "@/lib/utils";

const HOVER = "transition-colors hover:text-[var(--racing-red)]";

/** Tiny muted em-dash for empty cells. The faded color keeps real data
 *  visually dominant while still showing the cell is empty (vs. "0"). */
export function Dash({ className }: { className?: string }) {
  return (
    <span className={cn("text-muted-foreground/40", className)}>—</span>
  );
}

/** Team name → /teams/{id} when an id is available, plain text otherwise. */
export function TeamLink({
  id,
  children,
  className,
}: {
  id: number | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  if (id == null) return <span className={className}>{children}</span>;
  return (
    <PublicLink href={`/teams/${id}`} className={cn(HOVER, className)}>
      {children}
    </PublicLink>
  );
}

/** Car-model name → /cars/{slug} when a slug is available. */
export function CarModelLink({
  slug,
  children,
  className,
}: {
  slug: string | null | undefined;
  children: ReactNode;
  className?: string;
}) {
  if (!slug) return <span className={className}>{children}</span>;
  return (
    <PublicLink href={`/cars/${slug}`} className={cn(HOVER, className)}>
      {children}
    </PublicLink>
  );
}

/** Renders a slash-joined driver list, linking each name to /drivers/{id}
 *  when the parallel `refs` list has a match. Falls back to the plain
 *  string when refs is empty (older ingest data). When `stacked` is set
 *  each name renders on its own line — useful for cramped table cells. */
export function DriverList({
  refs,
  text,
  className,
  separator = " / ",
  stacked = false,
}: {
  refs: { id: number; name: string }[];
  text: string;
  className?: string;
  separator?: string;
  stacked?: boolean;
}) {
  // A published lineup can include a new/substitute driver not yet linked
  // to a profile. Keep their name visible instead of dropping it when only
  // some of the other drivers have IDs.
  const names = text.split(/\s*\/\s*/).map((name) => name.trim()).filter(Boolean);
  const ids = new Map(refs.map((ref) => [ref.name.toLowerCase(), ref.id]));
  const completeRefs = names.length > 0
    ? names.map((name) => ({ name, id: ids.get(name.toLowerCase()) }))
    : refs;
  return (
    <span className={className}>
      {completeRefs.map((d, i) => (
        <span key={`${d.name}-${i}`} className={stacked ? "block" : undefined}>
          {!stacked && i > 0 && (
            <span className="text-muted-foreground/60">{separator}</span>
          )}
          {d.id === undefined ? d.name : <PublicLink href={`/drivers/${d.id}`} className={HOVER}>
            {d.name}
          </PublicLink>}
        </span>
      ))}
    </span>
  );
}
