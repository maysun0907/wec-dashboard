import { existsSync } from "node:fs";
import path from "node:path";

/** Resolve a track-layout SVG by ISO-3 country code, since each WEC
 *  circuit lives in a different country and the country field is
 *  already on the API response.
 *
 *  Drop `frontend/public/circuits/{lowercase-iso3}.svg` and it shows
 *  up automatically. Server-only — uses node:fs. */
export function localCircuitLayout(country: string): string | null {
  const code = country.toLowerCase();
  const file = path.join(process.cwd(), "public", "circuits", `${code}.svg`);
  if (existsSync(file)) return `/circuits/${code}.svg`;
  return null;
}
