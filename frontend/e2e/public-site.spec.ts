import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Run only against a locally built frontend + isolated database, never load
// test production. Entity IDs are discovered from that database's API.
const api = "http://127.0.0.1:8000/api/v1";
const routes = ["", "/races", "/standings", "/standings/simulator", "/drivers", "/drivers/compare", "/teams", "/cars", "/circuits", "/manufacturers/compare", "/genesis-wec"];

test("all page families render in both languages", async ({ page, request }) => {
  test.setTimeout(240000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(`${page.url()}: ${error.message}`));
  for (const locale of ["en", "ko"]) {
    for (const path of [...routes.map((r) => `/${locale}/2026${r}`), ...["live", "rules", "stats", "seasons/compare"].map((r) => `/${locale}/${r}`)]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("h1").first(), path).toBeVisible();
      await expect(page.locator("body")).not.toContainText("Application error");
    }
    for (const family of ["events", "drivers", "teams", "circuits", "cars"]) {
      const items = await (await request.get(`${api}/${family}?year=2026`)).json();
      const path = `/${locale}/${family === "events" ? "races" : family}/${family === "cars" ? items[0].slug : items[0].id}`;
      expect((await page.goto(path))?.status(), path).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
      // Let lazy chart requests settle before unloading the document.
      // WebKit reports aborted navigation fetches as access-control errors.
      await page.waitForLoadState("networkidle");
    }
    const manufacturers = await (await request.get(`${api}/standings/manufacturers?year=2026&raceClass=HYPERCAR`)).json();
    expect((await page.goto(`/${locale}/manufacturers/${manufacturers[0].manufacturerId}`))?.status()).toBe(200);
    await expect(page.locator("h1")).toBeVisible();
    await page.waitForLoadState("networkidle");
  }
  expect(errors).toEqual([]);
});

test("compare removal preserves Korean and season, including empty selection", async ({ page }) => {
  await page.goto("/ko/2025/drivers/compare");
  while (await page.getByRole("button", { name: /^Remove / }).count()) {
    const buttons = page.getByRole("button", { name: /^Remove / });
    const count = await buttons.count();
    await buttons.first().click();
    await expect(buttons).toHaveCount(count - 1);
    await expect(page).toHaveURL(/\/ko\/2025\/drivers\/compare\?/);
  }
  await expect(page).toHaveURL(/ids=/);
});

test("search uses the selected season and handles network errors", async ({ page }) => {
  await page.goto("/en/2025/drivers");
  const requested: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    requested.push(route.request().url());
    await route.abort();
  });
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("Search is unavailable");
  expect(requested.length).toBe(3);
  expect(requested.every((url) => new URL(url).searchParams.get("year") === "2025")).toBe(true);
});

test("homepage has no serious accessibility violations or mobile overflow", async ({ page }) => {
  await page.goto("/en/2026");
  await expect(page.locator("h1")).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
  expect(results.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? ""))).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("language and season switches preserve navigation", async ({ page }) => {
  await page.goto("/en/2026/drivers");
  await page.getByRole("button", { name: "KO", exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/2026\/drivers$/);
  await page.getByRole("combobox", { name: "Season", exact: true }).click();
  await page.getByRole("option", { name: "2025", exact: true }).click();
  await expect(page).toHaveURL(/\/ko\/2025\/drivers$/);
  await expect(page.getByRole("combobox", { name: "Season", exact: true })).toContainText("2025");
});

test("mobile navigation opens, navigates and closes", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/en/2026");
  await page.locator("[data-mobile-menu-trigger]").click();
  await page.getByRole("dialog").getByRole("link", { name: "Races", exact: true }).click();
  await expect(page).toHaveURL(/\/en\/2026\/races$/);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("search returns real drivers and navigates without losing language", async ({ page }) => {
  await page.goto("/ko/2026/drivers");
  await page.locator("header button[title$='(⌘K)']").click();
  await page.getByRole("dialog").getByRole("combobox").fill("Buemi");
  const result = page.getByRole("option").filter({ hasText: "Buemi" });
  await expect(result).toHaveCount(1);
  await result.click();
  await expect(page).toHaveURL(/\/ko\/drivers\/\d+$/);
});

test("simulator prevents duplicate podium scoring and resets", async ({ page }) => {
  await page.goto("/en/2026/standings/simulator");
  const winner = page.getByRole("combobox", { name: / Winner$/ }).first();
  await winner.click();
  await page.getByRole("option").first().click();
  const second = page.getByRole("combobox", { name: / 2nd$/ }).first();
  await second.click();
  await page.getByRole("option").first().click();
  await expect(winner).toHaveText("—");
  await expect(page).toHaveURL(/[?&]p=/);
  await page.getByRole("button", { name: "Reset picks", exact: true }).click();
  await expect(page).not.toHaveURL(/[?&]p=/);
});

test("race session tabs and class filtering preserve the selected race", async ({ page, request }) => {
  const events = await (await request.get(`${api}/events?year=2026`)).json();
  const event = await (await request.get(`${api}/events/${events[0].id}`)).json();
  await page.goto(`/ko/races/${event.id}`);
  for (const session of event.sessions) {
    const tabs = page.getByRole("tablist").first().getByRole("tab");
    const index = event.sessions.findIndex((row: { id: number }) => row.id === session.id);
    await tabs.nth(index).click();
    await expect(tabs.nth(index)).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(new RegExp(`/ko/races/${event.id}`));
    await page.waitForLoadState("networkidle");
  }
  const filter = page.locator("[data-race-class-filter]").first();
  if (await filter.count()) {
    await filter.getByRole("button", { name: "LMGT3", exact: true }).click();
    await expect(filter).toHaveAttribute("data-race-class-filter", "LMGT3");
    for (const row of await filter.locator('[data-race-class="HYPERCAR"]').all()) await expect(row).toBeHidden();
  }
});

test("historical pages, legacy redirects and invalid identifiers", async ({ page }) => {
  for (const year of [2012, 2018, 2023, 2025]) {
    for (const family of ["races", "drivers", "standings"]) {
      expect((await page.goto(`/en/${year}/${family}`))?.status()).toBe(200);
      await expect(page.locator("h1").first()).toBeVisible();
    }
  }
  await page.goto("/ko/bop");
  await expect(page).toHaveURL(/\/ko\/rules$/);
  expect((await page.goto("/en/drivers/999999999"))?.status()).toBe(404);
  expect((await page.goto("/en/cars/does-not-exist"))?.status()).toBe(404);
});

test("primary data and tool pages have valid accessible controls", async ({ page }) => {
  for (const path of ["/en/2026/drivers", "/en/2026/standings", "/en/2026/standings/simulator", "/ko/2026/drivers/compare", "/en/rules", "/en/live"]) {
    await page.goto(path);
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    expect(result.violations.filter((v) => ["critical", "serious"].includes(v.impact ?? "")), path).toEqual([]);
  }
});
