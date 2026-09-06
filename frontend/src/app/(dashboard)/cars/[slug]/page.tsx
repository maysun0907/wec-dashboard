import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getLocale, getTranslations } from "next-intl/server";
import { isLocale } from "@/i18n/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassBadge } from "@/components/class-badge";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PublicLink } from "@/components/public-link";
import {
  getCarModel,
  getCarModels,
  isApiNotFound,
  raceClassLabel,
  type CarModelDetail,
  type CarModelSummary,
  type RaceClass,
} from "@/lib/api";
import { localCarImage } from "@/lib/car-image";
import { getSelectedSeason } from "@/lib/season";
import {
  JsonLd,
  breadcrumbSchema,
  buildSiteUrl,
  carSchema,
} from "@/lib/json-ld";
import { pageMetadataUrls } from "@/lib/page-metadata";

type Params = { slug: string };

async function fetchCar(
  slug: string,
  year: number | null,
): Promise<CarModelDetail | null> {
  try {
    return await getCarModel(slug, year);
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
  const { slug } = await params;
  const [rawLocale, selectedYear] = await Promise.all([
    getLocale(),
    getSelectedSeason(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const metadataYear = selectedYear ?? new Date().getUTCFullYear();
  const path = `/cars/${slug}` as const;
  const urls = pageMetadataUrls({ path, locale, year: metadataYear });
  const car = await fetchCar(slug, selectedYear);
  if (!car || car.teams.length === 0) {
    return {
      title: "Car",
      robots: { index: false, follow: true },
      alternates: { canonical: urls.canonical, languages: urls.languages },
      openGraph: { url: urls.canonical, type: "article" },
    };
  }
  const primaryClass = car.teams.length > 0 ? raceClassLabel(car.teams[0].raceClass) : null;
  const factParts: string[] = [];
  if (car.manufacturer) factParts.push(car.manufacturer);
  if (car.engine) factParts.push(car.engine);
  if (primaryClass) {
    factParts.push(locale === "ko" ? `${primaryClass} 클래스` : `${primaryClass} class`);
  }
  if (car.category) factParts.push(car.category);
  if (car.yearIntroduced) {
    factParts.push(
      locale === "ko"
        ? `${car.yearIntroduced}년 데뷔`
        : `debuted ${car.yearIntroduced}`,
    );
  }
  const facts = factParts.join(", ");
  const statsPart = car.stats.races > 0
    ? locale === "ko"
      ? ` ${car.stats.races}경기에서 ${car.stats.wins}승, 포디움 ${car.stats.podiums}회, 폴 ${car.stats.poles}회.`
      : ` ${car.stats.wins} wins, ${car.stats.podiums} podiums, ${car.stats.poles} poles in ${car.stats.races} races.`
    : "";
  const desc =
    locale === "ko"
      ? `${metadataYear} WEC ${car.name}${facts ? ` — ${facts}.` : ""}${statsPart} FIA WEC 차량 제원, BoP 이력, 출전 드라이버·팀과 레이스별 결과를 확인하세요.`
      : `${metadataYear} ${car.name}${facts ? ` — ${facts}.` : ""}${statsPart} FIA WEC specifications, BoP history, drivers and teams running it, race-by-race results.`;
  const title =
    locale === "ko"
      ? `${metadataYear} WEC ${car.name}`
      : `${metadataYear} ${car.name} – FIA WEC Car`;
  // `images` is intentionally omitted - the colocated `opengraph-image.tsx`
  // generates the dynamic branded card and a static `images` here would
  // shallow-merge ahead of it.
  return {
    title,
    description: desc,
    alternates: {
      canonical: urls.canonical,
      languages: urls.languages,
    },
    openGraph: {
      title: `${title} · WEC Dashboard`,
      description: desc,
      url: urls.canonical,
      type: "article",
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: [locale === "ko" ? "en_US" : "ko_KR"],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description: desc,
    },
  };
}

export default async function CarDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const year = await getSelectedSeason();
  const seasonYear = year ?? new Date().getUTCFullYear();
  const car = await fetchCar(slug, year);
  if (car === null || car.teams.length === 0) notFound();
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";

  const primaryClass: RaceClass | null =
    car.teams.length > 0 ? car.teams[0].raceClass : null;
  const imageUrl = car.imageUrl ?? localCarImage(slug);
  const t = await getTranslations("cars");
  const schemaContext = {
    locale,
    year: seasonYear,
  } as const;

  // Same-class car-models, capped at 5. Best-effort: render nothing
  // when the listing endpoint hiccups so the rest of the page stays up.
  let relatedCars: CarModelSummary[] = [];
  if (primaryClass) {
    try {
      const all = await getCarModels(year);
      relatedCars = all
        .filter((m) => m.raceClass === primaryClass && m.slug !== car.slug)
        .slice(0, 5);
    } catch {
      relatedCars = [];
    }
  }

  const schemas = [
    carSchema(car, schemaContext),
    breadcrumbSchema([
      {
        name: locale === "ko" ? "홈" : "Home",
        url: buildSiteUrl("/", schemaContext),
      },
      {
        name: locale === "ko" ? "차량" : "Cars",
        url: buildSiteUrl("/cars", schemaContext),
      },
      {
        name: car.name,
        url: buildSiteUrl(`/cars/${car.slug}`, schemaContext),
      },
    ]),
  ];

  return (
    <div className="space-y-6">
      <JsonLd schema={schemas} />
      <PublicLink
        href="/cars"
        seasonYear={seasonYear}
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("title")}
      </PublicLink>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <CarImage
            src={imageUrl}
            alt={car.manufacturer ? `${car.manufacturer} ${car.name}` : car.name}
          />
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              {seasonYear} FIA WEC
            </p>
            <CardTitle as="h1" className="text-2xl sm:text-3xl">{car.name}</CardTitle>
            <CardDescription className="flex items-center gap-2">
              <ManufacturerLogo
                src={car.manufacturerLogoUrl}
                name={car.manufacturer ?? car.name}
              />
              {car.manufacturer ?? t("independent")}
            </CardDescription>
          </div>
          {primaryClass && <ClassBadge raceClass={primaryClass} />}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("specifications")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Spec label={t("category")} value={car.category} />
            <Spec
              label={t("yearIntroduced")}
              value={car.yearIntroduced ? String(car.yearIntroduced) : null}
              numeric
            />
            <Spec label={t("engine")} value={car.engine} />
            <Spec
              label={t("power")}
              value={car.powerHp ? `${car.powerHp} hp` : null}
              numeric
            />
            <Spec
              label={t("weight")}
              value={car.weightKg ? `${car.weightKg} kg` : null}
              numeric
            />
          </dl>
        </CardContent>
      </Card>

      {car.stats.races > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("seasonStats")}</CardTitle>
            <CardDescription>{t("seasonStatsSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
              <Spec label={t("wins")} value={String(car.stats.wins)} numeric />
              <Spec label={t("podiums")} value={String(car.stats.podiums)} numeric />
              <Spec label={t("poles")} value={String(car.stats.poles)} numeric />
              <Spec label={t("races")} value={String(car.stats.races)} numeric />
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("entriesCount", { count: car.teams.length })}</CardTitle>
          <CardDescription>{t("entriesSubtitle")}</CardDescription>
        </CardHeader>
        <CardContent>
          {car.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("noTeamsRunning")}
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {car.teams.map((t) => (
                <li
                  key={`${t.teamId}-${t.carNumber}`}
                  className="flex items-center gap-3 py-2"
                >
                  <span className="w-12 shrink-0 font-mono text-muted-foreground tabular-nums">
                    #{t.carNumber}
                  </span>
                  <PublicLink
                    href={`/teams/${t.teamId}`}
                    className="flex-1 truncate font-medium hover:text-[var(--racing-red)]"
                  >
                    {t.teamName}
                  </PublicLink>
                  <ClassBadge raceClass={t.raceClass} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {relatedCars.length > 0 && primaryClass && (
        <Card>
          <CardHeader>
            <CardTitle>
              {t("relatedTitle", { raceClass: raceClassLabel(primaryClass) })}
            </CardTitle>
            <CardDescription>{t("relatedSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {relatedCars.map((r) => (
                <li key={r.slug}>
                  <PublicLink
                    href={`/cars/${r.slug}`}
                    seasonYear={seasonYear}
                    className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2 text-sm transition-colors hover:bg-secondary/40"
                  >
                    <ManufacturerLogo
                      src={r.manufacturerLogoUrl}
                      name={r.manufacturer ?? r.name}
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.name}
                    </span>
                    {r.manufacturer && (
                      <span className="hidden truncate text-xs text-muted-foreground sm:inline">
                        {r.manufacturer}
                      </span>
                    )}
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

function Spec({
  label,
  value,
  numeric = false,
}: {
  label: string;
  value: string | null;
  numeric?: boolean;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          numeric
            ? "font-mono text-base font-semibold tabular-nums"
            : "text-base font-semibold"
        }
      >
        {value ?? "—"}
      </dd>
    </div>
  );
}

function CarImage({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      <span className="relative flex h-32 w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white sm:h-40 sm:w-64">
        <Image
          src={src}
          alt={alt}
          fill
          sizes="(max-width: 640px) 192px, 256px"
          className="object-contain p-2"
          priority
        />
      </span>
    );
  }
  return <CarImageFallback alt={alt} />;
}

function CarImageFallback({ alt }: { alt: string }) {
  const t = useTranslations("cars");
  return (
    <span
      aria-label={alt}
      className="flex h-32 w-48 shrink-0 items-center justify-center rounded-lg bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground sm:h-40 sm:w-64"
    >
      {t("noImageYet")}
    </span>
  );
}
