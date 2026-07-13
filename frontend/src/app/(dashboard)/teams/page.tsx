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
import { PublicLink } from "@/components/public-link";
import {
  RACE_CLASSES,
  getTeams,
  raceClassLabel,
  type RaceClass,
  type TeamEntry,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";

export const generateMetadata = () =>
  dashboardPageMetadata("teams", "/teams");

type TeamCardEntry = {
  id: number;
  name: string;
  raceClass: RaceClass;
  manufacturer: string | null;
  manufacturerLogoUrl: string | null;
  carNumbers: string[];
};

function groupByTeam(teams: TeamEntry[]): TeamCardEntry[] {
  const map = new Map<string, TeamCardEntry>();
  for (const t of teams) {
    const key = `${t.raceClass}::${t.id}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        id: t.id,
        name: t.name,
        raceClass: t.raceClass,
        manufacturer: t.manufacturer,
        manufacturerLogoUrl: t.manufacturerLogoUrl,
        carNumbers: [],
      };
      map.set(key, entry);
    }
    entry.carNumbers.push(t.carNumber);
  }
  for (const e of map.values()) {
    e.carNumbers.sort((a, b) => Number(a) - Number(b));
  }
  return Array.from(map.values());
}

export default async function TeamsPage() {
  const year = await getSelectedSeason();
  const teams = await getTeams(year);
  const all = groupByTeam(teams);
  const present = RACE_CLASSES.filter((c) => all.some((t) => t.raceClass === c));
  const t = await getTranslations("teams");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow", { year: year ?? 2026 })}
        title={t("title")}
        description={t("description", { teamCount: all.length, carCount: teams.length })}
      />

      <Tabs defaultValue={present[0] ?? "HYPERCAR"}>
        <TabsList>
          {present.map((c) => (
            <TabsTrigger key={c} value={c}>
              {raceClassLabel(c)} · {all.filter((t) => t.raceClass === c).length}
            </TabsTrigger>
          ))}
        </TabsList>
        {present.map((c) => {
          const inClass = all
            .filter((t) => t.raceClass === c)
            .sort((a, b) => a.name.localeCompare(b.name));
          return (
            <TabsContent key={c} value={c} className="mt-4">
              {inClass.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noTeamsInClass")}
                </p>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {inClass.map((t) => (
                    <PublicLink
                      key={`${t.raceClass}-${t.id}`}
                      href={`/teams/${t.id}`}
                      className="group block [&_[data-slot=card]]:transition-all [&_[data-slot=card]]:duration-200 hover:[&_[data-slot=card]]:-translate-y-0.5 hover:[&_[data-slot=card]]:border-[var(--racing-red)]/65"
                    >
                      <TeamCard entry={t} />
                    </PublicLink>
                  ))}
                </div>
              )}
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

function TeamCard({ entry }: { entry: TeamCardEntry }) {
  const t = useTranslations("teams");
  return (
    <Card>
      <CardHeader className="flex flex-row items-center gap-3 space-y-0">
        <ManufacturerLogo
          src={entry.manufacturerLogoUrl}
          name={entry.manufacturer ?? entry.name}
          size="xl"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <CardTitle className="truncate">{entry.name}</CardTitle>
          <CardDescription>
            {entry.manufacturer ?? t("independent")}
          </CardDescription>
        </div>
        <ClassBadge raceClass={entry.raceClass} />
      </CardHeader>
      <CardContent>
        <p className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">
          {t("entriesCount", { count: entry.carNumbers.length })}
        </p>
        <ul className="flex flex-wrap gap-2 text-sm">
          {entry.carNumbers.map((n) => (
            <li
              key={n}
              className="rounded-sm border border-border/75 bg-black/20 px-2 py-1 font-mono tabular-nums"
            >
              #{n}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
