export const LOCALES = ["en", "ko"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "wec_locale";

export function isLocale(value: string | undefined): value is Locale {
  return value === "en" || value === "ko";
}
