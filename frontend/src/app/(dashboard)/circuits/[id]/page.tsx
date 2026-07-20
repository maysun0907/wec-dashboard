import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { format, parseISO } from "date-fns";
import { getLocale, getTranslations } from "next-intl/server";
import { localizeCircuitName, localizeEventName } from "@/lib/locale-names";
import { isLocale } from "@/i18n/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassBadge } from "@/components/class-badge";
import { TeamLink } from "@/components/entity-link";
import { Flag } from "@/components/flag";
import { PublicLink } from "@/components/public-link";
import {
  getCircuit,
  getCircuits,
  isApiNotFound,
  type Circuit,
  type CircuitDetail,
} from "@/lib/api";
import { localCircuitLayout } from "@/lib/circuit-image";
import {
  JsonLd,
  breadcrumbSchema,
  buildSiteUrl,
  placeSchema,
} from "@/lib/json-ld";
import { pageMetadataUrls } from "@/lib/page-metadata";

type Params = { id: string };

async function fetchCircuit(id: string): Promise<CircuitDetail | null> {
  const numId = Number(id);
  if (!Number.isFinite(numId)) return null;
  try {
    return await getCircuit(numId);
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
  const { id } = await params;
  const rawLocale = await getLocale();
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const metadataYear = new Date().getUTCFullYear();
  const path = `/circuits/${id}` as const;
  const urls = pageMetadataUrls({ path, locale, year: metadataYear });
  const circuit = await fetchCircuit(id);
  if (!circuit) {
    return {
      title: "Circuit",
      alternates: { canonical: urls.canonical, languages: urls.languages },
      openGraph: { url: urls.canonical, type: "article" },
    };
  }
  const c = {
    ...circuit,
    name: localizeCircuitName(circuit.name, locale),
  };
  const lengthPart = c.lengthKm ? `${c.lengthKm.toFixed(3)} km` : null;
  const lapPart = c.lapRecord
    ? locale === "ko"
      ? `랩 레코드 ${c.lapRecord}`
      : `lap record ${c.lapRecord}`
    : null;
  const hostedSince = c.events.length > 0
    ? Math.min(...c.events.map((e) => e.seasonYear))
    : null;
  const hostedPart = hostedSince
    ? locale === "ko"
      ? `${hostedSince}년부터 WEC ${c.events.length}회 개최`
      : `hosted ${c.events.length} WEC race${c.events.length === 1 ? "" : "s"} since ${hostedSince}`
    : null;
  const facts = [c.country, lengthPart, lapPart, hostedPart]
    .filter(Boolean)
    .join(" · ");
  const desc =
    locale === "ko"
      ? `${c.name}${facts ? ` — ${facts}` : ""}. 이 서킷의 FIA WEC 트랙 레이아웃, 랩 레코드, 클래스별 우승 기록과 역대 레이스 결과를 확인하세요.`
      : `${c.name}${facts ? ` — ${facts}` : ""}. FIA WEC track layout, lap record, class winners and full race-by-race history at this circuit.`;
  return {
    title: c.name,
    description: desc,
    alternates: {
      canonical: urls.canonical,
      languages: urls.languages,
    },
    openGraph: {
      title: `${c.name} · WEC Dashboard`,
      description: desc,
      url: urls.canonical,
      type: "article",
      locale: locale === "ko" ? "ko_KR" : "en_US",
      alternateLocale: [locale === "ko" ? "en_US" : "ko_KR"],
    },
    twitter: {
      card: "summary",
      title: c.name,
      description: desc,
    },
  };
}

export default async function CircuitDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { id } = await params;
  const circuitRaw = await fetchCircuit(id);
  if (circuitRaw === null) notFound();

  const rawLocale = await getLocale();
  const localeForName = isLocale(rawLocale) ? rawLocale : "en";
  const circuit = {
    ...circuitRaw,
    name: localizeCircuitName(circuitRaw.name, localeForName),
    events: circuitRaw.events.map((e) => ({
      ...e,
      name: localizeEventName(e.name, localeForName),
    })),
  };

  const layoutSvg = localCircuitLayout(circuit.country) ?? circuit.layoutImage;
  const t = await getTranslations("circuits");
  const schemaContext = {
    locale: localeForName,
    year: new Date().getUTCFullYear(),
  } as const;

  // "Other circuits" — pick up to 4 tracks deterministically from the
  // circuits list. Start one slot after the current id (rotation) so
  // every circuit page surfaces a different sample but stays stable
  // across renders / cache hits.
  let relatedCircuits: Circuit[] = [];
  try {
    const all = await getCircuits();
    const others = all.filter((c) => c.id !== circuit.id);
    if (others.length > 0) {
      const start =
        ((circuit.id % others.length) + others.length) % others.length;
      const picks: Circuit[] = [];
      for (let i = 0; i < others.length && picks.length < 4; i++) {
        picks.push(others[(start + i) % others.length]!);
      }
      relatedCircuits = picks.map((c) => ({
        ...c,
        name: localizeCircuitName(c.name, localeForName),
      }));
    }
  } catch {
    relatedCircuits = [];
  }

  const schemas = [
    placeSchema(circuit, schemaContext),
    breadcrumbSchema([
      {
        name: localeForName === "ko" ? "홈" : "Home",
        url: buildSiteUrl("/", schemaContext),
      },
      {
        name: localeForName === "ko" ? "서킷" : "Circuits",
        url: buildSiteUrl("/circuits", schemaContext),
      },
      {
        name: circuit.name,
        url: buildSiteUrl(`/circuits/${circuit.id}`, schemaContext),
      },
    ]),
  ];

  return (
    <div className="space-y-6">
      <JsonLd schema={schemas} />
      <PublicLink
        href="/circuits"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        ← {t("title")}
      </PublicLink>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl sm:text-3xl">
            <Flag code={circuit.country} flagOnly className="text-2xl" />
            {circuit.name}
          </CardTitle>
          <CardDescription>
            <Flag code={circuit.country} />
          </CardDescription>
        </CardHeader>
        {layoutSvg && (
          <CardContent className="border-t border-border">
            {/* Wikimedia track maps are mostly black-line on white, so
                they vanish on our dark page bg. The classic dark-mode
                trick — invert + hue-rotate(180°) — turns the line
                white while preserving any sector colors that happen
                to be drawn (e.g. Fuji, Spa).

                Le Mans is the one portrait-aspect circuit (Mulsanne
                runs ~13 km south); rotating it shifted the labels
                sideways too, so instead we give it a taller container
                and let it sit at its natural orientation. */}
            <div
              className={
                "flex items-center justify-center bg-secondary/20 px-4 py-4 " +
                (circuit.country === "FRA"
                  ? "h-[36rem] sm:h-[44rem]"
                  : "h-[28rem] sm:h-[34rem]")
              }
            >
              {/* Static SVG served from /public — next/image would
                  needlessly route it through the optimizer. The raw
                  <img> tag is intentional. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={layoutSvg}
                alt={`${circuit.name} track layout`}
                className="h-full w-full object-contain"
                style={{
                  filter: "invert(1) hue-rotate(180deg)",
                }}
                loading="lazy"
              />
            </div>
          </CardContent>
        )}
        <CardContent>
          <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            {circuit.lengthKm > 0 && (
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("length")}
                </dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">
                  {circuit.lengthKm.toFixed(3)} km
                </dd>
              </div>
            )}
            {circuit.lapRecord && (
              <div className="flex flex-col">
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {t("lapRecord")}
                </dt>
                <dd className="font-mono text-lg font-semibold tabular-nums">
                  {circuit.lapRecord}
                </dd>
              </div>
            )}
            <div className="flex flex-col">
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                {t("timesHosted")}
              </dt>
              <dd className="font-mono text-lg font-semibold tabular-nums">
                {circuit.events.length}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("wecRaceHistory")}</CardTitle>
          <CardDescription>
            {circuit.events.length === 0
              ? t("noEvents")
              : t("historySubtitle")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {circuit.events.map((e) => (
            <div
              key={e.eventId}
              className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4 last:border-0 last:pb-0"
            >
              <div className="space-y-1">
                <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">
                    {e.seasonYear} · R{e.round}
                  </span>
                  <span>·</span>
                  <span>{format(parseISO(e.dateStart), "MMM d, yyyy")}</span>
                </div>
                <PublicLink
                  href={`/races/${e.eventId}`}
                  className="font-medium hover:text-[var(--racing-red)]"
                >
                  {e.name}
                </PublicLink>
              </div>
              {e.winners.length > 0 && (
                <div className="space-y-1 text-right text-sm">
                  {e.winners.map((w) => (
                    <div
                      key={w.raceClass}
                      className="flex items-center justify-end gap-2"
                    >
                      <span className="text-muted-foreground">
                        #{w.carNumber}{" "}
                        <TeamLink id={w.teamId}>{w.team}</TeamLink>
                      </span>
                      <ClassBadge raceClass={w.raceClass} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      {relatedCircuits.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("relatedTitle")}</CardTitle>
            <CardDescription>{t("relatedSubtitle")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 sm:grid-cols-2">
              {relatedCircuits.map((r) => (
                <li key={r.id}>
                  <PublicLink
                    href={`/circuits/${r.id}`}
                    className="flex items-center gap-3 rounded-md border border-border/60 bg-secondary/20 px-3 py-2 text-sm transition-colors hover:bg-secondary/40"
                  >
                    <Flag code={r.country} flagOnly />
                    <span className="min-w-0 flex-1 truncate font-medium">
                      {r.name}
                    </span>
                    {r.lengthKm > 0 && (
                      <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
                        {r.lengthKm.toFixed(3)} km
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
