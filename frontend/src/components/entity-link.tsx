import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const HOVER = "transition-colors hover:text-[var(--racing-red)]";

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
    <Link href={`/teams/${id}`} className={cn(HOVER, className)}>
      {children}
    </Link>
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
    <Link href={`/cars/${slug}`} className={cn(HOVER, className)}>
      {children}
    </Link>
  );
}

/** Renders a slash-joined driver list, linking each name to /drivers/{id}
 *  when the parallel `refs` list has a match. Falls back to the plain
 *  string when refs is empty (older ingest data). */
export function DriverList({
  refs,
  text,
  className,
  separator = " / ",
}: {
  refs: { id: number; name: string }[];
  text: string;
  className?: string;
  separator?: string;
}) {
  if (refs.length === 0) {
    return <span className={className}>{text}</span>;
  }
  return (
    <span className={className}>
      {refs.map((d, i) => (
        <span key={d.id}>
          {i > 0 && (
            <span className="text-muted-foreground/60">{separator}</span>
          )}
          <Link href={`/drivers/${d.id}`} className={HOVER}>
            {d.name}
          </Link>
        </span>
      ))}
    </span>
  );
}
