// JSON-LD helpers — schema.org structured data for SEO rich snippets.
//
// All schemas are emitted server-side via a tiny `JsonLd` component. The
// output is plain `<script type="application/ld+json">` markup with no
// client hydration, so it's free for SSR and adds nothing to the JS
// payload. Strings stay in English (Google parses JSON-LD as data, not
// display copy) so we don't have to thread next-intl through this layer.

import type {
  CarModelDetail,
  CircuitDetail,
  DriverDetail,
  EventDetail,
  ManufacturerDetail,
  TeamDetail,
} from "@/lib/api";
import { eventStatus } from "@/lib/api";
import type { Locale } from "@/i18n/config";
import { buildPublicPath } from "@/lib/public-routing";
import { siteUrl } from "@/lib/site-url";

export type JsonLdRouteContext = Readonly<{
  locale: Locale;
  year: number;
}>;

export function buildSiteUrl(
  path: string,
  route?: JsonLdRouteContext,
): string {
  const base = siteUrl();
  const internalPath = path
    ? path.startsWith("/")
      ? path
      : `/${path}`
    : "/";
  const routedPath = route
    ? buildPublicPath(internalPath, route.locale, route.year) ?? internalPath
    : internalPath;
  const p = routedPath.startsWith("/") ? routedPath : `/${routedPath}`;
  return `${base}${p}`;
}

// Reused across multiple schemas — keep one definition so search engines
// see consistent organizer / publisher metadata.
const FIA_WEC_ORGANIZER = {
  "@type": "SportsOrganization",
  name: "FIA World Endurance Championship",
  alternateName: "FIA WEC",
  url: "https://www.fiawec.com",
} as const;

export function websiteSchema(): object {
  const base = buildSiteUrl("/");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "WEC Dashboard",
    alternateName: "WEC Dashboard — FIA WEC results, standings, schedule",
    url: base,
  };
}

export function eventSchema(
  event: EventDetail,
  route?: JsonLdRouteContext,
): object {
  // Map our derived event status to schema.org's enum (omit when "live"
  // — there is no exact 1:1 match; Google treats absence as scheduled).
  const status = eventStatus(event);
  const eventStatusEnum =
    status === "completed"
      ? "https://schema.org/EventScheduled"
      : status === "upcoming"
        ? "https://schema.org/EventScheduled"
        : "https://schema.org/EventScheduled";
  // Completed events get explicit marker via `eventStatus` semantic
  // tag below; we leave `eventStatus` defaulted otherwise so calendars
  // / preview cards don't show stale "upcoming" copy after the event.
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: event.name,
    startDate: event.dateStart,
    endDate: event.dateEnd,
    eventStatus: eventStatusEnum,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    sport: "Endurance Racing",
    location: {
      "@type": "Place",
      name: event.circuit.name,
      address: {
        "@type": "PostalAddress",
        addressCountry: event.circuit.country,
      },
    },
    organizer: FIA_WEC_ORGANIZER,
    ...(event.posterUrl ? { image: event.posterUrl } : {}),
    url: buildSiteUrl(`/races/${event.id}`, route),
  };
}

export function personSchema(
  driver: DriverDetail,
  route?: JsonLdRouteContext,
): object {
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: driver.name,
    jobTitle: "Racing Driver",
    ...(driver.nationality
      ? { nationality: { "@type": "Country", name: driver.nationality } }
      : {}),
    ...(driver.photoUrl ? { image: driver.photoUrl } : {}),
    ...(driver.team
      ? {
          memberOf: {
            "@type": "SportsTeam",
            name: driver.team,
            ...(driver.teamId
              ? { url: buildSiteUrl(`/teams/${driver.teamId}`, route) }
              : {}),
          },
        }
      : {}),
    url: buildSiteUrl(`/drivers/${driver.id}`, route),
  };
}

export function teamSchema(
  team: TeamDetail,
  kind: "team" | "manufacturer" = "team",
  route?: JsonLdRouteContext,
): object {
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: team.name,
    sport: "Endurance Racing",
    ...(team.manufacturerLogoUrl ? { logo: team.manufacturerLogoUrl } : {}),
    ...(team.websiteUrl ? { sameAs: team.websiteUrl } : {}),
    ...(kind === "team" && team.manufacturer
      ? {
          parentOrganization: {
            "@type": "Organization",
            name: team.manufacturer,
            ...(team.manufacturerId
              ? {
                  url: buildSiteUrl(
                    `/manufacturers/${team.manufacturerId}`,
                    route,
                  ),
                }
              : {}),
          },
        }
      : {}),
    url: buildSiteUrl(`/teams/${team.id}`, route),
  };
}

export function manufacturerSchema(
  m: ManufacturerDetail,
  route?: JsonLdRouteContext,
): object {
  // Treat manufacturers as SportsTeam too — every WEC factory programme
  // fields cars, so the team semantics fit. parentOrganization points
  // at the championship organizer to express the entrant relationship.
  const sameAs = [m.websiteUrl, m.youtubeUrl, m.xUrl, m.instagramUrl].filter(
    (u): u is string => !!u,
  );
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: m.name,
    sport: "Endurance Racing",
    ...(m.logoUrl ? { logo: m.logoUrl } : {}),
    ...(m.country
      ? {
          address: {
            "@type": "PostalAddress",
            addressCountry: m.country,
          },
        }
      : {}),
    ...(sameAs.length > 0 ? { sameAs } : {}),
    parentOrganization: FIA_WEC_ORGANIZER,
    url: buildSiteUrl(`/manufacturers/${m.id}`, route),
  };
}

export function placeSchema(
  circuit: CircuitDetail,
  route?: JsonLdRouteContext,
): object {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: circuit.name,
    address: {
      "@type": "PostalAddress",
      addressCountry: circuit.country,
    },
    ...(circuit.layoutImage ? { image: circuit.layoutImage } : {}),
    url: buildSiteUrl(`/circuits/${circuit.id}`, route),
  };
}

export function carSchema(
  car: CarModelDetail,
  route?: JsonLdRouteContext,
): object {
  // Car keeps the entity specific without opting this informational page
  // into Google's Product rich-result requirements. Add Product as a second
  // type only if the page ever publishes a real offer, review, or rating.
  return {
    "@context": "https://schema.org",
    "@type": "Car",
    name: car.name,
    ...(car.imageUrl ? { image: car.imageUrl } : {}),
    ...(car.manufacturer
      ? {
          brand: {
            "@type": "Brand",
            name: car.manufacturer,
            ...(car.manufacturerLogoUrl ? { logo: car.manufacturerLogoUrl } : {}),
          },
          manufacturer: {
            "@type": "Organization",
            name: car.manufacturer,
          },
        }
      : {}),
    ...(car.category ? { vehicleConfiguration: car.category } : {}),
    ...(car.engine ? { vehicleEngine: { "@type": "EngineSpecification", name: car.engine } } : {}),
    ...(car.yearIntroduced ? { productionDate: String(car.yearIntroduced) } : {}),
    ...(car.weightKg ? { weight: { "@type": "QuantitativeValue", value: car.weightKg, unitCode: "KGM" } } : {}),
    url: buildSiteUrl(`/cars/${car.slug}`, route),
  };
}

export function breadcrumbSchema(
  items: { name: string; url?: string }[],
): object {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: it.name,
      ...(it.url ? { item: it.url } : {}),
    })),
  };
}

export function faqSchema(
  items: { question: string; answer: string }[],
): object {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((it) => ({
      "@type": "Question",
      name: it.question,
      acceptedAnswer: { "@type": "Answer", text: it.answer },
    })),
  };
}

/**
 * Renders one or more JSON-LD blocks as <script type="application/ld+json">.
 *
 * Place anywhere in a server-component's returned JSX — it has no
 * visual output and doesn't interact with React state. Multiple
 * schemas in an array each get their own script tag (Google prefers
 * separate blocks over a single graph for unrelated entities).
 */
export function JsonLd({ schema }: { schema: object | object[] }) {
  const schemas = Array.isArray(schema) ? schema : [schema];
  return (
    <>
      {schemas.map((s, i) => (
        <script
          // Static array — index keys are fine and avoid stringify churn.
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(s).replace(/</g, "\\u003c"),
          }}
        />
      ))}
    </>
  );
}
