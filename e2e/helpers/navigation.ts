import { expect, type Page } from "@playwright/test";

export function collectPageErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return errors;
}

export async function gotoWithoutServerCrash(page: Page, route: string) {
  const response = await page.goto(route, { waitUntil: "domcontentloaded" });

  expect(response, `Expected ${route} to return a response`).not.toBeNull();
  if (response) {
    expect(response.status(), `Expected ${route} not to return a 5xx response`).toBeLessThan(500);
  }

  await expect(page.locator("body")).toBeVisible();
  return response;
}

export async function skipWhenRedirectedToLogin(page: Page, reason: string) {
  if (page.url().includes("/login")) {
    expect(page.url(), reason).not.toContain("/login");
  }
}
