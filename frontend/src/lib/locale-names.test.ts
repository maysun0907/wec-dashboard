import { expect, test } from "vitest";
import { localizeCircuitName, localizeEventName } from "./locale-names";

test.each(["Imola Circuit", "Interlagos Circuit", "Circuit de Barcelona-Catalunya", "Monza Circuit"])("localizes published circuit alias %s", (name) => {
  for (const locale of ["ko", "ja", "zh-CN"] as const) {
    expect(localizeCircuitName(name, locale)).not.toBe(name);
  }
  expect(localizeCircuitName(name, "en")).toBe(name);
});

test("Barcelona event uses the localized venue", () => {
  expect(localizeEventName("6 Hours of Barcelona", "ko")).toBe("바르셀로나 6시간");
  expect(localizeEventName("6 Hours of Barcelona", "ja")).toBe("バルセロナ6時間");
});
