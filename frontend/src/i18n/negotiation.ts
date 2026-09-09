import { DEFAULT_LOCALE, isLocale, type Locale } from "./config";

const COUNTRY_LANGUAGES: Record<string, Locale> = {
  KR: "ko", JP: "ja", CN: "zh-CN", FR: "fr", MC: "fr",
  DE: "de", AT: "de", LI: "de", IT: "it", SM: "it", VA: "it",
  ES: "es", MX: "es", AR: "es", CL: "es", CO: "es", PE: "es", UY: "es",
  EC: "es", BO: "es", PY: "es", VE: "es", CR: "es", PA: "es", DO: "es",
  GT: "es", HN: "es", SV: "es", NI: "es", CU: "es", BR: "pt-BR", PT: "pt-BR",
  US: "en", GB: "en", AU: "en", NZ: "en", IE: "en",
};

export function localeFromAcceptLanguage(header: string | null): Locale | null {
  const preferences = (header ?? "").split(",").map((part) => {
    const [tag, ...parameters] = part.trim().toLowerCase().split(";");
    const quality = parameters.find((p) => p.trim().startsWith("q="));
    const q = quality ? Number(quality.trim().slice(2)) : 1;
    return { tag, q };
  }).filter(({ q }) => Number.isFinite(q) && q > 0 && q <= 1).sort((a, b) => b.q - a.q);
  for (const { tag } of preferences) {
    const base = tag?.split("-")[0];
    if (base === "zh") return "zh-CN";
    if (base === "pt") return "pt-BR";
    if (isLocale(base)) return base;
  }
  return null;
}

/** Edge-supplied country code; no external IP lookup or IP storage.
 * Multilingual/unmapped countries use browser preferences instead of guessing.
 * Public locale URLs are resolved before this landing-only helper.
 */
export function preferredLocale(cookie: string | undefined, country: string | null, accepted: string | null): Locale {
  if (isLocale(cookie)) return cookie;
  return COUNTRY_LANGUAGES[country?.toUpperCase() ?? ""] ?? localeFromAcceptLanguage(accepted) ?? DEFAULT_LOCALE;
}
