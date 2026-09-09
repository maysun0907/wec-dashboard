export const LOCALES = ["en", "ko", "ja", "zh-CN", "fr", "de", "it", "es", "pt-BR"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

export const LOCALE_COOKIE = "wec_locale";

export const LANGUAGE_NAMES: Record<Locale, string> = {
  en: "English", ko: "한국어", ja: "日本語", "zh-CN": "简体中文",
  fr: "Français", de: "Deutsch", it: "Italiano", es: "Español", "pt-BR": "Português (Brasil)",
};
export const OG_LOCALES: Record<Locale, string> = {
  en: "en_US", ko: "ko_KR", ja: "ja_JP", "zh-CN": "zh_CN",
  fr: "fr_FR", de: "de_DE", it: "it_IT", es: "es_ES", "pt-BR": "pt_BR",
};
export function openGraphLocales(locale: Locale) {
  return { locale: OG_LOCALES[locale], alternateLocale: LOCALES.filter((l) => l !== locale).map((l) => OG_LOCALES[l]) };
}

export function isLocale(value: string | undefined): value is Locale {
  return (LOCALES as readonly (string | undefined)[]).includes(value);
}
