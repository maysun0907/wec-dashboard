import Link from "next/link";
import { format, parseISO } from "date-fns";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeCircuit, localizeEvent } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Flag } from "@/components/flag";
import { PageHeader } from "@/components/page-header";
import {
  eventStatus,
  getCircuits,
  getEvents,
  type EventStatus,
} from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata = pageMetadata({ title: "Circuits", path: "/circuits" });

export default async function CircuitsPage() {
  const year = await getSelectedSeason();
  const [circuitsRaw, eventsRaw] = await Promise.all([
    getCircuits(year),
    getEvents(year).catch(() => []),
  ]);
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const circuits = circuitsRaw.map((c) => localizeCircuit(c, locale));
  const events = eventsRaw.map((e) => localizeEvent(e, locale));
  // One round per circuit per season — index for O(1) card lookups.
  const roundByCircuit = new Map(events.map((e) => [e.circuit.id, e]));
  const today = new Date();
  const t = await getTranslations("circuits");

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description", { count: circuits.length })}
      />

      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
        {circuits.map((c) => {
          const ev = roundByCircuit.get(c.id);
          const status: EventStatus | null = ev ? eventStatus(ev, today) : null;
          return (
            <Link
              key={c.id}
              href={`/circuits/${c.id}`}
              className="group block [&_[data-slot=card]]:transition-all [&_[data-slot=card]]:duration-200 hover:[&_[data-slot=card]]:-translate-y-0.5 hover:[&_[data-slot=card]]:ring-foreground/30"
            >
              <Card>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1 space-y-1">
                      <CardTitle className="truncate">{c.name}</CardTitle>
                      <CardDescription>
                        <Flag code={c.country} />
                      </CardDescription>
                    </div>
                    {ev && (
                      <span
                        className={
                          "shrink-0 rounded-md border px-2 py-1 text-center font-heading text-xs font-bold uppercase tracking-wider " +
                          (status === "live"
                            ? "border-[var(--racing-red)]/60 bg-[var(--racing-red)]/10 text-[var(--racing-red)]"
                            : status === "completed"
                            ? "border-border/60 bg-secondary/40 text-muted-foreground"
                            : "border-border bg-secondary/40 text-foreground")
                        }
                      >
                        R{ev.round}
                      </span>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <dl className="grid grid-cols-2 gap-x-2 gap-y-2 text-sm">
                    {c.lengthKm > 0 && (
                      <>
                        <dt className="text-muted-foreground">{t("length")}</dt>
                        <dd className="text-right font-mono tabular-nums">
                          {c.lengthKm.toFixed(3)} km
                        </dd>
                      </>
                    )}
                    {c.lapRecord && (
                      <>
                        <dt className="text-muted-foreground">{t("lapRecord")}</dt>
                        <dd className="text-right font-mono tabular-nums">
                          {c.lapRecord}
                        </dd>
                      </>
                    )}
                    {ev && (
                      <>
                        <dt className="text-muted-foreground">{t("raceDay")}</dt>
                        <dd className="text-right font-mono tabular-nums">
                          {format(parseISO(ev.dateStart), "MMM d, yyyy")}
                        </dd>
                      </>
                    )}
                  </dl>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
