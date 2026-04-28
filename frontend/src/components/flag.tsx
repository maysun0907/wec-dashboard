import { cn } from "@/lib/utils";

// ISO 3166-1 alpha-3 → alpha-2. Only nations that show up in WEC entry
// lists or circuit calendars are listed here; the component falls back to
// the alpha-3 code as text when a code isn't mapped.
const ALPHA3_TO_ALPHA2: Record<string, string> = {
  ARG: "AR",
  AUS: "AU",
  AUT: "AT",
  BEL: "BE",
  BHR: "BH",
  BRA: "BR",
  CAN: "CA",
  CHE: "CH",
  CHN: "CN",
  COL: "CO",
  CZE: "CZ",
  DEU: "DE",
  DNK: "DK",
  ESP: "ES",
  EST: "EE",
  FIN: "FI",
  FRA: "FR",
  GBR: "GB",
  GRC: "GR",
  HUN: "HU",
  IDN: "ID",
  IND: "IN",
  IRL: "IE",
  ITA: "IT",
  JPN: "JP",
  KOR: "KR",
  LVA: "LV",
  MAR: "MA",
  MCO: "MC",
  MEX: "MX",
  MYS: "MY",
  NLD: "NL",
  NOR: "NO",
  NZL: "NZ",
  POL: "PL",
  PRT: "PT",
  QAT: "QA",
  RUS: "RU",
  SAU: "SA",
  SGP: "SG",
  SVK: "SK",
  SVN: "SI",
  SWE: "SE",
  THA: "TH",
  TUR: "TR",
  TWN: "TW",
  UKR: "UA",
  URY: "UY",
  USA: "US",
  VEN: "VE",
  ZAF: "ZA",
};

/** Convert a 2-letter country code into the regional-indicator emoji
 *  sequence — what most platforms render as a flag. */
function flagEmoji(alpha2: string): string {
  const base = 0x1f1e6 - "A".charCodeAt(0);
  return alpha2
    .toUpperCase()
    .split("")
    .map((c) => String.fromCodePoint(c.charCodeAt(0) + base))
    .join("");
}

type Props = {
  /** ISO 3166-1 alpha-3 code (e.g. "JPN"). */
  code: string | null | undefined;
  className?: string;
  /** When true, render only the flag — no trailing code text. */
  flagOnly?: boolean;
};

/** Renders a flag emoji + 3-letter code. Falls back to "—" for missing
 *  codes and to just the code text for unmapped countries. Browser/OS
 *  has to support emoji flags (macOS/iOS yes, Windows < 11 falls back to
 *  letter pairs — that's acceptable for a dashboard). */
export function Flag({ code, className, flagOnly = false }: Props) {
  if (!code || code.toUpperCase() === "UNK") {
    return (
      <span className={cn("text-muted-foreground", className)}>—</span>
    );
  }
  const upper = code.toUpperCase();
  const alpha2 = ALPHA3_TO_ALPHA2[upper];
  if (!alpha2) {
    return (
      <span className={cn("font-mono text-xs", className)}>{upper}</span>
    );
  }
  if (flagOnly) {
    return (
      <span
        className={cn("inline-block leading-none", className)}
        aria-label={upper}
        title={upper}
      >
        {flagEmoji(alpha2)}
      </span>
    );
  }
  return (
    <span
      className={cn("inline-flex items-center gap-1.5", className)}
      aria-label={upper}
    >
      <span className="leading-none">{flagEmoji(alpha2)}</span>
      <span className="font-mono text-xs">{upper}</span>
    </span>
  );
}
