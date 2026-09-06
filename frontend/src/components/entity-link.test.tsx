import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test, vi } from "vitest";
import { DriverList } from "./entity-link";

vi.mock("@/components/public-link", () => ({
  PublicLink: ({ href, children }: { href: string; children: ReactNode }) => createElement("a", { href }, children),
}));

test.each([false, true])("partial profile matches preserve the complete published lineup (stacked=%s)", (stacked) => {
  const html = renderToStaticMarkup(createElement(DriverList, {
    refs: [{ id: 1, name: "Known Driver" }],
    text: "Known Driver / New Substitute", stacked,
  }));
  expect(html).toContain('href="/drivers/1"');
  expect(html).toContain("Known Driver");
  expect(html).toContain("New Substitute");
});
