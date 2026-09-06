import { describe, expect, it } from "vitest";
import { decodePicks, pointsFor, prunePicks, rankRows, updateRoundPick } from "./simulator";

const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("simulator input integrity", () => {
  it("drops obsolete rounds and unknown entries from shared predictions", () => {
    const picks = decodePicks(encode({ h: { 1: ["51", "999", "", ""], 2: ["51", "", "", ""] } }))!;
    expect(prunePicks(picks, [{ id: 1 }], [{ raceClass: "HYPERCAR", carNumber: "51" }]).HYPERCAR)
      .toEqual({ 1: { p1: "51" } });
  });
  it("uses equal points for Korean and English race names", () => {
    expect(pointsFor("바레인 8시간")).toEqual(pointsFor("8 Hours of Bahrain"));
    expect(pointsFor("르망 24시간")[0]).toBe(38);
    expect(pointsFor("이몰라 6시간")[0]).toBe(25);
  });
  it("moves a car between podium positions while allowing pole", () => {
    expect(updateRoundPick({ p1: "51", pole: "51" }, "p2", "51"))
      .toEqual({ p2: "51", pole: "51" });
  });
  it("sanitizes duplicate podiums from shared URLs", () => {
    expect(decodePicks(encode({ h: { 1: ["51", "51", "51", "51"] } }))?.HYPERCAR[1])
      .toEqual({ p1: "51", pole: "51" });
  });
  it("rejects malformed and oversized payloads", () => {
    for (const input of ["?", "a".repeat(16001), encode(null), encode([])]) {
      expect(decodePicks(input)).toBeNull();
    }
    expect(decodePicks(encode({ h: { NaN: ["51", "", "", ""], 2: ["한글", "", "", ""] }, constructor: {} }))?.HYPERCAR)
      .toEqual({});
  });
  it("retains published shared ranks when nothing is projected", () => {
    const rows = ["Z", "A"].map((name) => ({ key: name, name, current: 100, simulated: 100, delta: 0 }));
    expect(rankRows(rows, new Map([["Z", 1], ["A", 1]])).map((row) => [row.position, row.positionDelta]))
      .toEqual([[1, 0], [1, 0]]);
  });
});
