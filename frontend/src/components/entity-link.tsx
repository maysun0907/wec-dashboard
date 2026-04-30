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
