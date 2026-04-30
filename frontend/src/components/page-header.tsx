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
    <header className="space-y-2">
      {eyebrow && <p className="eyebrow">{eyebrow}</p>}
      <h1 className="text-4xl font-bold uppercase tracking-tight sm:text-5xl">
        {title}
      </h1>
      {description && (
        <p className="text-muted-foreground">{description}</p>
      )}
    </header>
  );
}
