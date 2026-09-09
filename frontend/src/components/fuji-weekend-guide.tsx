import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicLink } from "@/components/public-link";
import { getManufacturerStandings, type Session } from "@/lib/api";
import { fujiSessionTime } from "@/lib/fuji-guide";
import type { Locale } from "@/i18n/config";
import { getTranslations } from "next-intl/server";

const official = "https://www.fiawec.com/en/race/6-hours-of-fuji-2026";

export async function FujiWeekendGuide({ sessions, locale, completed }: {
  sessions: Session[]; locale: Locale; completed: boolean;
}) {
  const t = await getTranslations({ locale });
  const labels: Record<string, string> = {
    FP1: t("live.sessionLabelFP1"), FP2: t("live.sessionLabelFP2"),
    FP3: t("live.sessionLabelFP3"), Q: t("fuji.qualifying"), RACE: t("live.sessionLabelRACE"),
  };
  const raceTime = fujiSessionTime(sessions.find((s) => s.type === "RACE")?.startTime ?? null, locale);
  // One shared cached request across languages; never use today's standings as historical context.
  const contenders = completed ? [] : await getManufacturerStandings("HYPERCAR", 2026, { revalidate: 3600 })
    .then((rows) => rows.filter((r) => r.position > 0).sort((a, b) => a.position - b.position).slice(0, 3))
    .catch(() => []);

  return (
    <section aria-label={t("fuji.title")} className="space-y-4">
      <Card>
        <CardHeader><CardTitle as="h2">{t("fuji.title")}</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm leading-relaxed">
          <p>{t("fuji.intro")} {raceTime ? t("fuji.raceStart", { time: raceTime }) : t("live.timeNotYet")}</p>
          <dl className="divide-y divide-border">
            {Object.entries(labels).map(([type, label]) => {
              const time = fujiSessionTime(sessions.find((s) => s.type === type)?.startTime ?? null, locale);
              return <div key={type} className="flex flex-wrap justify-between gap-x-4 gap-y-1 py-2">
                <dt className="font-medium">{label}</dt>
                <dd className="tabular-nums text-muted-foreground">{time ? `${time} ${locale === "ko" ? "KST" : "JST"}` : t("live.timeNotYet")}</dd>
              </div>;
            })}
          </dl>
          <p className="text-muted-foreground">{t("fuji.note")}</p>
          <a href={official} className="underline underline-offset-4">{t("fuji.official")}</a>
        </CardContent>
      </Card>
      <div className="grid items-start gap-4 md:grid-cols-2">
        <Card>
          <CardHeader><CardTitle as="h2">{t("fuji.watch")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>{t("fuji.watchBody")}</p>
            <p className="text-muted-foreground">{t("fuji.rights")}</p>
            <div className="flex flex-wrap gap-4">
              <a href="https://www.fiawec.com/en/page/ou-regarder-1" className="underline underline-offset-4">{t("fuji.broadcasters")}</a>
              <a href="https://plus.fiawec.com/en" className="underline underline-offset-4">FIAWEC+</a>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle as="h2">{t("fuji.teams")}</CardTitle></CardHeader>
          <CardContent className="space-y-3 text-sm leading-relaxed">
            <p>{t("fuji.teamsBody")}</p>
            {contenders.length > 0 && <div>
              <p className="text-muted-foreground">{t("fuji.leaders")}</p>
              <ul className="mt-2 space-y-1">{contenders.map((r) => <li key={r.manufacturerId} className="flex flex-wrap justify-between gap-2">
                <span>P{r.position} · {r.manufacturerName}</span><span>{t("standings.snapshotPoints", { points: r.points })}</span>
              </li>)}</ul>
            </div>}
            <div className="flex flex-wrap gap-4">
              <PublicLink href="/teams" seasonYear={2026} className="underline underline-offset-4">2026 · {t("teams.title")}</PublicLink>
              <PublicLink href="/standings" seasonYear={2026} className="underline underline-offset-4">{t("common.fullStandings")}</PublicLink>
            </div>
            <p className="text-muted-foreground">{t("fuji.results")}</p>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
