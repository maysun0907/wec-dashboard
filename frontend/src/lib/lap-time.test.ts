import { expect, test } from "vitest";
import { lapTimeMs } from "./lap-time";

test("lap fractions use decimal seconds", () => {
  expect(lapTimeMs("1:23.1")).toBe(83100);
  expect(lapTimeMs("1:23.12")).toBe(83120);
  expect(lapTimeMs("1:23.123")).toBe(83123);
  expect(lapTimeMs("1:23")).toBe(83000);
  expect(lapTimeMs("1:63.123")).toBeNull();
  expect(lapTimeMs("DNF")).toBeNull();
});
