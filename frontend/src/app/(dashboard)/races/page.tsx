import { format, parseISO } from "date-fns";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeEvent } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
import {
  Card,
  CardContent,
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
import { Badge } from "@/components/ui/badge";
import { Flag } from "@/components/flag";
import { PageHeader } from "@/components/page-header";
import { PublicLink } from "@/components/public-link";
import { eventStatus, getEvents, type EventStatus } from "@/lib/api";
import { getSelectedSeason } from "@/lib/season";
import { dashboardPageMetadata } from "@/lib/dashboard-metadata";

export const generateMetadata = () =>
  dashboardPageMetadata("races", "/races");

const STATUS_VARIANT: Record<
  EventStatus,
  "outline" | "default" | "destructive"
> = {
  completed: "outline",
  upcoming: "default",
  live: "destructive",
};

export default async function RacesPage() {
  const year = await getSelectedSeason();
  const eventsRaw = await getEvents(year);
  const today = new Date();
  const t = await getTranslations("races");
  const tStatus = await getTranslations("eventStatus");
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const events = eventsRaw.map((e) => localizeEvent(e, locale));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description", {
          year: year ?? 2026,
          count: events.length,
        })}
      />

      {events.length > 0 && (
        <section className="overflow-hidden rounded-md border border-border/85 bg-card/80">
          <div className="flex items-center justify-between border-b border-border/65 px-4 py-3">
            <span className="data-kicker">{t("allRounds")}</span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {events.length} ROUNDS
            </span>
          </div>
          <div className="overflow-x-auto px-4 py-4 no-scrollbar">
            <ol className="flex min-w-max">
              {events.map((event, index) => {
                const status = eventStatus(event, today);
                const markerTone =
                  status === "live"
                    ? "border-[var(--racing-red)] bg-[var(--racing-red)] shadow-[0_0_0_3px_color-mix(in_oklab,var(--racing-red)_18%,transparent)]"
                    : status === "completed"
                      ? "border-foreground/70 bg-foreground"
                      : "border-muted-foreground bg-background";
                return (
                  <li
                    key={event.id}
                    className="relative w-28 shrink-0 pr-3 last:pr-0 sm:w-36"
                  >
                    {index < events.length - 1 && (
                      <span className="absolute top-[5px] left-3 right-0 h-px bg-border" />
                    )}
                    <PublicLink
                      href={`/races/${event.id}`}
                      className="group relative block space-y-2"
                    >
                      <span className={`block size-3 rounded-full border-2 ${markerTone}`} />
                      <span className="block text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        R{event.round}
                      </span>
                      <span className="block truncate text-xs font-semibold group-hover:text-[var(--racing-red)]">
                        {event.circuit.name}
                      </span>
                      <span className="block text-[10px] text-muted-foreground">
                        {format(parseISO(event.dateStart), "MMM d")}
                      </span>
                    </PublicLink>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("allRounds")}</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14 pl-4">{t("round")}</TableHead>
                <TableHead>{t("event")}</TableHead>
                <TableHead className="hidden md:table-cell">{t("circuit")}</TableHead>
                <TableHead>{t("date")}</TableHead>
                <TableHead className="pr-4 text-right">{t("status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((e) => {
                const status = eventStatus(e, today);
                return (
                  <TableRow key={e.id} className="cursor-pointer">
                    <TableCell className="pl-4 font-mono tabular-nums">
                      {e.round}
                    </TableCell>
                    <TableCell className="font-medium">
                      <PublicLink
                        href={`/races/${e.id}`}
                        className="hover:text-[var(--racing-red)]"
                      >
                        {e.name}
                      </PublicLink>
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground md:table-cell">
                      <span className="inline-flex items-center gap-2">
                        <Flag code={e.circuit.country} flagOnly />
                        <PublicLink
                          href={`/circuits/${e.circuit.id}`}
                          className="hover:text-foreground"
                        >
                          {e.circuit.name}
                        </PublicLink>
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {format(parseISO(e.dateStart), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="pr-4 text-right">
                      <Badge variant={STATUS_VARIANT[status]}>
                        {tStatus(status)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
