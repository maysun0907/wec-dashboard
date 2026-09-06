/** Parse minute:second fractions without assuming exactly three decimals. */
export function lapTimeMs(lap: string | null | undefined): number | null {
  const match = lap?.match(/^(\d+):([0-5]\d)(?:\.(\d{1,3}))?$/);
  if (!match) return null;
  return Number(match[1]) * 60_000 + Number(match[2]) * 1_000
    + Number((match[3] ?? "").padEnd(3, "0"));
}
