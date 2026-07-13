import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ManufacturerComparePicker } from "@/components/manufacturer-compare-picker";
import { PageHeader } from "@/components/page-header";
import { PublicLink } from "@/components/public-link";
import {
  ProgressionChart,
  type Series as ProgressionSeries,
} from "@/components/progression-chart";
import {
  getManufacturerProgression,
  getManufacturerStandings,
  type ManufacturerProgression,
  type StandingManufacturer,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";

export const generateMetadata = () =>
  dashboardPageMetadata("manufacturerCompare", "/manufacturers/compare");

function parseIds(raw: string | string[] | undefined): number[] {
  const text = Array.isArray(raw) ? raw.join(",") : raw ?? "";
  const out: number[] = [];
  for (const part of text.split(",")) {
    const n = Number(part.trim());
    if (Number.isFinite(n) && n > 0 && !out.includes(n)) out.push(n);
  }
  return out.slice(0, 5);
}

export default async function ManufacturerComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ids?: string | string[] }>;
}) {
  const sp = await searchParams;
  let ids = parseIds(sp.ids);
  const year = await getSelectedSeason();
  const seasonYear = year ?? new Date().getUTCFullYear();

  // Manufacturer championship is Hypercar-only — no need for a class toggle.
  const [standings, progression] = await Promise.all([
    getManufacturerStandings("HYPERCAR", year).catch(
      () => [] as StandingManufacturer[],
    ),
    getManufacturerProgression("HYPERCAR", 20, year).catch(
      () => [] as ManufacturerProgression[],
    ),
  ]);

  // Default to the championship's top 3 so the page is useful on first load.
  if (ids.length === 0) {
    ids = standings.slice(0, 3).map((s) => s.manufacturerId);
  }

  const standingById = new Map(
    standings.map((s) => [s.manufacturerId, s] as const),
  );
  const progressionById = new Map(
    progression.map((p) => [p.manufacturerId, p] as const),
  );

  const selected = ids
    .map((id) => standingById.get(id))
    .filter((s): s is StandingManufacturer => s !== undefined);

  const series: ProgressionSeries[] = selected
    .map((s) => {
      const p = progressionById.get(s.manufacturerId);
      if (!p) return null;
      return {
        key: `m-${p.manufacturerId}`,
        label: p.manufacturerName,
        points: p.points,
      };
    })
    .filter((s): s is ProgressionSeries => s !== null);

  const t = await getTranslations("compare");
  const tSeasons = await getTranslations("seasons");
  const tStandings = await getTranslations("standings");
  return (
    <div className="space-y-6">
      <PublicLink
        href="/standings"
        seasonYear={seasonYear}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {tStandings("title")}
      </PublicLink>

      <PageHeader
        eyebrow={tSeasons("sideBySide")}
        title={t("compareManufacturers")}
        description={t("compareManufacturersHypercarDesc")}
      />

      <ManufacturerComparePicker selected={selected} catalog={standings} />

      {selected.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t("pickAtLeastOneManufacturer")}
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("standingsSnapshot")}</CardTitle>
              <CardDescription>
                {t("standingsSnapshotSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="px-0">
              <StatsTable rows={selected} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("championshipProgression")}</CardTitle>
              <CardDescription>
                {t("manufacturerProgressionSubtitle")}
              </CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <ProgressionChart series={series} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatsTable({ rows }: { rows: StandingManufacturer[] }) {
  const t = useTranslations("compare");
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs uppercase tracking-wider text-muted-foreground">
          <tr className="border-b border-border">
            <th className="px-4 py-2 text-left">{t("colManufacturer")}</th>
            <th className="px-2 py-2 text-right">{t("colChampPos")}</th>
            <th className="px-4 py-2 text-right">{t("colPoints")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((m) => (
            <tr
              key={m.manufacturerId}
              className="border-b border-border/50 last:border-0"
            >
              <td className="px-4 py-2">
                <PublicLink
                  href={`/manufacturers/${m.manufacturerId}`}
                  className="font-medium hover:text-[var(--racing-red)]"
                >
                  {m.manufacturerName}
                </PublicLink>
              </td>
              <td className="px-2 py-2 text-right font-mono tabular-nums">
                P{m.position}
              </td>
              <td className="px-4 py-2 text-right font-mono tabular-nums">
                {m.points}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
