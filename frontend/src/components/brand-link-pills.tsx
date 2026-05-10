import type { ReactNode } from "react";
import { Globe, Instagram, Twitter, Youtube } from "lucide-react";

type Brand = {
  websiteUrl?: string | null;
  youtubeUrl?: string | null;
  xUrl?: string | null;
  instagramUrl?: string | null;
};

/** Row of pill buttons linking to a manufacturer's official racing
 *  presence — site, YouTube, X, Instagram. Hidden when the brand
 *  has no curated links. Used on both manufacturer and team detail
 *  pages so a fan looking at e.g. "Genesis Magma Racing" doesn't
 *  have to bounce through a separate manufacturer page. */
export function BrandLinkPills({ brand }: { brand: Brand }) {
  type Item = { label: string; href: string; icon: ReactNode };
  const items: Item[] = [];
  if (brand.websiteUrl)
    items.push({
      label: "Official racing site",
      href: brand.websiteUrl,
      icon: <Globe className="size-4" />,
    });
  if (brand.youtubeUrl)
    items.push({
      label: "YouTube",
      href: brand.youtubeUrl,
      icon: <Youtube className="size-4" />,
    });
  if (brand.xUrl)
    items.push({
      label: "X",
      href: brand.xUrl,
      icon: <Twitter className="size-4" />,
    });
  if (brand.instagramUrl)
    items.push({
      label: "Instagram",
      href: brand.instagramUrl,
      icon: <Instagram className="size-4" />,
    });
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2 text-sm">
      {items.map((it) => (
        <a
          key={it.href}
          href={it.href}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-1.5 transition-colors hover:bg-secondary/60 hover:text-foreground"
        >
          <span aria-hidden className="inline-flex w-4 justify-center">
            {it.icon}
          </span>
          <span>{it.label}</span>
          <span aria-hidden className="text-xs text-muted-foreground">
            ↗
          </span>
        </a>
      ))}
    </div>
  );
}
