import { expect, test } from "@playwright/test";
import { setE2ERole } from "./helpers/auth";

test.describe("Deterministic auth journey", () => {
  test("login redirects authenticated roles and logout clears protected access", async ({ page, context }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByRole("button", { name: /google|continue|sign/i }).first()).toBeVisible();

    await setE2ERole(page, "super-admin");
    await page.goto("/login");
    await expect(page).toHaveURL(/\/admin/);
    await expect(page.getByText(/E2E Super Admin/i).first()).toBeVisible();

    await context.clearCookies();
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/login/);
  });
});
