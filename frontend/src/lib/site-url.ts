/** One origin resolver for metadata, sitemap, robots, and structured data. */
export function siteUrl(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    return "https://www.wecdash.com";
  }
  return "http://localhost:3000";
}
