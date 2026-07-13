import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClassBadge } from "@/components/class-badge";
import { ManufacturerLogo } from "@/components/manufacturer-logo";
import { PageHeader } from "@/components/page-header";
import {
  RACE_CLASSES,
  getTeams,
  raceClassLabel,
  type RaceClass,
  type TeamEntry,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({ title: "Cars", path: "/cars" });

type CarModelEntry = {
  slug: string | null;
  model: string;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  raceClass: RaceClass;
  cars: { teamName: string; teamId: number; carNumber: string }[];
};

/** Shape teams data (one per car) into one entry per car model. */
function groupByModel(teams: TeamEntry[]): CarModelEntry[] {
  const map = new Map<string, CarModelEntry>();
  for (const t of teams) {
    const modelLabel = t.model ?? t.manufacturer ?? t.name;
    const key = `${t.raceClass}::${t.carModelSlug ?? modelLabel}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        slug: t.carModelSlug,
        model: modelLabel,
        manufacturer: t.manufacturer,
        manufacturerLogoUrl: t.manufacturerLogoUrl,
        raceClass: t.raceClass,
        cars: [],
      };
      map.set(key, entry);
    }
    entry.cars.push({
      teamName: t.name,
      teamId: t.id,
      carNumber: t.carNumber,
    });
  }
  return Array.from(map.values());
}

export default async function CarsPage() {
  const year = await getSelectedSeason();
  const teams = await getTeams(year);
  const all = groupByModel(teams);
  const t = await getTranslations("cars");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow", { year: year ?? 2026 })}
        title={t("title")}
        description={t("description", { count: all.length })}
      />

      {(() => {
        const present = RACE_CLASSES.filter(
          (c) => all.some((m) => m.raceClass === c),
        );
        return (
      <Tabs defaultValue={present[0] ?? "HYPERCAR"}>
        <TabsList>
          {present.map((c) => (
            <TabsTrigger key={c} value={c}>
              {raceClassLabel(c)} · {all.filter((m) => m.raceClass === c).length}
            </TabsTrigger>
          ))}
        </TabsList>
        {present.map((c) => {
          const models = all
            .filter((m) => m.raceClass === c)
            .sort((a, b) => a.model.localeCompare(b.model));
          return (
            <TabsContent key={c} value={c} className="mt-4">
              {models.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noCarsInClass")}
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {models.map((m) => (
                    <ModelCard
                      key={`${m.raceClass}-${m.slug ?? m.model}`}
                      entry={m}
                    />
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
        );
      })()}
    </div>
  );
}

function ModelCard({ entry }: { entry: CarModelEntry }) {
  const t = useTranslations("cars");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <ManufacturerLogo
          src={entry.manufacturerLogoUrl}
          name={entry.manufacturer ?? entry.model}
          size="xl"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="truncate">
            {entry.slug ? (
              <Link
                href={`/cars/${entry.slug}`}
                className="hover:text-[var(--racing-red)]"
              >
                {entry.model}
              </Link>
            ) : (
              entry.model
            )}
          </CardTitle>
          <CardDescription>
            {entry.manufacturer ?? t("independent")}
          </CardDescription>
        </div>
        <ClassBadge raceClass={entry.raceClass} />
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          {t("entriesCount", { count: entry.cars.length })}
        </p>
        <ul className="space-y-1 text-sm">
          {entry.cars
            .slice()
            .sort((a, b) => Number(a.carNumber) - Number(b.carNumber))
            .map((c) => (
              <li
                key={`${c.teamId}-${c.carNumber}`}
                className="flex items-center gap-2"
              >
                <span className="w-10 shrink-0 font-mono text-muted-foreground tabular-nums">
                  #{c.carNumber}
                </span>
                <Link
                  href={`/teams/${c.teamId}`}
                  className="truncate hover:text-[var(--racing-red)]"
                >
                  {c.teamName}
                </Link>
              </li>
            ))}
        </ul>
      </CardContent>
    </Card>
  );
}
