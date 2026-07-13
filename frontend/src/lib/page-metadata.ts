import type { Metadata } from "next";

const SITE_NAME = "WEC Dashboard";
const SITE_DESCRIPTION =
  "Unofficial fan dashboard for the FIA World Endurance Championship — live race weekend countdown, lap-by-lap results, V-max, sector splits, driver/team/manufacturer standings, Hypercar & LMGT3 grids, BoP, circuits, and full season archive from 2012. 한국어 지원.";

type PageMetadataOptions = {
  title: string;
  path: `/${string}`;
  description?: string;
};

/** Build self-referencing metadata for static dashboard pages. */
export function pageMetadata({
  title,
  path,
  description = SITE_DESCRIPTION,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE_NAME,
      title: `${title} · ${SITE_NAME}`,
      description,
      locale: "en_US",
      alternateLocale: ["ko_KR"],
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} · ${SITE_NAME}`,
      description,
    },
  };
}
