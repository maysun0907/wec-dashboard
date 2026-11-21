import { getRequestConfig } from "next-intl/server";
import { locale as routeLocale } from "next/root-params";
import { DEFAULT_LOCALE, isLocale } from "./config";

export default getRequestConfig(async () => {
  const segment = await routeLocale();
  const locale = isLocale(segment) ? segment : DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages, timeZone: "UTC" };
});
