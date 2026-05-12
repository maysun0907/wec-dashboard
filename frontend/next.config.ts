import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Allow next/image to optimize remote assets we surface in the
  // dashboard. Two upstream sources today:
  //   * fiawec.com — official manufacturer logos, car renders and
  //     round posters (PNG, 200 KB - 3 MB raw).
  //   * upload.wikimedia.org — driver headshots and circuit imagery
  //     pulled from Wikipedia summaries.
  // Without this whitelist next/image refuses to load the URL.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "www.fiawec.com" },
      { protocol: "https", hostname: "fiawec.com" },
      { protocol: "https", hostname: "upload.wikimedia.org" },
    ],
  },
};

export default nextConfig;
