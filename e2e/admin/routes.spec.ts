import { expect, test } from "@playwright/test";
import { collectPageErrors, gotoWithoutServerCrash, skipWhenRedirectedToLogin } from "../helpers/navigation";

test.describe("Admin route coverage", () => {
  const protectedRoutes = [
    "/admin/ai/models",
    "/admin/ai/tools",
    "/admin/ai/global-knowledge",
    "/admin/workflows",
    "/admin/workflows/schedules",
    "/admin/workflows/logs",
    "/admin/users",
    "/admin/companies",
    "/admin/agents",
  ];

  for (const route of protectedRoutes) {
    test(`${route} does not produce a Next.js shell crash`, async ({ page }) => {
      const pageErrors = collectPageErrors(page);

      await gotoWithoutServerCrash(page, route);

      if (page.url().includes("/login")) {
        await expect(page.getByRole("button", { name: /google|continue|sign/i }).first()).toBeVisible();
      } else {
        await expect(page.locator("main, body")).toBeVisible();
      }

      expect(pageErrors).toEqual([]);
    });
  }

  test("workflow designer and schedule routes render when authenticated", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/admin/workflows");
    await skipWhenRedirectedToLogin(page, "Workflow designer coverage requires an authenticated admin storage state.");

    await expect(page.getByText(/Workflow|Automation|Automazione/i).first()).toBeVisible();

    await gotoWithoutServerCrash(page, "/admin/workflows/schedules");
    await skipWhenRedirectedToLogin(page, "Workflow schedule coverage requires an authenticated admin storage state.");

    await expect(page.getByText(/Schedule|Schedules|Pianific/i).first()).toBeVisible();
  });

  test("AI models and tools routes render when authenticated", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/admin/ai/models");
    await skipWhenRedirectedToLogin(page, "AI models/tools coverage requires an authenticated admin storage state.");

    await expect(page.getByText(/Model|Models|Modelli/i).first()).toBeVisible();

    await gotoWithoutServerCrash(page, "/admin/ai/tools");
    await skipWhenRedirectedToLogin(page, "AI tools coverage requires an authenticated admin storage state.");

    await expect(page.getByText(/Tool|Connector|Connett/i).first()).toBeVisible();
  });
});
