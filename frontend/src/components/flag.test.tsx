import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { Flag } from "./flag";

test.each([["AGO", "🇦🇴"], ["HKG", "🇭🇰"], ["ROU", "🇷🇴"]])("renders the official profile flag for %s", (code, flag) => {
  const html = renderToStaticMarkup(createElement(Flag, { code }));
  expect(html).toContain(flag);
  expect(html).toContain(`aria-label="${code}"`);
});
