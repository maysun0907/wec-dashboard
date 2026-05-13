import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
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
import { CarModelLink, Dash } from "@/components/entity-link";
import { DriverPhoto } from "@/components/driver-photo";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { BrandLinkPills } from "@/components/brand-link-pills";
import {
  describeRounds,
  getTeam,
  raceClassLabel,
  type TeamDetail,
  type TeamSeason,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";

type Params = { id: string };

async function fetchTeam(
  id: string,
  year: number | null,
): Promise<TeamDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getTeam(numId, year);
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
  const t = await fetchTeam(id, year);
  return { title: t?.name ?? "Team" };
}

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const year = await getSelectedSeason();
  const teamRaw = await fetchTeam(id, year);
  if (teamRaw === null) notFound();
  const rawLocale = await getLocale();
  const localeForName = isLocale(rawLocale) ? rawLocale : "en";
  const team = {
    ...teamRaw,
    results: teamRaw.results.map((r) => ({
      ...r,
      eventName: localizeEventName(r.eventName, localeForName),
    })),
  };
  const t = await getTranslations("teams");
  const tt = await getTranslations("table");

  return (
    <div className="space-y-6">
      <Link
        href="/teams"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("title")}
      </Link>

      <Card>
        <CardHeader className="flex flex-row items-center gap-4 space-y-0">
          {/* Logo isn't a link any more — single-team brands like
              Genesis would land you on the manufacturer page that
              just redirects right back here. The brand name in the
              description is enough wayfinding. */}
          <ManufacturerLogo
            src={team.manufacturerLogoUrl}
            name={team.manufacturer}
            size="xl"
          />
          <div className="space-y-1">
            <CardTitle className="flex flex-wrap items-center gap-x-2 gap-y-1 text-2xl sm:text-3xl">
              <span>{team.name}</span>
              <ChampionBadge
                titles={team.seasons.filter(
                  (s) => s.championshipPosition === 1,
                ).length}
                size="md"
              />
            </CardTitle>
            <CardDescription>
              {team.manufacturer ?? t("independent")}
              {" · "}
              {t("carsThisSeason", { count: team.cars.length })}
            </CardDescription>
          </div>
        </CardHeader>
        {(team.websiteUrl ||
          team.youtubeUrl ||
          team.xUrl ||
          team.instagramUrl) && (
          <div className="border-t border-border/40 px-6 py-4">
            <BrandLinkPills brand={team} />
          </div>
        )}
      </Card>

      <section className="space-y-6">
        <h2 className="text-sm font-semibold tracking-widest uppercase text-muted-foreground">
          {t("entries")}
        </h2>
        <div className="grid gap-6 lg:grid-cols-2">
          {team.cars.map((c) => (
            <Card key={c.carId}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>
                      <span className="font-mono">#{c.number}</span>{" "}
                      <CarModelLink
                        slug={c.carModelSlug}
                        className="text-muted-foreground"
                      >
                        {c.model ?? ""}
                      </CarModelLink>
                    </CardTitle>
                    <CardDescription>
                      {t("driversN", { count: c.drivers.length })}
                    </CardDescription>
                  </div>
                  <ClassBadge raceClass={c.raceClass} />
                </div>
              </CardHeader>
              {(c.imageUrl ?? c.carModelImageUrl) && (
                <span className="relative mx-auto block h-24 w-full px-4">
                  <Image
                    src={(c.imageUrl ?? c.carModelImageUrl)!}
                    alt={`#${c.number} ${c.model ?? ""}`}
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
                    {t("noDriversListed")}
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
        </div>
      </section>

      {team.seasons.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("career")}</CardTitle>
            <CardDescription>{teamCareerSummary(team.seasons)}</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <TeamCareerTable rows={team.seasons} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("raceResults")}</CardTitle>
          <CardDescription>
            {team.results.length === 0
              ? t("noCompletedRaces")
              : t("resultsSubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="px-0">
          {team.results.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 pl-4">{tt("round")}</TableHead>
                  <TableHead>{tt("event")}</TableHead>
                  <TableHead className="w-12">#</TableHead>
                  <TableHead className="w-16">{tt("class")}</TableHead>
                  <TableHead className="w-14 text-right">Cls</TableHead>
                  <TableHead className="w-12 text-right text-muted-foreground">
                    {tt("pos")}
                  </TableHead>
                  <TableHead className="pr-4 text-right">{tt("pts")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {team.results.map((r) => (
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
                    <TableCell className="font-mono tabular-nums">
                      {r.carNumber}
                    </TableCell>
                    <TableCell>
                      <ClassBadge raceClass={r.raceClass} />
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums">
                      P{r.classPosition}
                    </TableCell>
                    <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
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
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function teamCareerSummary(seasons: TeamSeason[]): string {
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

function TeamCareerTable({ rows }: { rows: TeamSeason[] }) {
  const tt = useTranslations("table");
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-16 pl-4">Year</TableHead>
          <TableHead className="w-20">{tt("class")}</TableHead>
          <TableHead className="w-12 text-right">#</TableHead>
          <TableHead className="w-16 text-right">{tt("pos")}</TableHead>
          <TableHead className="w-20 text-right">{tt("pts")}</TableHead>
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
              key={`${s.year}-${s.raceClass}-${s.carNumber}-${i}`}
              className={isTitle ? "bg-[var(--racing-yellow)]/5" : undefined}
            >
              <TableCell className="pl-4 font-mono tabular-nums">{s.year}</TableCell>
              <TableCell>
                <span className="font-mono text-xs text-muted-foreground">
                  {raceClassLabel(s.raceClass)}
                </span>
              </TableCell>
              <TableCell className="text-right font-mono tabular-nums text-muted-foreground">
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
