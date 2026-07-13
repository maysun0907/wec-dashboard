import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), geolocation=(), microphone=()",
          },
        ],
      },
    ];
  },
  // Allow next/image to optimize remote assets we surface in the
  // dashboard. Two upstream sources today:
  //   * fiawec.com — official manufacturer logos, car renders and
  //     round posters (PNG, 200 KB - 3 MB raw).
  //   * upload.wikimedia.org — driver headshots and circuit imagery
  //     pulled from Wikipedia summaries.
  // Without this whitelist next/image refuses to load the URL.
  images: {
    // Serve remote assets straight from their source CDN instead of
    // routing every request through Vercel's image optimizer.
    // The assets we surface (manufacturer logos, driver headshots,
    // car renders) are already small and effectively static for a
    // season, so per-request optimization buys us nothing — and the
    // optimizer's transform quota was capping out and returning 402s,
    // which broke every image on the page at once.
    unoptimized: true,
    remotePatterns: [
      { protocol: "https", hostname: "www.fiawec.com" },
      { protocol: "https", hostname: "fiawec.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
      // Past-season car renders / manufacturer logos are pulled from
      // Wayback Machine snapshots — see backend/app/ingest/fiawec_assets.py.
      { protocol: "https", hostname: "web.archive.org" },
      // 2018+ FIA assets are hosted on Google Cloud Storage. Wayback
      // captures store the original URL, so when the archive serves
      // a `/web/{ts}im_/https://storage.googleapis.com/...png`, the
      // browser follows that pattern.
      { protocol: "https", hostname: "storage.googleapis.com" },
    ],
  },
};

export default withNextIntl(nextConfig);
