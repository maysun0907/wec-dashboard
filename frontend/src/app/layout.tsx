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

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "WEC Dashboard",
    template: "%s · WEC Dashboard",
  },
  description:
    "FIA World Endurance Championship — schedule, results, standings, drivers, teams, and circuits.",
  appleWebApp: {
    capable: true,
    title: "WEC Dashboard",
    statusBarStyle: "black-translucent",
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
