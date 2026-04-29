import { existsSync } from "node:fs";
import path from "node:path";

const EXTS = ["png", "webp", "jpg"] as const;

/** Resolve a public image path for a car-model slug.
 *
 * Drop `frontend/public/cars/{slug}.{png,webp,jpg}` and it shows up
 * automatically (server-side fs check at render time). Returns the
 * site-relative URL or null when no file exists.
 *
 * Server-only — uses `node:fs`. Don't import from a client component.
 */
export function localCarImage(slug: string): string | null {
  for (const ext of EXTS) {
    const file = path.join(process.cwd(), "public", "cars", `${slug}.${ext}`);
    if (existsSync(file)) return `/cars/${slug}.${ext}`;
  }
  return null;
}
