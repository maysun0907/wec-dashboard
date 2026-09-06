/** IANA timezone per circuit name. Used to render WEC session times in
 *  the circuit's local timezone alongside the viewer's local timezone.
 *  Values are stable (unlike country codes which change with season's
 *  daylight rules — Intl handles that). */
export const CIRCUIT_TIMEZONE: Record<string, string> = {
  "Circuit de Barcelona-Catalunya": "Europe/Madrid",
  "Monza Circuit": "Europe/Rome",
  "Autodromo Enzo e Dino Ferrari": "Europe/Rome",
  "Autodromo Nazionale Monza": "Europe/Rome",
  "Lusail International Circuit": "Asia/Qatar",
  "Imola Circuit": "Europe/Rome",
  "Autodromo Nazionale di Monza": "Europe/Rome",
  "Circuit de Spa-Francorchamps": "Europe/Brussels",
  "Circuit de la Sarthe": "Europe/Paris",
  "Circuit Paul Ricard": "Europe/Paris",
  "Silverstone Circuit": "Europe/London",
  "Algarve International Circuit": "Europe/Lisbon",
  "Nürburgring": "Europe/Berlin",
  "Interlagos Circuit": "America/Sao_Paulo",
  "Autódromo José Carlos Pace": "America/Sao_Paulo",
  "Circuit of the Americas": "America/Chicago",
  "Sebring International Raceway": "America/New_York",
  "Fuji Speedway": "Asia/Tokyo",
  "Shanghai International Circuit": "Asia/Shanghai",
  "Losail International Circuit": "Asia/Qatar",
  "Bahrain International Circuit": "Asia/Bahrain",
};

/** Look up a circuit's IANA timezone, falling back to UTC for unmapped
 *  names so callers can always format something. */
export function tzForCircuit(name: string | null | undefined): string {
  if (!name) return "UTC";
  return CIRCUIT_TIMEZONE[name] ?? "UTC";
}
