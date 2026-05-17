import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
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
import {
  describeRounds,
  getManufacturer,
  raceClassLabel,
  type ManufacturerDetail,
  type ManufacturerResult,
  type ManufacturerSeason,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

type Params = { id: string };

async function fetchManufacturer(
  id: string,
  year: number | null,
): Promise<ManufacturerDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getManufacturer(numId, year);
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
  const year = await getSelectedSeason();
  const m = await fetchManufacturer(id, year);
  if (!m) return { title: "Manufacturer" };
  const country = m.country ? ` (${m.country})` : "";
  const desc = `${m.name}${country} — FIA WEC factory programme, race cars, season-by-season manufacturer standings and full race results.`;
  const ogImage = m.logoUrl ?? undefined;
  return {
    title: m.name,
    description: desc,
    alternates: { canonical: `/manufacturers/${id}` },
    openGraph: {
      title: `${m.name} · WEC Dashboard`,
      description: desc,
      url: `/manufacturers/${id}`,
      type: "article",
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: "summary",
      title: m.name,
      description: desc,
      ...(ogImage ? { images: [ogImage] } : {}),
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
  const manufacturerRaw = await fetchManufacturer(id, year);
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
  const tt = await getTranslations("table");
  const tStandings = await getTranslations("standings");

  // Single-team brands (Genesis Magma Racing, Alpine Endurance Team,
  // etc.) — the manufacturer page would just be a near-duplicate of
  // the team page, so jump straight to the team. Multi-team brands
  // (Ferrari with AF Corse + Vista AF Corse + Ferrari AF Corse, BMW
  // with M Team WRT + Team WRT, ...) keep their own page since it
  // unifies entries across teams.
  const teamIds = new Set(manufacturer.cars.map((c) => c.teamId));
  if (teamIds.size === 1) {
    const onlyTeamId = manufacturer.cars[0]?.teamId;
    if (onlyTeamId !== undefined) {
      redirect(`/teams/${onlyTeamId}`);
    }
  }

  const totalCars = manufacturer.cars.length;
  const totalDrivers = new Set(
    manufacturer.cars.flatMap((c) => c.drivers.map((d) => d.id)),
  ).size;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/standings"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          ← {tStandings("title")}
        </Link>
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
                  <Link
                    href={`/teams/${c.teamId}`}
                    className="hover:text-[var(--racing-red)]"
                  >
                    {c.teamName}
                  </Link>
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
                  alt={`#${c.carNumber} ${c.model ?? ""}`}
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
                        <Link
                          href={`/drivers/${d.id}`}
                          className="hover:text-[var(--racing-red)]"
                        >
                          {d.name}
                        </Link>
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

function ResultsTable({ rows }: { rows: ManufacturerResult[] }) {
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
          <TableHead className="pr-4 text-right">Pts</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((r) => (
          <TableRow key={`${r.eventId}-${r.carNumber}`}>
            <TableCell className="pl-4 font-mono tabular-nums">
              {r.round}
            </TableCell>
            <TableCell>
              <Link
                href={`/races/${r.eventId}`}
                className="hover:text-[var(--racing-red)]"
              >
                {r.eventName}
              </Link>
            </TableCell>
            <TableCell className="hidden text-muted-foreground md:table-cell">
              <TeamLink id={r.teamId}>{r.teamName}</TeamLink>
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              {r.carNumber}
            </TableCell>
            <TableCell className="text-right font-mono tabular-nums">
              P{r.classPosition}
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
