// Font loading helper for opengraph-image / twitter-image route handlers.
//
// ImageResponse needs raw font bytes passed via its `fonts` option. We fetch
// the TTFs from Google Fonts at runtime; in production these are cached by
// the route-handler's static optimisation (one fetch per build/revalidate).
// The URLs were resolved once from
//   https://fonts.googleapis.com/css2?family=Geist:wght@500&family=Geist+Mono:wght@400&family=Instrument+Serif:ital@1&display=swap
// and hardcoded here. If a TTF 404s after a Google Fonts version bump,
// re-run that CSS query and update the constants.

const GEIST_TTF =
  "https://fonts.gstatic.com/s/geist/v5/gyBhhwUxId8gMGYQMKR3pzfaWI_RruM4nQ.ttf";
const GEIST_MONO_TTF =
  "https://fonts.gstatic.com/s/geistmono/v5/or3yQ6H-1_WfwkMZI_qYPLs1a-t7PU0AbeE9KJ5T.ttf";
const INSTRUMENT_SERIF_ITALIC_TTF =
  "https://fonts.gstatic.com/s/instrumentserif/v5/jizHRFtNs2ka5fXjeivQ4LroWlx-6zATiw.ttf";

export type OgFont = {
  name: string;
  data: ArrayBuffer;
  weight: 400 | 500;
  style: "normal" | "italic";
};

async function fetchTtf(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url, {
    // Long-lived font asset; let the platform cache it aggressively.
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) {
    throw new Error(`Font fetch failed (${res.status}) for ${url}`);
  }
  return res.arrayBuffer();
}

export async function loadOgFonts(): Promise<OgFont[]> {
  const [sans, mono, display] = await Promise.all([
    fetchTtf(GEIST_TTF),
    fetchTtf(GEIST_MONO_TTF),
    fetchTtf(INSTRUMENT_SERIF_ITALIC_TTF),
  ]);
  return [
    { name: "Geist", data: sans, weight: 500, style: "normal" },
    { name: "Geist Mono", data: mono, weight: 400, style: "normal" },
    { name: "Instrument Serif", data: display, weight: 400, style: "italic" },
  ];
}
