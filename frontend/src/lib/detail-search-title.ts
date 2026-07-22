import type { Locale } from "@/i18n/config";

export function driverSearchTitle(name: string, locale: Locale): string {
  return locale === "ko"
    ? `${name} WEC 기록·결과`
    : `${name} WEC Results & Career Stats`;
}

export function teamSearchTitle(name: string, locale: Locale): string {
  return locale === "ko"
    ? `${name} WEC 드라이버·결과`
    : `${name} WEC Drivers & Results`;
}
