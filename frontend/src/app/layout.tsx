import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Saira_Condensed } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Display font for page titles, card headings, and the wordmark — gives
// the dashboard a pit-board / broadcast-graphic feel instead of generic
// SaaS sans. Falls back to Geist for Korean / non-Latin chars.
const sairaCondensed = Saira_Condensed({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
});

// metadataBase makes the OG image URLs absolute on Vercel deploys; falls
// back to localhost for `bun dev` so the social-share previews still
// render in tooling that requires an absolute URL.
const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

const SITE_NAME = "WEC Dashboard";
const SITE_DESCRIPTION =
  "Unofficial fan dashboard for the FIA World Endurance Championship — live race weekend countdown, lap-by-lap results, V-max, sector splits, driver/team/manufacturer standings, Hypercar & LMGT3 grids, BoP, circuits, and full season archive from 2012. 한국어 지원.";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE_NAME} — FIA WEC Schedule, Results & Standings`,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  keywords: [
    "FIA WEC",
    "World Endurance Championship",
    "Le Mans",
    "24 Hours of Le Mans",
    "Hypercar",
    "LMGT3",
    "LMP2",
    "LMP1",
    "LMGTE Pro",
    "LMGTE Am",
    "endurance racing",
    "WEC standings",
    "WEC results",
    "WEC schedule",
    "WEC drivers",
    "WEC teams",
    "Porsche 963",
    "Ferrari 499P",
    "Toyota GR010",
    "BMW M Hybrid V8",
    "Cadillac V-Series.R",
    "Aston Martin Valkyrie",
    "Peugeot 9X8",
    "Alpine A424",
    "Genesis Magma Racing",
    "Genesis GMR-001",
    "Hyundai WEC",
    "Magma Racing",
    "Magma",
    "WEC 한국어",
    "FIA 세계 내구 챔피언십",
    "르망 24시",
    "르망",
    "하이퍼카",
    "WEC 일정",
    "WEC 결과",
    "WEC 순위",
    "포르쉐 963",
    "페라리 499P",
    "토요타 GR010",
    "캐딜락 하이퍼카",
    "애스턴마틴 발키리",
    "푸조 9X8",
    "알핀 A424",
    "현대 제네시스 GMR-001",
    "제네시스 마그마 레이싱",
    "제네시스 마그마",
    "마그마 레이싱",
    "마그마",
    "현대 WEC",
    "WEC 드라이버",
    "WEC 팀",
    "WEC 서킷",
  ],
  authors: [{ name: "WEC Dashboard" }],
  creator: "WEC Dashboard",
  publisher: "WEC Dashboard",
  category: "sports",
  alternates: {
    canonical: "/",
    languages: {
      en: "/",
      ko: "/",
      "x-default": "/",
    },
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    siteName: SITE_NAME,
    title: `${SITE_NAME} — FIA WEC Schedule, Results & Standings`,
    description: SITE_DESCRIPTION,
    locale: "en_US",
    alternateLocale: ["ko_KR"],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} — FIA WEC Schedule, Results & Standings`,
    description: SITE_DESCRIPTION,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  appleWebApp: {
    capable: true,
    title: SITE_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  // Verification tokens injected from env so we don't have to commit
  // them and can swap them per-environment. Set in Vercel:
  //   NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION = <token from Search Console>
  //   NEXT_PUBLIC_NAVER_SITE_VERIFICATION  = <token from Naver Search Advisor>
  verification: {
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
      : {}),
    ...(process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION
      ? {
          other: {
            "naver-site-verification":
              process.env.NEXT_PUBLIC_NAVER_SITE_VERIFICATION,
          },
        }
      : {}),
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  // Notched-phone safe area + lock the meta to dark so iOS / Android
  // chrome don't briefly flash white on launch.
  colorScheme: "dark",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolves from the wec_locale cookie via src/i18n/request.ts.
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <html
      lang={locale}
      className={`dark ${geistSans.variable} ${geistMono.variable} ${sairaCondensed.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
        <Analytics />
      </body>
    </html>
  );
}
