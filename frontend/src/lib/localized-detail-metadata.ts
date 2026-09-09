import type { Locale } from "@/i18n/config";
import { catalogTranslator } from "@/i18n/catalog";
import { pageMetadata } from "./page-metadata";

export function localizedDetailMetadata(kind: "driver" | "team" | "manufacturer" | "car" | "circuit", name: string, path: `/${string}`, locale: Locale, year: number) {
  const t = catalogTranslator(locale);
  return pageMetadata({
    title: t(`seo.${kind}Title`, { name, year }),
    description: t(`seo.${kind}Description`, { name, year }),
    path, locale, year,
  });
}
