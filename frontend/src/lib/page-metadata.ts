import type { Metadata } from "next";
import type { Locale } from "@/i18n/config";
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
  const en = buildPublicPath(path, "en", year) ?? path;
  const ko = buildPublicPath(path, "ko", year) ?? path;
  const canonical = locale === "ko" ? ko : en;

  return {
    canonical,
    languages: { en, ko, "x-default": en },
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
  const alternateLocale = locale === "ko" ? "en_US" : "ko_KR";
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
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: [alternateLocale],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
    },
  };
}
