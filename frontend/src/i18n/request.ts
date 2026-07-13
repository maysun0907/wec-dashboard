import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";

import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale, isLocale } from "./config";
import { PUBLIC_ROUTE_LOCALE_HEADER } from "@/lib/public-routing";

/** Pick a locale from the browser's Accept-Language header. We only
 *  honour `ko` and `en` since those are the catalogs we ship — anything
 *  else falls through to the default. This is what gives Korean users
 *  (and Googlebot crawling with `Accept-Language: ko`) a Korean
 *  first-paint instead of forcing them through the manual EN→KO toggle. */
function localeFromAcceptLanguage(header: string | null): Locale | null {
  if (!header) return null;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]?.trim().toLowerCase();
    if (!tag) continue;
    if (tag === "ko" || tag.startsWith("ko-")) return "ko";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return null;
}

/** next-intl request config — runs once per server request. Priority:
 *  locale fixed in the public URL → explicit cookie (user toggled) →
 *  Accept-Language sniff → default. */
export default getRequestConfig(async () => {
  const headerStore = await headers();
  const routedLocale =
    headerStore.get(PUBLIC_ROUTE_LOCALE_HEADER) ?? undefined;
  let locale: Locale = DEFAULT_LOCALE;
  if (isLocale(routedLocale)) {
    locale = routedLocale;
  } else {
    const store = await cookies();
    const cookieValue = store.get(LOCALE_COOKIE)?.value;
    if (isLocale(cookieValue)) {
      locale = cookieValue;
    } else {
      const sniff = localeFromAcceptLanguage(headerStore.get("accept-language"));
      if (sniff) locale = sniff;
    }
  }
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
