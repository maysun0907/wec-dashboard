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
  if (refs.length === 0) {
    if (stacked) {
      const parts = text
        .split(/\s*\/\s*/)
        .map((s) => s.trim())
        .filter(Boolean);
      return (
        <span className={className}>
          {parts.map((nm, i) => (
            <span key={`${nm}-${i}`} className="block">
              {nm}
            </span>
          ))}
        </span>
      );
    }
    return <span className={className}>{text}</span>;
  }
  if (stacked) {
    return (
      <span className={className}>
        {refs.map((d) => (
          <PublicLink
            key={d.id}
            href={`/drivers/${d.id}`}
            className={cn("block", HOVER)}
          >
            {d.name}
          </PublicLink>
        ))}
      </span>
    );
  }
  return (
    <span className={className}>
      {refs.map((d, i) => (
        <span key={d.id}>
          {i > 0 && (
            <span className="text-muted-foreground/60">{separator}</span>
          )}
          <PublicLink href={`/drivers/${d.id}`} className={HOVER}>
            {d.name}
          </PublicLink>
        </span>
      ))}
    </span>
  );
}
