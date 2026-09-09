import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LOCALE_COOKIE, isLocale } from "./config";
import { preferredLocale } from "./negotiation";
import { PUBLIC_ROUTE_LOCALE_HEADER } from "@/lib/public-routing";

export default getRequestConfig(async () => {
  const headerStore = await headers();
  const routedLocale = headerStore.get(PUBLIC_ROUTE_LOCALE_HEADER) ?? undefined;
  const locale = isLocale(routedLocale) ? routedLocale : preferredLocale(
    (await cookies()).get(LOCALE_COOKIE)?.value,
    process.env.VERCEL === "1" ? headerStore.get("x-vercel-ip-country") : null,
    headerStore.get("accept-language"),
  );
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
