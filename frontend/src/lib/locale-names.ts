import type { Locale } from "@/i18n/config";

/** Korean equivalents for circuit names. Keyed by the English form
 *  exactly as it appears in the DB. Missing entries fall back to the
 *  English name. */
const CIRCUIT_KO: Record<string, string> = {
  "Bahrain International Circuit": "바레인 인터내셔널 서킷",
  "Circuit of the Americas": "서킷 오브 디 아메리카스",
  "Fuji Speedway": "후지 스피드웨이",
  "Imola": "이몰라",
  "Autodromo Enzo e Dino Ferrari": "이몰라 (엔초 에 디노 페라리)",
  "Interlagos": "인터라고스",
  "Autódromo José Carlos Pace": "인터라고스 (조제 카를로스 파스)",
  "Losail International Circuit": "로사일 인터내셔널 서킷",
  "Lusail International Circuit": "로사일 인터내셔널 서킷",
  "Circuit de la Sarthe": "라 사르트 서킷",
  "Circuit de Spa-Francorchamps": "스파-프랑코샹 서킷",
  "Sebring International Raceway": "세브링 인터내셔널 레이스웨이",
  "Silverstone Circuit": "실버스톤 서킷",
  "Shanghai International Circuit": "상하이 인터내셔널 서킷",
  "Nürburgring": "뉘르부르크링",
  "Monza": "몬차",
  "Autodromo Nazionale Monza": "몬차 인터내셔널 서킷",
  "Le Mans": "르망",
  "Spa-Francorchamps": "스파-프랑코샹",
  "Bahrain": "바레인",
  "Qatar": "카타르",
  "São Paulo": "상파울루",
  "Shanghai": "상하이",
};

/** Place-name fragments that appear inside event names ("6 Hours of
 *  Spa-Francorchamps", "Lone Star Le Mans", ...). Used both directly
 *  and by the "X Hours of Y" regex transform. */
const PLACE_KO: Record<string, string> = {
  "Spa-Francorchamps": "스파-프랑코샹",
  "Spa": "스파",
  "Le Mans": "르망",
  "Bahrain": "바레인",
  "Fuji": "후지",
  "Sebring": "세브링",
  "Silverstone": "실버스톤",
  "Shanghai": "상하이",
  "Qatar": "카타르",
  "Portimão": "포르티망",
  "Portimao": "포르티망",
  "Monza": "몬차",
  "Imola": "이몰라",
  "São Paulo": "상파울루",
  "Sao Paulo": "상파울루",
  "Interlagos": "인터라고스",
  "Nürburgring": "뉘르부르크링",
  "Nurburgring": "뉘르부르크링",
  "Austin": "오스틴",
  "Buenos Aires": "부에노스아이레스",
  "Mexico City": "멕시코시티",
};

/** Specific event names that don't follow "X Hours of Y" — translate
 *  verbatim or fall through to the regex pass. */
const EVENT_KO_VERBATIM: Record<string, string> = {
  "24 Hours of Le Mans": "르망 24시간",
  "Lone Star Le Mans": "론 스타 르망",
  "Petit Le Mans": "프티 르망",
};

/** Translate an event name. The dominant WEC pattern is
 *  "{N} Hours of {Place}" — render that as "{Place} {N}시간" so the
 *  display reads natural in Korean. Special-cased names go through
 *  EVENT_KO_VERBATIM first; anything else falls back to the original. */
export function localizeEventName(name: string, locale: Locale): string {
  if (locale !== "ko") return name;
  const verbatim = EVENT_KO_VERBATIM[name];
  if (verbatim) return verbatim;
  // "6 Hours of Spa-Francorchamps" → "스파-프랑코샹 6시간"
  // "1812 km of Qatar" → "카타르 1812 km"
  const hoursMatch = name.match(/^(\d+)\s*Hours of\s+(.+)$/i);
  if (hoursMatch) {
    const hours = hoursMatch[1]!;
    const place = hoursMatch[2]!.trim();
    return `${PLACE_KO[place] ?? place} ${hours}시간`;
  }
  const kmMatch = name.match(/^(\d+)\s*km of\s+(.+)$/i);
  if (kmMatch) {
    const km = kmMatch[1]!;
    const place = kmMatch[2]!.trim();
    return `${PLACE_KO[place] ?? place} ${km}km`;
  }
  return name;
}

/** Translate a circuit name. Falls back to the English form when no
 *  Korean variant is registered. */
export function localizeCircuitName(name: string, locale: Locale): string {
  if (locale !== "ko") return name;
  return CIRCUIT_KO[name] ?? name;
}

/** Apply localized name + circuit name to a typed Event-shaped object
 *  in one step. Used by pages that just read event.name / event.circuit
 *  for display so they can swap in the Korean form without touching
 *  every JSX site. */
export function localizeEvent<T extends { name: string; circuit: { name: string } }>(
  e: T,
  locale: Locale,
): T {
  if (locale !== "ko") return e;
  return {
    ...e,
    name: localizeEventName(e.name, locale),
    circuit: { ...e.circuit, name: localizeCircuitName(e.circuit.name, locale) },
  };
}

export function localizeCircuit<T extends { name: string }>(c: T, locale: Locale): T {
  if (locale !== "ko") return c;
  return { ...c, name: localizeCircuitName(c.name, locale) };
}
