import { existsSync } from "node:fs";
import path from "node:path";

/** Legacy local assets are named by country, but Italy's asset is Imola,
 * not Monza. Require the circuit name to distinguish shared countries.
 * Server-only — uses node:fs. */
export function localCircuitLayout(country: string, name?: string): string | null {
  const code = country.toLowerCase();
  if (!/^[a-z]{3}$/.test(code)) return null;
  if (code === "ita" && !/imola|이몰라/i.test(name ?? "")) return null;
  const file = path.join(process.cwd(), "public", "circuits", `${code}.svg`);
  if (existsSync(file)) return `/circuits/${code}.svg`;
  return null;
}

export function circuitLayoutImage(circuit: { country: string; name: string; layoutImage?: string | null }): string | null {
  return localCircuitLayout(circuit.country, circuit.name) ?? circuit.layoutImage ?? null;
}
