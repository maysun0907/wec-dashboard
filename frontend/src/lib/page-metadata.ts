import type { Metadata } from "next";
import { LOCALES, openGraphLocales, type Locale } from "@/i18n/config";
import { buildPublicPath } from "@/lib/public-routing";

const SITE_NAME = "WEC Dashboard";
type PageMetadataOptions = {
  title: string;
  path: `/${string}`;
  description: string;
  locale: Locale;
  year: number;
};

export function pageMetadataUrls({
  path,
  locale,
  year,
}: Pick<PageMetadataOptions, "path" | "locale" | "year">) {
  const languages = Object.fromEntries(LOCALES.map((language) => [language, buildPublicPath(path, language, year) ?? path]));
  const canonical = languages[locale];

  return {
    canonical,
    languages: { ...languages, "x-default": languages.en } as Record<string, string>,
  };
}

/** Build self-referencing metadata for static dashboard pages. */
export function pageMetadata({
  title,
  path,
  description,
  locale,
  year,
}: PageMetadataOptions): Metadata {
  const urls = pageMetadataUrls({ path, locale, year });

  return {
    title,
    description,
    alternates: {
      canonical: urls.canonical,
      languages: urls.languages,
    },
    openGraph: {
      type: "website",
      url: urls.canonical,
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      ...openGraphLocales(locale),
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
    },
  };
}
