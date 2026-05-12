import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { Trophy } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DriverPhoto } from "@/components/driver-photo";
import { DriverList } from "@/components/entity-link";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PageHeader } from "@/components/page-header";
import {
  getAllTimeStats,
  type DriverPodiumStat,
  type DriverStat,
  type LeMansWinner,
  type StatRow,
} from "@/lib/api";

export const metadata = { title: "All-time stats" };

export default async function StatsPage() {
  const stats = await getAllTimeStats();
  const t = await getTranslations("stats");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <div className="space-y-2">
        <p className="eyebrow">{t("championships")}</p>
        <section className="grid gap-6 lg:grid-cols-3">
          <TitlesCard
            title={t("driversMostTitles")}
            rows={stats.driverTitles}
            hrefBase="/drivers"
          />
          <TitlesCard
            title={t("manufacturersMostTitles")}
            rows={stats.manufacturerTitles}
            hrefBase="/manufacturers"
          />
          <TitlesCard
            title={t("teamsMostTitles")}
            rows={stats.teamTitles}
            hrefBase="/teams"
          />
        </section>
      </div>

      <div className="space-y-2">
        <p className="eyebrow">{t("raceFinishes")}</p>
        <section className="grid gap-6 lg:grid-cols-2">
          <WinsCard
            title={t("driversMostWins")}
            rows={stats.driverWins}
            countLabel={t("wins")}
            countOf={(d) => d.wins}
          />
          <WinsCard
            title={t("driversMostPodiums")}
            rows={stats.driverPodiums}
            countLabel={t("podiums")}
            countOf={(d) => d.podiums}
          />
        </section>
      </div>

      <div className="space-y-2">
        <p className="eyebrow">{t("leMans")}</p>
        <Card>
          <CardHeader>
            <CardTitle>{t("overallWinners")}</CardTitle>
            <CardDescription>
              {t("leMansSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <LeMansTable rows={stats.leMansWinners} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function TitlesCard({
  title,
  rows,
  hrefBase,
}: {
  title: string;
  rows: StatRow[];
  hrefBase: string;
}) {
  const t = useTranslations("stats");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        {rows.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-muted-foreground">
            {t("noChampionsYet")}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {rows.map((r, i) => (
              <li
                key={r.id}
                className="flex items-center gap-3 px-4 py-2 text-sm"
              >
                <span className="w-6 font-mono tabular-nums text-muted-foreground">
                  {i + 1}
                </span>
                {r.photoUrl !== null ? (
                  <DriverPhoto src={r.photoUrl} name={r.name} size="sm" />
                ) : (
                  <ManufacturerLogo src={r.logoUrl} name={r.name} />
                )}
                <Link
                  href={`${hrefBase}/${r.id}`}
                  className="min-w-0 flex-1 truncate hover:text-[var(--racing-red)]"
                >
                  {r.name}
                </Link>
                <span className="inline-flex items-center gap-1 text-[var(--racing-yellow)]">
                  <Trophy className="size-3" fill="currentColor" />
                  <span className="font-mono font-semibold tabular-nums text-foreground">
                    {r.titles}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function WinsCard<T extends DriverStat | DriverPodiumStat>({
  title,
  rows,
  countLabel,
  countOf,
}: {
  title: string;
  rows: T[];
  countLabel: string;
  countOf: (r: T) => number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-0">
        <ul className="divide-y divide-border">
          {rows.map((r, i) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2 text-sm">
              <span className="w-6 font-mono tabular-nums text-muted-foreground">
                {i + 1}
              </span>
              <DriverPhoto src={r.photoUrl} name={r.name} size="sm" />
              <Link
                href={`/drivers/${r.id}`}
                className="min-w-0 flex-1 truncate hover:text-[var(--racing-red)]"
              >
                {r.name}
              </Link>
              <span className="font-mono font-semibold tabular-nums">
                {countOf(r)}
              </span>
              <span className="text-xs text-muted-foreground">
                {countLabel}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function LeMansTable({ rows }: { rows: LeMansWinner[] }) {
  const t = useTranslations("stats");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 pl-4">{t("colYear")}</TableHead>
          <TableHead className="w-12">{t("colCar")}</TableHead>
          <TableHead>{t("colTeam")}</TableHead>
          <TableHead>{t("colDrivers")}</TableHead>
          <TableHead className="hidden pr-4 sm:table-cell">{t("colManufacturer")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.year}-${r.carNumber}`}>
            <TableCell className="pl-4 font-mono tabular-nums">
              <Link
                href={`/races/${r.eventId}`}
                className="hover:text-[var(--racing-red)]"
              >
                {r.year}
              </Link>
            </TableCell>
            <TableCell className="font-mono tabular-nums">
              {r.carNumber}
            </TableCell>
            <TableCell>
              <Link
                href={`/teams/${r.teamId}`}
                className="hover:text-[var(--racing-red)]"
              >
                {r.team}
              </Link>
            </TableCell>
            <TableCell className="text-muted-foreground">
              <DriverList
                refs={r.driverRefs}
                text={r.drivers}
                stacked
                className="text-sm"
              />
            </TableCell>
            <TableCell className="hidden pr-4 sm:table-cell">
              <span className="inline-flex items-center gap-2">
                <ManufacturerLogo
                  src={r.manufacturerLogoUrl}
                  name={r.manufacturer}
                />
                <span className="text-muted-foreground">
                  {r.manufacturer ?? "—"}
                </span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
