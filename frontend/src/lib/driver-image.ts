import { existsSync } from "node:fs";
import path from "node:path";

const EXTS = ["webp", "png", "jpg"] as const;

/** Resolve a public photo path for a driver id.
 *
 * Drop `frontend/public/drivers/{id}.{webp,png,jpg}` and it overrides
 * the Wikipedia thumbnail stored in the API. Useful for the ~5% of
 * drivers whose Wikipedia article doesn't expose a portrait image.
 *
 * Server-only — uses `node:fs`. Don't import from a client component.
 */
export function localDriverImage(id: number | null | undefined): string | null {
  if (!id) return null;
  for (const ext of EXTS) {
    const file = path.join(
      process.cwd(),
      "public",
      "drivers",
      `${id}.${ext}`,
    );
    if (existsSync(file)) return `/drivers/${id}.${ext}`;
  }
  return null;
}
