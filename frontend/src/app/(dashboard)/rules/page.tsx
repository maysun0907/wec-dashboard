import type { ReactNode } from "react";
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

export const metadata = { title: "Rules" };

export default async function RulesPage() {
  const t = await getTranslations("rules");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
      />

      <Card>
        <CardHeader>
          <CardTitle>Classes</CardTitle>
          <CardDescription>
            Two classes share the 2026 grid. LMP2 left WEC after 2024.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <ClassPanel
            badge={<ClassBadge raceClass="HYPERCAR" />}
            title="Hypercar"
            description="Top class. Two homologation paths competing under one BoP umbrella."
            items={[
              {
                label: "LMH",
                detail:
                  "Le Mans Hypercar — bespoke chassis + bespoke ICE. Ferrari 499P, Toyota TR010, Peugeot 9X8, Aston Martin Valkyrie.",
              },
              {
                label: "LMDh",
                detail:
                  "Le Mans Daytona h — manufacturer's ICE on a spec chassis (Multimatic / Oreca / Ligier / Dallara) and spec Bosch hybrid kit. Cadillac, BMW, Alpine, Genesis.",
              },
            ]}
          />
          <ClassPanel
            badge={<ClassBadge raceClass="LMGT3" />}
            title="LMGT3"
            description="Built on the Group GT3 platform. Two-class WEC since 2024 (replaced LMGTE)."
            items={[
              {
                label: "Driver lineup",
                detail:
                  "Pro / Am rules — at least one Bronze or Silver driver per car, varying by season.",
              },
              {
                label: "Tires",
                detail:
                  "Single supplier (Goodyear) — same compounds as LMP2 to neutralize tire as a performance variable.",
              },
            ]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hypercar regulation envelope</CardTitle>
          <CardDescription>
            Every Hypercar entry is homologated to fit inside this box.
            BoP slides individual cars within it, but the floor / ceiling
            are fixed.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <Spec
              label="Min weight"
              value="1030 kg"
              detail="LMH and LMDh share the floor"
            />
            <Spec
              label="Max combined power"
              value="500 kW"
              detail="≈ 670 hp (ICE + ERS)"
            />
            <Spec
              label="Front-axle ERS"
              value="≥ 190 km/h"
              detail="Hybrid only deploys above this speed"
            />
            <Spec
              label="ICE displacement"
              value="—"
              detail="Open. 2.6 L V6 (Peugeot) to 6.5 L V12 (Aston) on the grid."
            />
            <Spec
              label="Aero"
              value="Single map"
              detail="One configuration per car after homologation; no track-specific bodywork."
            />
            <Spec
              label="ERS mandate"
              value="From 2026"
              detail="Required for any newly homologated car going forward."
            />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Balance of Performance</CardTitle>
          <CardDescription>
            How the FIA equalizes a Toyota TR010 against an Aston Martin
            Valkyrie despite very different drivetrains.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            BoP is set in two phases. Pre-season: cars are simulated and
            wind-tunnel-tested at Windshear with a target performance
            window. Per-round: weight, max-power, and energy-per-stint
            adjustments are applied based on the most recent races.
          </p>
          <p>
            <span className="font-medium text-foreground">
              From 2026 the FIA stopped publishing the per-round table.
            </span>{" "}
            Numbers are now shared only with the competing teams — the
            stated rationale is that BoP figures without the underlying
            homologation data lead to outside misinterpretation. There is
            no public source for the actual settings.
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
          <CardTitle>Success handicap (new for 2026)</CardTitle>
          <CardDescription>
            A results-based mass penalty for top runners — already used
            in LMGT3 since 2024, expanded to Hypercar this year.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Cars carrying championship form into a round are weighted up;
            the lower-scoring rivals stay at base weight. The handicap is
            absorbed into the same private BoP table, so the per-car
            split isn&rsquo;t public.
          </p>
          <p>
            <span className="font-medium text-foreground">Le Mans is exempt.
            </span>{" "}
            Endurance week stands on its own — handicap is paused so the
            crown jewel of the calendar isn&rsquo;t decided by mid-season
            standings.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Points</CardTitle>
          <CardDescription>
            Two tables based on race length. Top ten finishers in class
            score; pole position adds one driver point.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b text-xs font-semibold uppercase tracking-widest text-muted-foreground">
                  <th className="py-2 pr-4 text-left">Race length</th>
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
                    Standard 6 h
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
                    Endurance (24 h, 8 h, 1812 km)
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
            Endurance table applies at the 24 Hours of Le Mans, 8 Hours
            of Bahrain, and the Qatar 1812 km. Pole position adds +1 to
            every driver of the pole-sitting car.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Qualifying</CardTitle>
          <CardDescription>
            Two-stage Hyperpole format since 2022. LMGT3 runs a separate
            Hyperpole on the same day.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="space-y-3 text-sm">
            <li>
              <span className="font-medium text-foreground">
                Stage 1 · Qualifying
              </span>{" "}
              — open to all cars in the class. Top times on the board
              determine who advances.
            </li>
            <li>
              <span className="font-medium text-foreground">
                Stage 2 · Hyperpole
              </span>{" "}
              — top 10 (Hypercar) and top 8 (LMGT3) advance for a fresh
              shootout. Pole sitter takes the championship-points bonus
              and the right side of the grid.
            </li>
          </ol>
          <p className="mt-3 text-sm text-muted-foreground">
            Cars that don&rsquo;t advance start in their stage-1 order
            behind the Hyperpole field.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Calendar shape</CardTitle>
          <CardDescription>
            Eight rounds across four continents. Three are endurance
            specials.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">24 Hours of Le Mans</span>
              <span className="font-mono text-foreground">24 h</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                Bapco Energies 8 Hours of Bahrain
              </span>
              <span className="font-mono text-foreground">8 h</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">Qatar 1812 km</span>
              <span className="font-mono text-foreground">≈ 10 h</span>
            </li>
            <li className="flex justify-between gap-3">
              <span className="text-muted-foreground">
                Imola, Spa, São Paulo, COTA, Fuji
              </span>
              <span className="font-mono text-foreground">6 h</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Regulation lifecycle</CardTitle>
          <CardDescription>
            How long the current rule set is locked in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The LMH and LMDh frameworks were originally written through
            2027 / 2028. In 2024 the FIA, ACO, and IMSA jointly extended
            both regulation sets through{" "}
            <span className="font-medium text-foreground">2032</span> —
            twelve years for LMH, ten for LMDh — to give manufacturers a
            stable runway and avoid a repeat of the late-2010s LMP1
            collapse. There has been informal talk of a single converged
            platform for the next cycle, but nothing committed.
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
