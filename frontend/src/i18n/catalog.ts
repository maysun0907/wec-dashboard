import { createTranslator } from "next-intl";
import type { Locale } from "./config";
import en from "../../messages/en.json";
import ko from "../../messages/ko.json";
import ja from "../../messages/ja.json";
import zhCN from "../../messages/zh-CN.json";
import fr from "../../messages/fr.json";
import de from "../../messages/de.json";
import it from "../../messages/it.json";
import es from "../../messages/es.json";
import ptBR from "../../messages/pt-BR.json";

const catalogs = { en, ko, ja, "zh-CN": zhCN, fr, de, it, es, "pt-BR": ptBR };

function makeTranslator(locale: Locale) {
  const messages: Record<string, string> = {};
  for (const [section, entries] of Object.entries(catalogs[locale])) {
    for (const [key, value] of Object.entries(entries)) messages[`${section}_${key}`] = value;
  }
  const translate = createTranslator({ locale, messages });
  return (key: string, values?: Record<string, string | number>) => translate(key.replace(".", "_"), values);
}

// Catalogs are immutable. Reuse formatters instead of flattening every page request.
const translators = new Map<Locale, ReturnType<typeof makeTranslator>>();
export function catalogTranslator(locale: Locale) {
  let translator = translators.get(locale);
  if (!translator) {
    translator = makeTranslator(locale);
    translators.set(locale, translator);
  }
  return translator;
}
