/** Match the published crew schedule, using the same rules as the API. */
export function driverInRound(rounds: string | null | undefined, round: number): boolean {
  const value = (rounds ?? "").trim().toLowerCase();
  if (["", "all", "various"].includes(value)) return true;
  return value.split(",").some((part) => {
    const match = part.trim().match(/^(\d+)(?:\s*[-–]\s*(\d+))?$/);
    return !!match && round >= Number(match[1]) && round <= Number(match[2] ?? match[1]);
  });
}
