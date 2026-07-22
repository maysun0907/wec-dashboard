import type { Locale } from "@/i18n/config";
import type { EventStatus } from "@/lib/api";

type RaceMetadataEvent = {
  name: string;
  round: number;
  dateStart: string;
  circuit?: { name: string } | null;
};

type RaceMetadataCopy = {
  title: string;
  description: string;
};

const AUSTIN_EVENT_PATTERN =
  /lone star le mans|론 스타 르망|circuit of the americas|서킷 오브 디 아메리카스|\bcota\b|오스틴|\baustin\b/i;

function eventYear(dateStart: string): string | null {
  const match = /^(\d{4})-\d{2}-\d{2}/.exec(dateStart);
  return match?.[1] ?? null;
}

function isAustinEvent(event: RaceMetadataEvent): boolean {
  return AUSTIN_EVENT_PATTERN.test(
    `${event.name} ${event.circuit?.name ?? ""}`,
  );
}

function eventNameForSearch(
  event: RaceMetadataEvent,
  locale: Locale,
): string {
  if (!isAustinEvent(event)) return event.name;

  const hasAustin = /오스틴|\baustin\b/i.test(event.name);
  const hasCota = /\bcota\b/i.test(event.name);
  if (hasAustin && hasCota) return event.name;
  if (hasAustin) return `${event.name} (COTA)`;
  if (hasCota) {
    return locale === "ko"
      ? `${event.name} (오스틴)`
      : `${event.name} (Austin)`;
  }
  return locale === "ko"
    ? `${event.name} (오스틴/COTA)`
    : `${event.name} (Austin/COTA)`;
}

export function raceMetadataCopy(
  event: RaceMetadataEvent,
  locale: Locale,
  status: EventStatus,
): RaceMetadataCopy {
  const year = eventYear(event.dateStart);
  const searchName = eventNameForSearch(event, locale);
  const titlePrefix = [year, searchName].filter(Boolean).join(" ");
  const eventTitlePrefix = [year, event.name].filter(Boolean).join(" ");
  const austinEvent = isAustinEvent(event);
  const completed = status === "completed";
  const title = locale === "ko"
    ? austinEvent
      ? `${eventTitlePrefix} ${completed ? "결과·순위" : "일정·결과"} – WEC 오스틴/COTA`
      : `${titlePrefix} ${completed ? "결과·순위" : "일정·결과"}`
    : austinEvent
      ? `${eventTitlePrefix} ${completed ? "Results" : "Schedule"} – WEC Austin/COTA`
      : `${titlePrefix} ${completed ? "Results & Classification" : "Schedule & Results"}`;

  const factParts: string[] = [];
  if (year) factParts.push(locale === "ko" ? `${year}년` : year);
  if (event.round) {
    factParts.push(locale === "ko" ? `${event.round}라운드` : `Round ${event.round}`);
  }
  if (event.circuit?.name) factParts.push(event.circuit.name);
  const facts = factParts.join(" · ");
  const lead = `${searchName}${facts ? ` — ${facts}` : ""}.`;

  if (locale === "ko") {
    return {
      title,
      description: completed
        ? `${lead} FIA WEC 하이퍼카·LMGT3 예선 결과와 결승 결과·순위, 랩 차트, 피트스톱, 최고속도, 섹터 기록과 세션별 날씨를 확인하세요.`
        : `${lead} FIA WEC 경기 일정과 세션 진행 상태, 하이퍼카·LMGT3 예선 및 결승 결과, 랩 차트, 피트스톱과 세션별 날씨를 확인하세요.`,
    };
  }

  return {
    title,
    description: completed
      ? `${lead} Explore FIA WEC Hypercar and LMGT3 qualifying results, race classification, lap chart, pit stops, V-max, sector splits and weather by session.`
      : `${lead} Follow the FIA WEC weekend schedule and session status, Hypercar and LMGT3 qualifying and race results, lap chart, pit stops and weather by session.`,
  };
}
