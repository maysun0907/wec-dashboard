import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeEventName } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
import { BrandLinkPills } from "@/components/brand-link-pills";
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
import { CarModelLink, Dash, TeamLink } from "@/components/entity-link";
import { Flag } from "@/components/flag";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PublicLink } from "@/components/public-link";
import {
  describeRounds,
  getEvents,
  getManufacturer,
  getManufacturerStandings,
  isApiNotFound,
  raceClassLabel,
  type ManufacturerDetail,
  type ManufacturerResult,
  type ManufacturerSeason,
  type RaceClass,
  type StandingManufacturer,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import {
  JsonLd,
  breadcrumbSchema,
  buildSiteUrl,
  manufacturerSchema,
} from "@/lib/json-ld";
import { pageMetadataUrls } from "@/lib/page-metadata";
import { seasonDataRevalidateSeconds } from "@/lib/cache-policy";

type Params = { id: string };

async function fetchManufacturer(
  id: string,
  year: number | null,
  revalidate: number,
): Promise<ManufacturerDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getManufacturer(numId, year, { revalidate });
  } catch (error) {
    if (isApiNotFound(error)) return null;
    throw error;
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
  const events = await getEvents(year);
  const revalidate = seasonDataRevalidateSeconds(events);
  const metadataYear = new Date().getUTCFullYear();
  const path = `/manufacturers/${id}` as const;
  const urls = pageMetadataUrls({ path, locale, year: metadataYear });
  const m = await fetchManufacturer(id, year, revalidate);
  if (!m) {
    return {
      title: "Manufacturer",
      alternates: { canonical: urls.canonical, languages: urls.languages },
      openGraph: { url: urls.canonical, type: "article" },
    };
  }
  const country = m.country ? ` (${m.country})` : "";
  const titles = m.seasons.filter((s) => s.championshipPosition === 1).length;
  const totalWins = m.seasons.reduce((a, s) => a + s.wins, 0);
  const totalRaces = m.seasons.reduce((a, s) => a + s.races, 0);
  const totalPodiums = m.seasons.reduce((a, s) => a + s.podiums, 0);
  const classes = Array.from(new Set(m.cars.map((c) => raceClassLabel(c.raceClass))));
  const yearLabel = year ? ` ${year}` : "";
  const programmePart = classes.length > 0
    ? locale === "ko"
      ? ` ${classes.join("/")} 클래스에 차량 ${m.cars.length}대${yearLabel}.`
      : ` ${m.cars.length} car${m.cars.length === 1 ? "" : "s"} in ${classes.join("/")}${yearLabel}.`
    : "";
  const titlesPart = titles > 0
    ? locale === "ko"
      ? ` WEC 매뉴팩처 타이틀 ${titles}회.`
      : ` ${titles}× WEC manufacturer title${titles === 1 ? "" : "s"}.`
    : "";
  const statsPart = totalRaces > 0
    ? locale === "ko"
      ? ` 차량 기준 ${totalRaces}경기, ${totalWins}승, 포디움 ${totalPodiums}회.`
      : ` ${totalRaces} car-races, ${totalWins} wins, ${totalPodiums} podiums.`
    : "";
  const desc =
    locale === "ko"
      ? `${m.name}${country} — FIA WEC 팩토리 프로그램.${programmePart}${titlesPart}${statsPart} 출전 차량과 드라이버, 시즌별 매뉴팩처 순위 및 레이스 결과를 확인하세요.`
      : `${m.name}${country} — FIA WEC factory programme.${programmePart}${titlesPart}${statsPart} Race cars, drivers, season-by-season manufacturer standings and full race results.`;
  // `images` is intentionally omitted - the colocated `opengraph-image.tsx`
  // generates the dynamic branded card and a static `images` here would
  // shallow-merge ahead of it.
  return {
    title: m.name,
    description: desc,
    alternates: {
      canonical: urls.canonical,
      languages: urls.languages,
    },
    openGraph: {
      title: `${m.name} · WEC Dashboard`,
      description: desc,
      url: urls.canonical,
      type: "article",
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: [locale === "ko" ? "en_US" : "ko_KR"],
    },
    twitter: {
      card: "summary_large_image",
      title: m.name,
      description: desc,
    },
  };
}

export default async function ManufacturerDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const year = await getSelectedSeason();
  const events = await getEvents(year);
  const revalidate = seasonDataRevalidateSeconds(events);
  const manufacturerRaw = await fetchManufacturer(id, year, revalidate);
  if (manufacturerRaw === null) notFound();
  const rawLocale = await getLocale();
  const localeForName = isLocale(rawLocale) ? rawLocale : "en";
  const manufacturer = {
    ...manufacturerRaw,
    results: manufacturerRaw.results.map((r) => ({
      ...r,
      eventName: localizeEventName(r.eventName, localeForName),
    })),
  };
  const t = await getTranslations("manufacturers");
  const tCommon = await getTranslations("common");
  const tDrivers = await getTranslations("drivers");
  const tStandings = await getTranslations("standings");
  const schemaContext = {
    locale: localeForName,
    year: year ?? new Date().getUTCFullYear(),
  } as const;

  const totalCars = manufacturer.cars.length;
  const totalDrivers = new Set(
    manufacturer.cars.flatMap((c) => c.drivers.map((d) => d.id)),
  ).size;

  // "Other manufacturers in same class" — pull the standings (which is
  // already class-filtered) and exclude the current brand. Capped at 5.
  const primaryClass: RaceClass | null =
    manufacturer.cars[0]?.raceClass ?? manufacturer.standings[0]?.raceClass ?? null;
  let relatedManufacturers: StandingManufacturer[] = [];
  if (primaryClass) {
    try {
      const standings = await getManufacturerStandings(primaryClass, year, {
        revalidate,
      });
      relatedManufacturers = standings
        .filter((m) => m.manufacturerId !== manufacturer.id)
        .slice(0, 5);
    } catch {
      relatedManufacturers = [];
    }
  }

  const schemas = [
    manufacturerSchema(manufacturer, schemaContext),
    breadcrumbSchema([
      {
        name: localeForName === "ko" ? "홈" : "Home",
        url: buildSiteUrl("/", schemaContext),
      },
      {
        name: localeForName === "ko" ? "매뉴팩처" : "Manufacturers",
        url: buildSiteUrl("/standings", schemaContext),
      },
      {
        name: manufacturer.name,
        url: buildSiteUrl(
          `/manufacturers/${manufacturer.id}`,
          schemaContext,
        ),
      },
    ]),
  ];

  return (
    <div className="space-y-6">
      <JsonLd schema={schemas} />
      <div className="flex items-center justify-between">
        <PublicLink
          href="/standings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← {tStandings("title")}
        </PublicLink>
        <Link
          href={`/manufacturers/compare?ids=${manufacturer.id}`}
          className="inline-flex items-center rounded-md border border-border bg-secondary/40 px-3 py-1.5 text-sm font-medium hover:bg-secondary"
        >
          {tCommon("compare")} →
        </Link>
      </div>

      <Card className="relative overflow-hidden">
        <CardHeader className="flex flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:gap-4">
          <ManufacturerLogo
            src={manufacturer.logoUrl}
            name={manufacturer.name}
            size="xl"
          />
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl sm:text-3xl">
              {manufacturer.country && (
                <Flag
                  code={manufacturer.country}
                  flagOnly
                  className="text-2xl"
                />
              )}
              <span>{manufacturer.name}</span>
              <ChampionBadge
                titles={manufacturer.seasons.filter(
                  (s) => s.championshipPosition === 1,
                ).length}
                size="md"
              />
            </CardTitle>
            <CardDescription>
              {t("carsAndDrivers", { cars: totalCars, drivers: totalDrivers })}
            </CardDescription>
          </div>
        </CardHeader>
        {manufacturer.standings.length > 0 && (
          <CardContent>
            <div className="flex flex-wrap items-baseline gap-x-6 gap-y-3 text-sm">
              {manufacturer.standings.map((s) => (
                <Stat
                  key={s.raceClass}
                  label={t("championshipLabel", { cls: s.raceClass })}
                  value={t("championshipValue", { pos: s.position, pts: s.points })}
                />
              ))}
            </div>
          </CardContent>
        )}
        <ManufacturerLinks manufacturer={manufacturer} />
      </Card>

      <section className="grid gap-6 [grid-template-columns:repeat(auto-fit,minmax(20rem,1fr))]">
        {manufacturer.cars.map((c) => (
          <Card key={c.carId}>
            <CardHeader className="space-y-1">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  <PublicLink
                    href={`/teams/${c.teamId}`}
                    className="hover:text-[var(--racing-red)]"
                  >
                    {c.teamName}
                  </PublicLink>
                </CardTitle>
                <ClassBadge raceClass={c.raceClass} />
              </div>
              <CardDescription className="flex items-center gap-2">
                <span className="font-mono text-xs text-foreground">
                  #{c.carNumber}
                </span>
                {c.model && (
                  <CarModelLink slug={c.carModelSlug}>{c.model}</CarModelLink>
                )}
              </CardDescription>
            </CardHeader>
            {(c.imageUrl ?? c.carModelImageUrl) && (
              <span className="relative mx-auto block h-24 w-full px-4">
                <Image
                  src={(c.imageUrl ?? c.carModelImageUrl)!}
                  alt={`#${c.carNumber} ${manufacturer.name}${c.model ? ` ${c.model}` : ""}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 320px"
                  className="object-contain"
                  loading="lazy"
                />
              </span>
            )}
            <CardContent>
              {c.drivers.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {tDrivers("noCoDrivers")}
                </p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {c.drivers.map((d) => {
                    const tag = describeRounds(d.rounds);
                    return (
                      <li key={d.id} className="flex items-center gap-2">
                        <DriverPhoto src={d.photoUrl} name={d.name} size="sm" />
                        <PublicLink
                          href={`/drivers/${d.id}`}
                          className="hover:text-[var(--racing-red)]"
                        >
                          {d.name}
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
        ))}
      </section>

      {manufacturer.seasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("career")}</CardTitle>
            <CardDescription>
              {manufacturerCareerSummary(manufacturer.seasons)}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ManufacturerCareerTable rows={manufacturer.seasons} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("raceResults")}</CardTitle>
          <CardDescription>
            {manufacturer.results.length === 0
              ? tDrivers("noCompletedRaces")
              : t("raceResultsSubtitle", { name: manufacturer.name })}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {manufacturer.results.length > 0 && (
            <ResultsTable rows={manufacturer.results} />
          )}
        </CardContent>
      </Card>

      {relatedManufacturers.length > 0 && primaryClass && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("relatedTitle", { raceClass: raceClassLabel(primaryClass) })}
            </CardTitle>
            <CardDescription>{t("relatedSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {relatedManufacturers.map((r) => (
                <li key={r.manufacturerId}>
                  <PublicLink
                    href={`/manufacturers/${r.manufacturerId}`}
                    className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2 text-sm transition-colors hover:bg-secondary/40"
                  >
                    <ManufacturerLogo
                      src={r.manufacturerLogoUrl}
                      name={r.manufacturerName}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.manufacturerName}
                    </span>
                    <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
                      P{r.position}
                    </span>
                  </PublicLink>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function manufacturerCareerSummary(seasons: ManufacturerSeason[]): string {
  const titles = seasons.filter((s) => s.championshipPosition === 1).length;
  const totalRaces = seasons.reduce((s, r) => s + r.races, 0);
  const totalWins = seasons.reduce((s, r) => s + r.wins, 0);
  const totalPodiums = seasons.reduce((s, r) => s + r.podiums, 0);
  const years = Array.from(new Set(seasons.map((s) => s.year))).sort();
  const span =
    years.length > 1
      ? `${years[0]}–${years[years.length - 1]}`
      : `${years[0]}`;
  const titlesText = titles > 0 ? `${titles} title${titles === 1 ? "" : "s"} · ` : "";
  return `${span} · ${titlesText}${totalRaces} car-races · ${totalWins} wins · ${totalPodiums} podiums`;
}

function ManufacturerCareerTable({ rows }: { rows: ManufacturerSeason[] }) {
  const tt = useTranslations("table");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 pl-4">Year</TableHead>
          <TableHead className="w-20">{tt("class")}</TableHead>
          <TableHead className="w-16 text-right">{tt("pos")}</TableHead>
          <TableHead className="w-20 text-right">{tt("pts")}</TableHead>
          <TableHead className="hidden w-12 text-right sm:table-cell">Cars</TableHead>
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
              key={`${s.year}-${s.raceClass}-${i}`}
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
              <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                {s.cars > 0 ? s.cars : <Dash />}
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

async function ResultsTable({ rows }: { rows: ManufacturerResult[] }) {
  const tt = await getTranslations("table");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12 pl-4">Rd</TableHead>
          <TableHead>Event</TableHead>
          <TableHead className="hidden md:table-cell">Team</TableHead>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead className="w-16 text-right">Class</TableHead>
          <TableHead className="hidden w-14 text-right sm:table-cell">
            Pos
          </TableHead>
          <TableHead className="pr-4 text-right">{tt("estimatedPts")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.eventId}-${r.carNumber}`}>
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
            <TableCell className="hidden text-muted-foreground md:table-cell">
              <TeamLink id={r.teamId}>{r.teamName}</TeamLink>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {r.carNumber}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {r.classPosition > 0 ? `P${r.classPosition}` : "—"}
            </TableCell>
            <TableCell className="hidden text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
              P{r.position}
            </TableCell>
            <TableCell
              className={
                "pr-4 text-right font-mono tabular-nums " +
                (r.pointsAwarded > 0
                  ? "text-foreground"
                  : "text-muted-foreground")
              }
            >
              {r.pointsAwarded > 0 ? r.pointsAwarded : <Dash />}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
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

function ManufacturerLinks({
  manufacturer,
}: {
  manufacturer: ManufacturerDetail;
}) {
  if (
    !manufacturer.websiteUrl &&
    !manufacturer.youtubeUrl &&
    !manufacturer.xUrl &&
    !manufacturer.instagramUrl
  ) {
    return null;
  }
  return (
    <CardContent className="border-t border-border/40">
      <BrandLinkPills brand={manufacturer} />
    </CardContent>
  );
}
