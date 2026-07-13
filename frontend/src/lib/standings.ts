type TeamStandingIdentity = {
  teamId: number;
  carNumber: string | null;
  position: number;
};

type TeamStandingDetail = {
  carNumber: string | null;
  manufacturer: string | null;
};

export function teamStandingRowKey(row: TeamStandingIdentity): string {
  return `t-${row.teamId}-${row.carNumber ?? row.position}`;
}

export function teamStandingDetail(row: TeamStandingDetail): string | undefined {
  return [row.carNumber ? `#${row.carNumber}` : null, row.manufacturer]
    .filter(Boolean)
    .join(" · ") || undefined;
}
