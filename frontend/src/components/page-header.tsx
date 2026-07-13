import type { ReactNode } from "react";

type Props = {
  /** Small uppercase label rendered above the title with a red accent bar. */
  eyebrow?: string;
  /** Page title — rendered uppercase in the display font. */
  title: ReactNode;
  /** One-line subtitle / count under the title. */
  description?: ReactNode;
};

export function PageHeader({ eyebrow, title, description }: Props) {
  return (
    <header className="dashboard-page-header space-y-2">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="font-heading text-4xl font-extrabold uppercase tracking-[0.01em] sm:text-5xl lg:text-6xl">
        {title}
      </h1>
      {description && (
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground sm:text-base">{description}</p>
      )}
    </header>
  );
}
