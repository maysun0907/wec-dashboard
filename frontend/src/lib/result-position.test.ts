import { expect, it } from "vitest";
import { positionSummary } from "./result-position";

it("does not treat a disqualified result as P0 or improve average finishing position", () => {
  expect(positionSummary([{ classPosition: 0 }, { classPosition: 2 }, { classPosition: 4 }])).toEqual({ best: 2, average: 3 });
  expect(positionSummary([{ classPosition: 0 }])).toEqual({ best: null, average: null });
  expect(positionSummary([])).toEqual({ best: null, average: null });
});
