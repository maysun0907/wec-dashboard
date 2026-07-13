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

// Mirrors the resolution order used by sitemap.ts / robots.ts so the
// generated absolute URLs match canonical / sitemap entries exactly.
function siteBase(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  return "http://localhost:3000";
}

export function buildSiteUrl(path: string): string {
  const base = siteBase().replace(/\/+$/, "");
  if (!path) return base + "/";
  const p = path.startsWith("/") ? path : `/${path}`;
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
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${base.replace(/\/$/, "")}/?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export function eventSchema(event: EventDetail): object {
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
    url: buildSiteUrl(`/races/${event.id}`),
  };
}

export function personSchema(driver: DriverDetail): object {
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
              ? { url: buildSiteUrl(`/teams/${driver.teamId}`) }
              : {}),
          },
        }
      : {}),
    url: buildSiteUrl(`/drivers/${driver.id}`),
  };
}

export function teamSchema(
  team: TeamDetail,
  kind: "team" | "manufacturer" = "team",
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
              ? { url: buildSiteUrl(`/manufacturers/${team.manufacturerId}`) }
              : {}),
          },
        }
      : {}),
    url: buildSiteUrl(`/teams/${team.id}`),
  };
}

export function manufacturerSchema(m: ManufacturerDetail): object {
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
    url: buildSiteUrl(`/manufacturers/${m.id}`),
  };
}

export function placeSchema(circuit: CircuitDetail): object {
  return {
    "@context": "https://schema.org",
    "@type": "Place",
    name: circuit.name,
    address: {
      "@type": "PostalAddress",
      addressCountry: circuit.country,
    },
    ...(circuit.layoutImage ? { image: circuit.layoutImage } : {}),
    url: buildSiteUrl(`/circuits/${circuit.id}`),
  };
}

export function carSchema(car: CarModelDetail): object {
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
    url: buildSiteUrl(`/cars/${car.slug}`),
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
