import type { Locale } from "@/i18n/config";

const PLACE_ASIAN: Record<string, [string, string]> = {
  Fuji: ["富士", "富士"], "Le Mans": ["ル・マン", "勒芒"],
  "Spa-Francorchamps": ["スパ・フランコルシャン", "斯帕-弗朗科尔尚"], Spa: ["スパ", "斯帕"],
  Bahrain: ["バーレーン", "巴林"], Qatar: ["カタール", "卡塔尔"], Imola: ["イモラ", "伊莫拉"],
  "São Paulo": ["サンパウロ", "圣保罗"], "Sao Paulo": ["サンパウロ", "圣保罗"],
  Monza: ["モンツァ", "蒙扎"], Sebring: ["セブリング", "赛百灵"], Shanghai: ["上海", "上海"],
  Barcelona: ["バルセロナ", "巴塞罗那"],
  Silverstone: ["シルバーストン", "银石"], "Nürburgring": ["ニュルブルクリンク", "纽博格林"],
  "Portimão": ["ポルティマオ", "波尔蒂芒"], Austin: ["オースティン", "奥斯汀"],
};

function multilingualEventName(name: string, locale: Exclude<Locale, "en" | "ko">): string {
  const match = name.match(/^(\d+)\s*Hours of\s+(.+)$/i);
  if (!match) return name;
  const [, hours, place] = match;
  if (locale === "ja" || locale === "zh-CN") {
    const localPlace = PLACE_ASIAN[place!]?.[locale === "ja" ? 0 : 1] ?? place;
    return `${localPlace}${hours}${locale === "ja" ? "時間" : "小时"}`;
  }
  if (place === "Le Mans") return `${hours} ${ { fr: "Heures du Mans", de: "Stunden von Le Mans", it: "Ore di Le Mans", es: "Horas de Le Mans", "pt-BR": "Horas de Le Mans" }[locale]}`;
  return `${hours} ${{ fr: "Heures de", de: "Stunden von", it: "Ore di", es: "Horas de", "pt-BR": "Horas de" }[locale]} ${place}`;
}

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
  if (locale === "en") return name;
  if (locale !== "ko") return multilingualEventName(name, locale);
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
  if (locale === "ja" || locale === "zh-CN") {
    const names: Record<string, [string, string]> = {
      "Fuji Speedway": ["富士スピードウェイ", "富士赛车场"],
      "Circuit de la Sarthe": ["サルト・サーキット", "萨尔特赛道"],
      "Circuit of the Americas": ["サーキット・オブ・ジ・アメリカズ", "美洲赛道"],
      "Circuit de Spa-Francorchamps": ["スパ・フランコルシャン", "斯帕-弗朗科尔尚赛道"],
      "Bahrain International Circuit": ["バーレーン・インターナショナル・サーキット", "巴林国际赛道"],
      "Shanghai International Circuit": ["上海インターナショナル・サーキット", "上海国际赛车场"],
      "Autodromo Nazionale Monza": ["モンツァ・サーキット", "蒙扎国家赛道"],
      "Autodromo Enzo e Dino Ferrari": ["イモラ・サーキット", "伊莫拉赛道"],
    };
    return names[name]?.[locale === "ja" ? 0 : 1] ?? PLACE_ASIAN[name]?.[locale === "ja" ? 0 : 1] ?? name;
  }
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
  if (locale === "en") return e;
  return {
    ...e,
    name: localizeEventName(e.name, locale),
    circuit: { ...e.circuit, name: localizeCircuitName(e.circuit.name, locale) },
  };
}

export function localizeCircuit<T extends { name: string }>(c: T, locale: Locale): T {
  if (locale === "en") return c;
  return { ...c, name: localizeCircuitName(c.name, locale) };
}
