import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { getSelectedSeason } from "@/lib/season";

// Drop a transparent PNG at frontend/public/cars/{slug}.png and it shows
// up here automatically — no DB or code change needed. DB image_url is
// the secondary source if no local file is present.
const LOCAL_IMAGE_EXTS = ["png", "webp", "jpg"] as const;

function localImageUrl(slug: string): string | null {
  for (const ext of LOCAL_IMAGE_EXTS) {
    const file = path.join(process.cwd(), "public", "cars", `${slug}.${ext}`);
    if (existsSync(file)) return `/cars/${slug}.${ext}`;
  }
  return null;
}

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
  const imageUrl = localImageUrl(slug) ?? car.imageUrl;

  return (
    <div className="space-y-6">
      <Link
        href="/cars"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← Cars
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
              {car.manufacturer ?? "Independent"}
            </CardDescription>
          </div>
          {primaryClass && <ClassBadge raceClass={primaryClass} />}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Specifications</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Spec label="Category" value={car.category} />
            <Spec
              label="Year introduced"
              value={car.yearIntroduced ? String(car.yearIntroduced) : null}
            />
            <Spec label="Engine" value={car.engine} />
            <Spec
              label="Power"
              value={car.powerHp ? `${car.powerHp} hp` : null}
            />
            <Spec
              label="Weight"
              value={car.weightKg ? `${car.weightKg} kg` : null}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Entries · {car.teams.length}</CardTitle>
          <CardDescription>Teams running this model this season</CardDescription>
        </CardHeader>
        <CardContent>
          {car.teams.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No teams running this model in the selected season.
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

function Spec({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-lg font-semibold tabular-nums">
        {value ?? "—"}
      </dd>
    </div>
  );
}

function CarImage({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      <span className="flex h-32 w-48 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white sm:h-40 sm:w-64">
        <img
          src={src}
          alt={alt}
          className="size-full object-contain p-2"
          loading="eager"
        />
      </span>
    );
  }
  return (
    <span
      aria-label={alt}
      className="flex h-32 w-48 shrink-0 items-center justify-center rounded-lg bg-secondary/40 text-xs uppercase tracking-wider text-muted-foreground sm:h-40 sm:w-64"
    >
      No image yet
    </span>
  );
}
