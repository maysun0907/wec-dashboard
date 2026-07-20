import { isApiNotFound } from "@/lib/api";

/**
 * Load data for a cached Open Graph image without turning transient upstream
 * failures into a long-lived "not found" card. A real API 404 is the only
 * recoverable absence; overloads and network failures must reach Next so ISR
 * can retain the last successful image.
 */
export async function loadOgResource<T>(
  loader: () => Promise<T>,
): Promise<T | null> {
  try {
    return await loader();
  } catch (error) {
    if (isApiNotFound(error)) return null;
    throw error;
  }
}
