import { describe, expect, it } from "vitest";
import { circuitLayoutImage, localCircuitLayout } from "./circuit-image";

describe("circuit layout selection", () => {
  it("uses official images for newly collected circuits with unknown countries", () => {
    for (const name of ["Monza Circuit", "Circuit de Barcelona-Catalunya"]) {
      expect(circuitLayoutImage({ name, country: "UNK", layoutImage: "https://www.fiawec.com/layout.png" }))
        .toBe("https://www.fiawec.com/layout.png");
    }
  });
  it("never substitutes Imola for Monza when Italy is populated", () => {
    expect(localCircuitLayout("ITA", "Monza Circuit")).toBeNull();
    expect(localCircuitLayout("ITA", "Imola Circuit")).toBe("/circuits/ita.svg");
    expect(localCircuitLayout("ITA", "이몰라")).toBe("/circuits/ita.svg");
  });
  it("keeps existing local assets and handles absent images", () => {
    expect(circuitLayoutImage({ name: "Fuji Speedway", country: "JPN" })).toBe("/circuits/jpn.svg");
    expect(circuitLayoutImage({ name: "Unknown", country: "UNK" })).toBeNull();
    expect(localCircuitLayout("../ita")).toBeNull();
  });
});
