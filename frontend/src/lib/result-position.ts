/** Zero means unclassified (for example DSQ), never a better finish than P1. */
export function positionSummary(rows: readonly { classPosition: number }[]) {
  const positions = rows.map((r) => r.classPosition).filter((p) => Number.isFinite(p) && p > 0);
  return {
    best: positions.length ? Math.min(...positions) : null,
    average: positions.length ? positions.reduce((sum, p) => sum + p, 0) / positions.length : null,
  };
}
