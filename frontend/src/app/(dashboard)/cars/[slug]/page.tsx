import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassBadge } from "@/components/class-badge";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { getCarModel, type CarModelDetail, type RaceClass } from "@/lib/api";
import { localCarImage } from "@/lib/car-image";
import { getSelectedSeason } from "@/lib/season";

type Params = { slug: string };

async function fetchCar(slug: string): Promise<CarModelDetail | null> {
  try {
    const year = await getSelectedSeason();
    return await getCarModel(slug, year);
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { slug } = await params;
  const car = await fetchCar(slug);
  return { title: car?.name ?? "Car" };
}

export default async function CarDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { slug } = await params;
  const car = await fetchCar(slug);
  if (car === null) notFound();

  const primaryClass: RaceClass | null =
    car.teams.length > 0 ? car.teams[0].raceClass : null;
  const imageUrl = car.imageUrl ?? localCarImage(slug);
  const t = await getTranslations("cars");

  return (
    <div className="space-y-6">
      <Link
        href="/cars"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("title")}
      </Link>

      <Card>
        <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
          <CarImage src={imageUrl} alt={car.name} />
          <div className="min-w-0 flex-1 space-y-1">
            <CardTitle className="text-2xl sm:text-3xl">{car.name}</CardTitle>
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
                  <Link
                    href={`/teams/${t.teamId}`}
                    className="flex-1 truncate font-medium hover:text-[var(--racing-red)]"
                  >
                    {t.teamName}
                  </Link>
                  <ClassBadge raceClass={t.raceClass} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
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
