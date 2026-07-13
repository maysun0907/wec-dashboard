import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeEventName } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
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
import { ChampionBadge } from "@/components/champion-badge";
import { ClassBadge } from "@/components/class-badge";
import { DriverPhoto } from "@/components/driver-photo";
import { localDriverImage } from "@/lib/driver-image";
import { CarModelLink, Dash, TeamLink } from "@/components/entity-link";
import { Flag } from "@/components/flag";
import { FormChart } from "@/components/form-chart";
import { PublicLink } from "@/components/public-link";
import {
  describeRounds,
  getDriver,
  raceClassLabel,
  type DriverDetail,
  type DriverResult,
  type DriverSeason,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import {
  JsonLd,
  breadcrumbSchema,
  buildSiteUrl,
  personSchema,
} from "@/lib/json-ld";
import { pageMetadataUrls } from "@/lib/page-metadata";

type Params = { id: string };

async function fetchDriver(
  id: string,
  year: number | null,
): Promise<DriverDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getDriver(numId, year);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { id } = await params;
  const [year, rawLocale] = await Promise.all([
    getSelectedSeason(),
    getLocale(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const metadataYear = new Date().getUTCFullYear();
  const path = `/drivers/${id}` as const;
  const urls = pageMetadataUrls({ path, locale, year: metadataYear });
  const d = await fetchDriver(id, year);
  if (!d) {
    return {
      title: "Driver",
      alternates: { canonical: urls.canonical, languages: urls.languages },
      openGraph: { url: urls.canonical, type: "profile" },
    };
  }
  const nat = d.nationality ? ` (${d.nationality})` : "";
  const classLabel = d.raceClass ? raceClassLabel(d.raceClass) : null;
  const titles = d.seasons.filter((s) => s.championshipPosition === 1).length;
  const totalWins = d.seasons.reduce((a, s) => a + s.wins, 0);
  const totalPodiums = d.seasons.reduce((a, s) => a + s.podiums, 0);
  const totalRaces = d.seasons.reduce((a, s) => a + s.races, 0);
  const yearLabel = year ? ` ${year}` : "";
  const teamPart = d.team
    ? locale === "ko"
      ? ` — ${d.team}${d.carNumber ? ` #${d.carNumber}` : ""}${classLabel ? ` ${classLabel} 클래스` : ""}${yearLabel}.`
      : ` — ${d.team}${d.carNumber ? ` #${d.carNumber}` : ""}${classLabel ? ` in ${classLabel}` : ""}${yearLabel}.`
    : ".";
  const carPart = d.carModel
    ? locale === "ko"
      ? ` ${d.carModel} 차량으로 출전합니다.`
      : ` Driving the ${d.carModel}.`
    : "";
  const titlesPart = titles > 0
    ? locale === "ko"
      ? ` WEC 챔피언 ${titles}회.`
      : ` ${titles}× WEC champion.`
    : "";
  const statsPart = totalRaces > 0
    ? locale === "ko"
      ? ` 통산 ${totalRaces}경기, ${totalWins}승, 포디움 ${totalPodiums}회.`
      : ` Career: ${totalRaces} races, ${totalWins} wins, ${totalPodiums} podiums.`
    : "";
  const desc =
    locale === "ko"
      ? `${d.name}${nat}${teamPart}${carPart}${titlesPart}${statsPart} FIA WEC 통계와 시즌 순위, 레이스별 결과를 확인하세요.`
      : `${d.name}${nat}${teamPart}${carPart}${titlesPart}${statsPart} FIA WEC stats, season standings, and race-by-race results.`;
  // `images` is intentionally omitted from openGraph/twitter so the
  // colocated `opengraph-image.tsx` route-segment file can supply the
  // dynamic branded card. A static `images` field here would shallow-
  // merge ahead of the file convention.
  return {
    title: d.name,
    description: desc,
    alternates: {
      canonical: urls.canonical,
      languages: urls.languages,
    },
    openGraph: {
      title: `${d.name} · WEC Dashboard`,
      description: desc,
      url: urls.canonical,
      type: "profile",
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: [locale === "ko" ? "en_US" : "ko_KR"],
    },
    twitter: {
      card: "summary_large_image",
      title: d.name,
      description: desc,
    },
  };
}

export default async function DriverDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const year = await getSelectedSeason();
  const driverRaw = await fetchDriver(id, year);
  if (driverRaw === null) notFound();
  const rawLocale = await getLocale();
  const localeForName = isLocale(rawLocale) ? rawLocale : "en";
  // Localize event names inside the results list so the table reads
  // in the current language.
  const driver = {
    ...driverRaw,
    results: driverRaw.results.map((r) => ({
      ...r,
      eventName: localizeEventName(r.eventName, localeForName),
    })),
  };
  const t = await getTranslations("drivers");
  const tt = await getTranslations("table");
  const schemaContext = {
    locale: localeForName,
    year: year ?? new Date().getUTCFullYear(),
  } as const;

  const schemas = [
    personSchema(driver, schemaContext),
    breadcrumbSchema([
      {
        name: localeForName === "ko" ? "홈" : "Home",
        url: buildSiteUrl("/", schemaContext),
      },
      {
        name: localeForName === "ko" ? "드라이버" : "Drivers",
        url: buildSiteUrl("/drivers", schemaContext),
      },
      {
        name: driver.name,
        url: buildSiteUrl(`/drivers/${driver.id}`, schemaContext),
      },
    ]),
  ];

  return (
    <div className="space-y-6">
      <JsonLd schema={schemas} />
      <PublicLink
        href="/drivers"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("title")}
      </PublicLink>

      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:gap-4">
          <DriverPhoto
            src={localDriverImage(driver.id) ?? driver.photoUrl}
            name={driver.name}
            size="xl"
            className="mt-1"
          />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="flex items-center gap-3 text-xs font-semibold tracking-widest uppercase">
              {driver.raceClass && <ClassBadge raceClass={driver.raceClass} />}
              {driver.carNumber && (
                <span className="font-mono text-muted-foreground">
                  #{driver.carNumber}
                </span>
              )}
              {driver.team && (
                <TeamLink
                  id={driver.teamId}
                  className="text-muted-foreground"
                >
                  {driver.team}
                </TeamLink>
              )}
            </div>
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl sm:text-3xl">
              {driver.nationality && (
                <Flag code={driver.nationality} flagOnly className="text-2xl" />
              )}
              <span>{driver.name}</span>
              <ChampionBadge
                titles={driver.seasons.filter(
                  (s) => s.championshipPosition === 1,
                ).length}
                size="md"
              />
            </CardTitle>
            <CardDescription>
              {driver.manufacturer && <span>{driver.manufacturer}</span>}
              {driver.manufacturer && driver.carModel && <span> · </span>}
              {driver.carModel && (
                <CarModelLink slug={driver.carModelSlug}>
                  {driver.carModel}
                </CarModelLink>
              )}
              {!driver.manufacturer && !driver.carModel && "—"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 text-sm">
            {driver.standing && (
              <>
                <Stat
                  label={t("championshipPos")}
                  value={`P${driver.standing.position}`}
                />
                <Stat
                  label={t("points")}
                  value={driver.standing.points.toString()}
                />
              </>
            )}
            <Stat
              label={t("racesFinished")}
              value={driver.results.length.toString()}
            />
            {driver.results.length > 0 && (
              <>
                <Stat
                  label={t("bestClassResult")}
                  value={`P${bestClassPosition(driver.results)}`}
                />
                <Stat
                  label={t("avgClassResult")}
                  value={averageClassPosition(driver.results).toFixed(1)}
                />
                {!driver.standing && (
                  <Stat
                    label={t("pointsScored")}
                    value={pointsScored(driver.results).toString()}
                  />
                )}
              </>
            )}
          </div>
        </CardContent>
      </Card>

      {driver.results.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("form")}</CardTitle>
            <CardDescription>
              {t("formSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="pb-4">
            <FormChart
              data={driver.results.map((r) => ({
                round: r.round,
                classPosition: r.classPosition,
              }))}
            />
          </CardContent>
        </Card>
      )}

      {driver.seasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("career")}</CardTitle>
            <CardDescription>
              {careerSummary(driver.seasons)}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <CareerTable rows={driver.seasons} />
          </CardContent>
        </Card>
      )}

      <section className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t("coDrivers")}</CardTitle>
            <CardDescription>
              {t("coDriversSubtitle", { count: driver.coDrivers.length })}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {driver.coDrivers.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("noCoDrivers")}
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {driver.coDrivers.map((c) => {
                  const tag = describeRounds(c.rounds);
                  return (
                    <li key={c.id} className="flex items-center gap-2">
                      <DriverPhoto src={c.photoUrl} name={c.name} size="sm" />
                      <PublicLink
                        href={`/drivers/${c.id}`}
                        className="hover:text-[var(--racing-red)]"
                      >
                        {c.name}
                      </PublicLink>
                      {tag && (
                        <span className="rounded bg-secondary px-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          {tag}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("raceResults")}</CardTitle>
            <CardDescription>
              {driver.results.length === 0
                ? t("noCompletedRaces")
                : t("overallByRound")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {driver.results.length > 0 && (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12 pl-4">{tt("round")}</TableHead>
                    <TableHead>{tt("event")}</TableHead>
                    <TableHead className="w-16 text-right">{tt("class")}</TableHead>
                    <TableHead className="w-14 text-right">{tt("pos")}</TableHead>
                    <TableHead className="hidden w-16 text-right sm:table-cell">
                      {t("colLaps")}
                    </TableHead>
                    <TableHead className="pr-4 text-right">{tt("pts")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {driver.results.map((r) => (
                    <TableRow key={r.eventId}>
                      <TableCell className="pl-4 font-mono tabular-nums">
                        {r.round}
                      </TableCell>
                      <TableCell>
                        <PublicLink
                          href={`/races/${r.eventId}`}
                          className="hover:text-[var(--racing-red)]"
                        >
                          {r.eventName}
                        </PublicLink>
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums">
                        P{r.classPosition}
                      </TableCell>
                      <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
                        P{r.position}
                      </TableCell>
                      <TableCell className="hidden text-right font-mono tabular-nums sm:table-cell">
                        {r.laps ?? "—"}
                      </TableCell>
                      <TableCell
                        className={
                          "pr-4 text-right font-mono tabular-nums " +
                          (r.pointsAwarded > 0
                            ? "text-foreground"
                            : "text-muted-foreground")
                        }
                      >
                        {r.pointsAwarded > 0 ? r.pointsAwarded : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function careerSummary(seasons: DriverSeason[]): string {
  const titles = seasons.filter((s) => s.championshipPosition === 1).length;
  const totalRaces = seasons.reduce((s, r) => s + r.races, 0);
  const totalWins = seasons.reduce((s, r) => s + r.wins, 0);
  const totalPodiums = seasons.reduce((s, r) => s + r.podiums, 0);
  const span =
    seasons.length > 1
      ? `${seasons[seasons.length - 1]!.year}–${seasons[0]!.year}`
      : `${seasons[0]!.year}`;
  const titlesText = titles > 0 ? `${titles} title${titles === 1 ? "" : "s"} · ` : "";
  return `${span} · ${titlesText}${totalRaces} races · ${totalWins} wins · ${totalPodiums} podiums`;
}

function CareerTable({ rows }: { rows: DriverSeason[] }) {
  const tt = useTranslations("table");
  const td = useTranslations("drivers");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 pl-4">{td("colYear")}</TableHead>
          <TableHead className="w-20">{tt("class")}</TableHead>
          <TableHead>{tt("team")}</TableHead>
          <TableHead className="hidden w-12 text-right sm:table-cell">#</TableHead>
          <TableHead className="w-16 text-right">{tt("pos")}</TableHead>
          <TableHead className="w-16 text-right">{tt("pts")}</TableHead>
          <TableHead className="hidden w-12 text-right md:table-cell">R</TableHead>
          <TableHead className="hidden w-12 text-right md:table-cell">W</TableHead>
          <TableHead className="w-14 pr-4 text-right">P</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((s, i) => {
          const isTitle = s.championshipPosition === 1;
          return (
            <TableRow
              key={`${s.year}-${s.carNumber}-${i}`}
              className={isTitle ? "bg-[var(--racing-yellow)]/5" : undefined}
            >
              <TableCell className="pl-4 font-mono tabular-nums">
                {s.year}
              </TableCell>
              <TableCell>
                <span className="font-mono text-xs text-muted-foreground">
                  {raceClassLabel(s.raceClass)}
                </span>
              </TableCell>
              <TableCell>
                <span className="inline-flex items-center gap-2">
                  <ManufacturerLogo
                    src={s.manufacturerLogoUrl}
                    name={s.manufacturer ?? s.team}
                  />
                  <TeamLink id={s.teamId} className="truncate">
                    {s.team}
                  </TeamLink>
                </span>
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                #{s.carNumber}
              </TableCell>
              <TableCell
                className={
                  "text-right font-mono tabular-nums " +
                  (isTitle ? "font-semibold text-[var(--racing-yellow)]" : "")
                }
              >
                {s.championshipPosition !== null ? (
                  `P${s.championshipPosition}`
                ) : (
                  <Dash />
                )}
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums">
                {s.points !== null ? s.points : <Dash />}
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground md:table-cell">
                {s.races > 0 ? s.races : <Dash />}
              </TableCell>
              <TableCell className="hidden text-right font-mono tabular-nums md:table-cell">
                {s.wins > 0 ? s.wins : <Dash />}
              </TableCell>
              <TableCell className="pr-4 text-right font-mono tabular-nums">
                {s.podiums > 0 ? s.podiums : <Dash />}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function bestClassPosition(results: DriverResult[]): number {
  return Math.min(...results.map((r) => r.classPosition));
}

function averageClassPosition(results: DriverResult[]): number {
  if (results.length === 0) return 0;
  return (
    results.reduce((sum, r) => sum + r.classPosition, 0) / results.length
  );
}

function pointsScored(results: DriverResult[]): number {
  return results.reduce((sum, r) => sum + r.pointsAwarded, 0);
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs text-muted-foreground uppercase tracking-wider">
        {label}
      </span>
      <span className="font-mono text-lg font-semibold tabular-nums">
        {value}
      </span>
    </div>
  );
}
