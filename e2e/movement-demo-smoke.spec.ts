import { expect, test } from "@playwright/test";
import { collectPageErrors, gotoWithoutServerCrash } from "./helpers/navigation";

test.describe("Movement Demo: Route Smoke", () => {
  const movementRoutes = [
    "/demos/movements",
    "/demos/movement-capture",
    "/demos/movements/movement_smoke_id",
    "/demos/movements/movement_smoke_id/play",
    "/demos/movements/squat-proof",
  ];

  for (const route of movementRoutes) {
    test(`route ${route} returns a non-5xx shell or auth redirect`, async ({ page }) => {
      const pageErrors = collectPageErrors(page);

      await gotoWithoutServerCrash(page, route);

      if (page.url().includes("/login")) {
        await expect(page).toHaveURL(/.*\/login/);
      } else {
        await expect(page.locator("body")).toBeVisible();
      }

      expect(pageErrors).toEqual([]);
    });
  }
});
