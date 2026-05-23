import type { ReactNode } from "react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ClassBadge } from "@/components/class-badge";
import { PageHeader } from "@/components/page-header";
import {
  JsonLd,
  breadcrumbSchema,
  buildSiteUrl,
  faqSchema,
} from "@/lib/json-ld";

export const metadata: Metadata = {
  title: "Rules",
  description:
    "FIA WEC technical regulations explained — Hypercar (LMH + LMDh) and LMGT3 class rules, performance envelope (1030 kg, 500 kW, ≥ 190 km/h ERS deploy), Balance of Performance, success handicap, qualifying / Hyperpole format, points scoring (standard 25-18-15… vs. endurance 38-27-23… for Le Mans), and race-length calendar.",
  alternates: { canonical: "/rules" },
};

export default async function RulesPage() {
  const t = await getTranslations("rules");

  // FAQPage schema — each card on the page is a question/answer pair.
  // Strings are pulled from translations so the markup tracks any copy
  // edits; Google's FAQ rich result is locale-aware so emitting the
  // current locale's text is fine.
  const faqItems = [
    { question: t("hypercarTitle"), answer: t("hypercarDesc") },
    { question: t("lmgt3Title"), answer: t("lmgt3Desc") },
    { question: t("envelopeTitle"), answer: t("envelopeDesc") },
    { question: t("bopTitle"), answer: `${t("bopDesc")} ${t("bopBody1")}` },
    {
      question: t("successTitle"),
      answer: `${t("successDesc")} ${t("successBody1")}`,
    },
    { question: t("pointsTitle"), answer: `${t("pointsDesc")} ${t("pointsFootnote")}` },
    {
      question: t("qualifyingTitle"),
      answer: `${t("qualifyingDesc")} ${t("qualifyingFootnote")}`,
    },
    { question: t("calendarTitle"), answer: t("calendarDesc") },
    { question: t("lifecycleTitle"), answer: t("lifecycleDesc") },
  ];

  const schemas = [
    faqSchema(faqItems),
    breadcrumbSchema([
      { name: "Home", url: buildSiteUrl("/") },
      { name: "Rules", url: buildSiteUrl("/rules") },
    ]),
  ];

  return (
    <div className="space-y-6">
      <JsonLd schema={schemas} />
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <Card>
        <CardHeader>
          <CardTitle>{t("classesTitle")}</CardTitle>
          <CardDescription>{t("classesDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ClassPanel
            badge={<ClassBadge raceClass="HYPERCAR" />}
            title={t("hypercarTitle")}
            description={t("hypercarDesc")}
            items={[
              { label: t("lmhLabel"), detail: t("lmhDetail") },
              { label: t("lmdhLabel"), detail: t("lmdhDetail") },
            ]}
          />
          <ClassPanel
            badge={<ClassBadge raceClass="LMGT3" />}
            title={t("lmgt3Title")}
            description={t("lmgt3Desc")}
            items={[
              {
                label: t("driverLineupLabel"),
                detail: t("driverLineupDetail"),
              },
              { label: t("tiresLabel"), detail: t("tiresDetail") },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("envelopeTitle")}</CardTitle>
          <CardDescription>{t("envelopeDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Spec
              label={t("specMinWeight")}
              value="1030 kg"
              detail={t("specMinWeightDetail")}
            />
            <Spec
              label={t("specMaxPower")}
              value="500 kW"
              detail={t("specMaxPowerDetail")}
            />
            <Spec
              label={t("specFrontErs")}
              value="≥ 190 km/h"
              detail={t("specFrontErsDetail")}
            />
            <Spec
              label={t("specIceDisp")}
              value="—"
              detail={t("specIceDispDetail")}
            />
            <Spec
              label={t("specAero")}
              value={t("specAeroValue")}
              detail={t("specAeroDetail")}
            />
            <Spec
              label={t("specErsMandate")}
              value={t("specErsMandateValue")}
              detail={t("specErsMandateDetail")}
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("bopTitle")}</CardTitle>
          <CardDescription>{t("bopDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{t("bopBody1")}</p>
          <p>
            <span className="font-medium text-foreground">
              {t("bopBody2Bold")}
            </span>{" "}
            {t("bopBody2")}
          </p>
          <p>
            <a
              href="https://www.motorsport.com/wec/news/wec-will-stop-publishing-bop-data-2026/10813085/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-2 hover:text-[var(--racing-red)] hover:underline"
            >
              Motorsport.com
            </a>
            {" · "}
            <a
              href="https://sportscar365.com/lemans/wec/fia-confirms-minor-change-to-hypercar-bop-process-from-spa/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground underline-offset-2 hover:text-[var(--racing-red)] hover:underline"
            >
              Sportscar365
            </a>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("successTitle")}</CardTitle>
          <CardDescription>{t("successDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>{t("successBody1")}</p>
          <p>
            <span className="font-medium text-foreground">
              {t("successBody2Bold")}
            </span>{" "}
            {t("successBody2")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("pointsTitle")}</CardTitle>
          <CardDescription>{t("pointsDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4 text-left">{t("pointsColLength")}</th>
                  <th className="px-2 text-right">P1</th>
                  <th className="px-2 text-right">P2</th>
                  <th className="px-2 text-right">P3</th>
                  <th className="px-2 text-right">P4</th>
                  <th className="px-2 text-right">P5</th>
                  <th className="px-2 text-right">P6</th>
                  <th className="px-2 text-right">P7</th>
                  <th className="px-2 text-right">P8</th>
                  <th className="px-2 text-right">P9</th>
                  <th className="pl-2 text-right">P10</th>
                </tr>
              </thead>
              <tbody className="font-mono tabular-nums">
                <tr className="border-b">
                  <td className="py-2 pr-4 font-sans text-foreground">
                    {t("pointsRowStandard")}
                  </td>
                  <td className="px-2 text-right">25</td>
                  <td className="px-2 text-right">18</td>
                  <td className="px-2 text-right">15</td>
                  <td className="px-2 text-right">12</td>
                  <td className="px-2 text-right">10</td>
                  <td className="px-2 text-right">8</td>
                  <td className="px-2 text-right">6</td>
                  <td className="px-2 text-right">4</td>
                  <td className="px-2 text-right">2</td>
                  <td className="pl-2 text-right">1</td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-sans text-foreground">
                    {t("pointsRowEndurance")}
                  </td>
                  <td className="px-2 text-right font-semibold">38</td>
                  <td className="px-2 text-right">27</td>
                  <td className="px-2 text-right">23</td>
                  <td className="px-2 text-right">18</td>
                  <td className="px-2 text-right">15</td>
                  <td className="px-2 text-right">12</td>
                  <td className="px-2 text-right">9</td>
                  <td className="px-2 text-right">6</td>
                  <td className="px-2 text-right">3</td>
                  <td className="pl-2 text-right">2</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("pointsFootnote")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("qualifyingTitle")}</CardTitle>
          <CardDescription>{t("qualifyingDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li>
              <span className="font-medium text-foreground">
                {t("qualifyingStage1Label")}
              </span>{" "}
              — {t("qualifyingStage1")}
            </li>
            <li>
              <span className="font-medium text-foreground">
                {t("qualifyingStage2Label")}
              </span>{" "}
              — {t("qualifyingStage2")}
            </li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("qualifyingFootnote")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("calendarTitle")}</CardTitle>
          <CardDescription>{t("calendarDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("calendarLeMans")}</span>
              <span className="font-mono text-foreground">24 h</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                {t("calendarBahrain")}
              </span>
              <span className="font-mono text-foreground">8 h</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("calendarQatar")}</span>
              <span className="font-mono text-foreground">≈ 10 h</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">{t("calendarOthers")}</span>
              <span className="font-mono text-foreground">6 h</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("lifecycleTitle")}</CardTitle>
          <CardDescription>{t("lifecycleDesc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            {t("lifecycleBodyPre")}
            <span className="font-medium text-foreground">
              {t("lifecycleBodyMid")}
            </span>
            {t("lifecycleBodyPost")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function Spec({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-lg font-semibold tabular-nums">{value}</dd>
      {detail && (
        <span className="mt-0.5 text-xs text-muted-foreground">{detail}</span>
      )}
    </div>
  );
}

function ClassPanel({
  badge,
  title,
  description,
  items,
}: {
  badge: ReactNode;
  title: string;
  description: string;
  items: { label: string; detail: string }[];
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-4 space-y-3">
      <div className="flex items-center gap-2">
        {badge}
        <span className="font-heading text-base font-semibold uppercase">
          {title}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      <dl className="space-y-2 text-sm">
        {items.map((item) => (
          <div key={item.label}>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {item.label}
            </dt>
            <dd className="text-foreground">{item.detail}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
