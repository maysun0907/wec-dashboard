import { describe, expect, it } from "vitest";
import { raceMetadataCopy } from "./race-metadata";

const completedEvent = {
  name: "24 Hours of Le Mans",
  round: 4,
  dateStart: "2026-06-13",
  circuit: { name: "Circuit de la Sarthe" },
};

describe("raceMetadataCopy", () => {
  it("uses results intent for a completed race", () => {
    const copy = raceMetadataCopy(completedEvent, "en", "completed");

    expect(copy.title).toBe(
      "2026 24 Hours of Le Mans Results & Classification",
    );
    expect(copy.description).toContain("race classification");
    expect(copy.description).toContain("Circuit de la Sarthe");
  });

  it.each(["upcoming", "live"] as const)(
    "uses schedule and results intent for a %s race",
    (status) => {
      const copy = raceMetadataCopy(completedEvent, "en", status);

      expect(copy.title).toBe(
        "2026 24 Hours of Le Mans Schedule & Results",
      );
      expect(copy.description).toContain("weekend schedule");
      expect(copy.description).toContain("session status");
    },
  );

  it("uses localized Korean result and live intents", () => {
    const event = {
      ...completedEvent,
      name: "르망 24시간",
      circuit: { name: "라 사르트 서킷" },
    };

    expect(raceMetadataCopy(event, "ko", "completed").title).toBe(
      "2026 르망 24시간 결과·순위",
    );
    expect(raceMetadataCopy(event, "ko", "live").title).toBe(
      "2026 르망 24시간 일정·결과",
    );
  });

  it("adds Austin and COTA synonyms without stream claims", () => {
    const event = {
      name: "Lone Star Le Mans",
      round: 6,
      dateStart: "2026-09-04",
      circuit: { name: "Circuit of the Americas" },
    };

    const en = raceMetadataCopy(event, "en", "upcoming");
    const ko = raceMetadataCopy(
      {
        ...event,
        name: "론 스타 르망",
        circuit: { name: "서킷 오브 디 아메리카스" },
      },
      "ko",
      "completed",
    );

    expect(en.title).toBe(
      "2026 Lone Star Le Mans Schedule – WEC Austin/COTA",
    );
    expect(ko.title).toBe(
      "2026 론 스타 르망 결과·순위 – WEC 오스틴/COTA",
    );

    for (const value of [en.title, en.description]) {
      expect(value).toContain("Austin");
      expect(value).toContain("COTA");
      expect(value).not.toMatch(/free|stream/i);
    }
    for (const value of [ko.title, ko.description]) {
      expect(value).toContain("오스틴");
      expect(value).toContain("COTA");
      expect(value).not.toContain("무료");
      expect(value).not.toContain("스트리밍");
    }
  });
});
