import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from "./config";

/** next-intl request config — runs once per server request and resolves
 *  the active locale from the `wec_locale` cookie. No URL prefixes, so
 *  the rest of the app's routes stay /races, /drivers, etc. instead of
 *  /en/races and /ko/races. */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieValue = store.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieValue) ? cookieValue : DEFAULT_LOCALE;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
