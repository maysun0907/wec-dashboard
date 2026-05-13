import type { ReactNode, SVGProps } from "react";
import { useTranslations } from "next-intl";

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
 *  have to bounce through a separate manufacturer page.
 *
 *  Icons are inlined SVG (rather than `lucide-react`) because the
 *  pinned `lucide-react@^1.11.0` predates several of the brand
 *  glyphs we need — see commit history for the build failure that
 *  prompted the swap. */
export function BrandLinkPills({ brand }: { brand: Brand }) {
  const t = useTranslations("common");
  type Item = { label: string; href: string; icon: ReactNode };
  const items: Item[] = [];
  if (brand.websiteUrl)
    items.push({
      label: t("officialRacingSite"),
      href: brand.websiteUrl,
      icon: <GlobeIcon />,
    });
  if (brand.youtubeUrl)
    items.push({
      label: "YouTube",
      href: brand.youtubeUrl,
      icon: <YoutubeIcon />,
    });
  if (brand.xUrl)
    items.push({
      label: "X",
      href: brand.xUrl,
      icon: <XIcon />,
    });
  if (brand.instagramUrl)
    items.push({
      label: "Instagram",
      href: brand.instagramUrl,
      icon: <InstagramIcon />,
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

const ICON_DEFAULTS: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

function GlobeIcon() {
  return (
    <svg {...ICON_DEFAULTS} aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function YoutubeIcon() {
  return (
    <svg {...ICON_DEFAULTS} aria-hidden>
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19.1c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
    </svg>
  );
}

function XIcon() {
  return (
    // X (formerly Twitter) — official mark is two crossed strokes.
    <svg {...ICON_DEFAULTS} aria-hidden viewBox="0 0 24 24">
      <path d="M4 4l16 16" />
      <path d="M20 4L4 20" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg {...ICON_DEFAULTS} aria-hidden>
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  );
}
