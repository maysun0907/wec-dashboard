import type { Metadata } from "next";
import { getLocale } from "next-intl/server";
import { isLocale, type Locale } from "@/i18n/config";
import { getSelectedSeason } from "@/lib/season";
import { getSeasons } from "@/lib/api";
import { pageMetadata } from "@/lib/page-metadata";
import { matchInternalPublicRoute } from "@/lib/public-routing";

export type DashboardPage =
  | "home"
  | "races"
  | "standings"
  | "drivers"
  | "teams"
  | "cars"
  | "circuits"
  | "rules"
  | "stats"
  | "live"
  | "genesis"
  | "seasonCompare"
  | "standingsSimulator"
  | "driverCompare"
  | "manufacturerCompare";

type MetadataCopy = { title: string; description: string };

/**
 * Search copy is kept separate from UI labels: a page heading can stay short
 * while its document title explains the exact season and search intent.
 */
export function dashboardMetadataCopy(
  page: DashboardPage,
  locale: Locale,
  year: number,
): MetadataCopy {
  const en: Record<DashboardPage, MetadataCopy> = {
    home: {
      title: `${year} FIA WEC Schedule, Standings & Results`,
      description: `Follow the ${year} FIA World Endurance Championship with the full race calendar, Hypercar and LMGT3 standings, teams, drivers and race-weekend data.`,
    },
    races: {
      title: `${year} FIA WEC Schedule & Race Calendar`,
      description: `View every round of the ${year} FIA WEC calendar, including race dates, circuits and each event's current status.`,
    },
    standings: {
      title: `${year} FIA WEC Standings – Hypercar & LMGT3`,
      description: `Explore ${year} FIA WEC driver, manufacturer and team standings for Hypercar, LMGT3 and every class with published championship data.`,
    },
    drivers: {
      title: `${year} FIA WEC Drivers & Entries`,
      description: `Browse the ${year} FIA WEC driver roster by class, car number and team, with links to each driver's championship record.`,
    },
    teams: {
      title: `${year} FIA WEC Teams & Car Numbers`,
      description: `Browse every ${year} FIA WEC team and car entry across Hypercar, LMGT3 and the other classes on the selected season's grid.`,
    },
    cars: {
      title: `${year} FIA WEC Hypercars & LMGT3 Cars`,
      description: `Compare the car models racing in the ${year} FIA WEC season, grouped by class with their teams and entry numbers.`,
    },
    circuits: {
      title: `${year} FIA WEC Circuits & Calendar`,
      description: `Explore the circuits on the ${year} FIA WEC calendar with track length, race date, country and round status.`,
    },
    rules: {
      title: "FIA WEC Rules Explained – Hypercar, LMGT3 & Points",
      description: "Understand FIA WEC classes, Hypercar regulations, Balance of Performance, qualifying and the points systems used for standard and endurance rounds.",
    },
    stats: {
      title: "FIA WEC All-Time Stats, Champions & Le Mans Winners",
      description: "Explore FIA WEC championship records, leading race winners, podium totals and the season-by-season list of 24 Hours of Le Mans winners.",
    },
    live: {
      title: `${year} FIA WEC Live Race Weekend`,
      description: `Track the next ${year} FIA WEC race weekend with session status, circuit-local times, browser-local times and official viewing links.`,
    },
    genesis: {
      title:
        year >= 2026
          ? `${year} Genesis WEC – GMR-001, Drivers & Standings`
          : `${year} Genesis WEC Entry Archive`,
      description:
        year >= 2026
          ? `Track Genesis Magma Racing in the ${year} FIA WEC season with the published #17 and #19 GMR-001 entries, driver roster and manufacturer standing.`
          : `Check the published ${year} FIA WEC season lists for Genesis entries, drivers, cars and manufacturer standings.`,
    },
    seasonCompare: {
      title: "Compare FIA WEC Seasons & Champions",
      description: "Compare FIA WEC seasons side by side, including their top-class driver and manufacturer champions, round counts and standings progression.",
    },
    standingsSimulator: {
      title: `${year} FIA WEC Championship Simulator`,
      description: `Simulate the remaining ${year} FIA WEC rounds and see how podium and pole picks change the driver, manufacturer and team championships.`,
    },
    driverCompare: {
      title: `${year} FIA WEC Driver Comparison`,
      description: `Compare up to five ${year} FIA WEC drivers by standings position, points, form and round-by-round championship progression.`,
    },
    manufacturerCompare: {
      title: `${year} FIA WEC Manufacturer Comparison`,
      description: `Compare ${year} FIA WEC Hypercar manufacturers by championship points, form and round-by-round progression.`,
    },
  };

  const ko: Record<DashboardPage, MetadataCopy> = {
    home: {
      title: `${year} WEC 일정·순위·결과`,
      description: `${year} FIA WEC 전체 일정과 하이퍼카·LMGT3 드라이버, 팀, 매뉴팩처 순위 및 레이스 위켄드 데이터를 확인하세요.`,
    },
    races: {
      title: `${year} WEC 경기 일정·캘린더`,
      description: `${year} FIA WEC 전체 라운드의 경기 날짜, 서킷과 현재 진행 상태를 한눈에 확인하세요.`,
    },
    standings: {
      title: `${year} WEC 순위 – 하이퍼카·LMGT3`,
      description: `${year} FIA WEC 하이퍼카·LMGT3 드라이버, 매뉴팩처, 팀 챔피언십 순위를 클래스별로 확인하세요.`,
    },
    drivers: {
      title: `${year} WEC 드라이버·엔트리`,
      description: `${year} FIA WEC 드라이버 명단을 클래스, 차량 번호, 팀별로 살펴보고 개인별 챔피언십 기록을 확인하세요.`,
    },
    teams: {
      title: `${year} WEC 참가 팀·차량 번호`,
      description: `${year} FIA WEC 하이퍼카·LMGT3를 비롯한 전체 클래스의 참가 팀과 차량 엔트리를 확인하세요.`,
    },
    cars: {
      title: `${year} WEC 하이퍼카·LMGT3 차량`,
      description: `${year} FIA WEC 출전 차량 모델과 운영 팀, 엔트리 번호를 클래스별로 비교하세요.`,
    },
    circuits: {
      title: `${year} WEC 서킷·캘린더`,
      description: `${year} FIA WEC 캘린더의 서킷별 길이, 개최일, 국가와 라운드 진행 상태를 확인하세요.`,
    },
    rules: {
      title: "FIA WEC 규정 해설 – 하이퍼카·LMGT3·포인트",
      description: "FIA WEC 클래스와 하이퍼카 규정, BoP, 예선 방식, 일반 및 엔듀런스 라운드 포인트 체계를 쉽게 확인하세요.",
    },
    stats: {
      title: "FIA WEC 역대 기록·챔피언·르망 우승자",
      description: "FIA WEC 역대 챔피언십 기록과 최다 우승·포디움, 시즌별 르망 24시간 종합 우승자를 확인하세요.",
    },
    live: {
      title: `${year} WEC 라이브 레이스 위켄드`,
      description: `${year} FIA WEC 다음 레이스 위켄드의 세션 상태, 서킷 현지·내 지역 시간과 공식 시청 링크를 확인하세요.`,
    },
    genesis: {
      title:
        year >= 2026
          ? `${year} 제네시스 WEC – GMR-001·드라이버·순위`
          : `${year} 제네시스 WEC 엔트리 아카이브`,
      description:
        year >= 2026
          ? `${year} FIA WEC에 출전하는 제네시스 마그마 레이싱의 #17·#19 GMR-001 엔트리, 드라이버 명단과 매뉴팩처 순위를 확인하세요.`
          : `${year} FIA WEC 시즌에 공개된 제네시스 엔트리, 드라이버, 차량과 매뉴팩처 순위가 있는지 확인하세요.`,
    },
    seasonCompare: {
      title: "FIA WEC 시즌·챔피언 비교",
      description: "FIA WEC 여러 시즌의 최상위 클래스 드라이버·매뉴팩처 챔피언, 라운드 수와 순위 추이를 나란히 비교하세요.",
    },
    standingsSimulator: {
      title: `${year} WEC 챔피언십 시뮬레이터`,
      description: `${year} FIA WEC 남은 라운드의 포디움과 폴을 선택해 드라이버·매뉴팩처·팀 순위 변화를 예측하세요.`,
    },
    driverCompare: {
      title: `${year} WEC 드라이버 비교`,
      description: `${year} FIA WEC 드라이버 최대 5명의 순위, 포인트, 최근 폼과 라운드별 챔피언십 추이를 비교하세요.`,
    },
    manufacturerCompare: {
      title: `${year} WEC 매뉴팩처 비교`,
      description: `${year} FIA WEC 하이퍼카 매뉴팩처의 챔피언십 포인트, 최근 폼과 라운드별 추이를 비교하세요.`,
    },
  };

  return (locale === "ko" ? ko : en)[page];
}

export async function dashboardPageMetadata(
  page: DashboardPage,
  path: `/${string}`,
): Promise<Metadata> {
  const [rawLocale, selectedYear] = await Promise.all([
    getLocale(),
    getSelectedSeason(),
  ]);
  const locale = isLocale(rawLocale) ? rawLocale : "en";
  const year = selectedYear ?? new Date().getUTCFullYear();
  const copy = dashboardMetadataCopy(page, locale, year);

  const metadata = pageMetadata({ ...copy, path, locale, year });
  if (
    selectedYear !== null &&
    matchInternalPublicRoute(path)?.scope === "season"
  ) {
    try {
      const seasons = await getSeasons();
      if (!seasons.some((season) => season.year === selectedYear)) {
        return { ...metadata, robots: { index: false, follow: true } };
      }
    } catch {
      // Keep the last known page behavior during a transient API outage.
    }
  }
  return metadata;
}
