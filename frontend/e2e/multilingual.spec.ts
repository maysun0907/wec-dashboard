import { test, expect } from "@playwright/test";
import { LOCALES } from "../src/i18n/config";
import { catalogTranslator } from "../src/i18n/catalog";

// Isolated local API only. One worker; no parallel crawl against production.
test("all new languages render page families with self-canonical SEO", async ({ page, request }) => {
  test.setTimeout(360000);
  const failures: string[] = [];
  page.on("pageerror", (error) => failures.push(`${page.url()}: ${error.message}`));
  const api = "http://127.0.0.1:8000/api/v1";
  const drivers = await (await request.get(`${api}/drivers?year=2026`)).json();
  const teams = await (await request.get(`${api}/teams?year=2026`)).json();
  const cars = await (await request.get(`${api}/cars?year=2026`)).json();
  const manufacturers = await (await request.get(`${api}/standings/manufacturers?year=2026&raceClass=HYPERCAR`)).json();
  const paths = ["/2026", "/2026/races", "/2026/standings", "/2026/drivers", "/2026/teams", "/2026/cars", "/2026/circuits", "/2026/genesis-wec", "/2026/drivers/compare", "/2026/manufacturers/compare", "/2026/standings/simulator", "/live", "/rules", "/stats", "/seasons/compare", "/races/665", `/drivers/${drivers[0].id}`, `/teams/${teams[0].id}`, `/2026/cars/${cars[0].slug}`, "/circuits/31", `/manufacturers/${manufacturers[0].manufacturerId}`];
  for (const locale of LOCALES.filter((l) => l !== "en" && l !== "ko")) {
    for (const path of paths) {
      const url = `/${locale}${path}`;
      expect((await page.goto(url))?.status(), url).toBe(200);
      await expect(page.locator("h1").first(), url).toBeVisible();
      await expect(page.locator("html")).toHaveAttribute("lang", locale);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `https://www.wecdash.com${url}`);
      await expect(page.locator('link[rel="alternate"][hreflang]')).toHaveCount(10);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /\S{2}/);
      await expect(page.locator('meta[name="keywords"]')).toHaveCount(0);
      await expect(page.locator('select')).toHaveValue(locale);
      await expect(page.locator("body")).not.toContainText(/MISSING_MESSAGE|INVALID_MESSAGE|Application error/);
    }
  }
  expect(failures).toEqual([]);
});

test("language navigation survives a failed preference action", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/en/2025/drivers/compare?ids=#form");
  let failedActions = 0;
  await page.route("**/*", async (route) => {
    if (route.request().method() === "POST" && route.request().headers()["next-action"]) {
      failedActions++;
      await route.fulfill({ status: 503, body: "Temporarily unavailable" });
    } else {
      await route.continue();
    }
  });
  await page.locator("select").selectOption("ja");
  await expect(page).toHaveURL(/\/ja\/2025\/drivers\/compare\?ids=#form$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
  expect(failedActions).toBe(1);
  expect(errors).toEqual([]);
});

test("comparison controls use each selected language", async ({ page }) => {
  for (const locale of LOCALES) {
    await page.goto(`/${locale}/seasons/compare?years=2025,2024`);
    const label = catalogTranslator(locale)("common.removeNamed", { name: "2024" });
    await page.getByRole("button", { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/${locale}/seasons/compare\\?years=2025$`));
  }
});

test("language menu preserves deep links and saves the preferred landing language", async ({ page }) => {
  await page.goto("/ko/2025/drivers/compare?ids=#form");
  for (const locale of ["ja", "zh-CN", "fr", "pt-BR", "en"]) {
    await page.locator("select").selectOption(locale);
    await expect(page).toHaveURL(new RegExp(`/${locale}/2025/drivers/compare\\?ids=#form$`));
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
  await page.locator("select").selectOption("it");
  await expect(page).toHaveURL(/\/it\/2025\/drivers\/compare/);
  await page.goto("/");
  await expect(page).toHaveURL(/\/it\/\d{4}$/);
  await page.goto("/ja/races/665");
  await expect(page.locator("html")).toHaveAttribute("lang", "ja");
});

test("multilingual mobile headers and Fuji schedules fit narrow screens", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const locale of LOCALES) {
      await page.goto(`/${locale}/races/665`);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${locale} ${width}`).toBe(true);
      await expect(page.locator("select")).toBeVisible();
      await expect(page.locator("main")).toContainText("11:00");
      await expect(page.locator("main")).toContainText(locale === "ko" ? "KST" : "JST");
      await page.locator("[data-mobile-menu-trigger]").click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");
    }
  }
});
