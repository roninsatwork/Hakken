import { expect, test, type Page } from "@playwright/test";

const localAuthSecret = process.env.LOCAL_TEST_AUTH_SECRET || "sonae-local-test-auth";

async function signInAsLocalRole(
  page: Page,
  role: "super-admin" | "user",
  redirectTo: "/admin" | "/app"
) {
  const url = new URL("/local-test-auth", "http://localhost:3100");
  url.searchParams.set("role", role);
  url.searchParams.set("secret", localAuthSecret);
  url.searchParams.set("redirectTo", redirectTo);

  await page.goto(url.pathname + url.search);
  await expect(page).toHaveURL(new RegExp(`${redirectTo}$`), { timeout: 45000 });
}

test("unauthenticated users are redirected from admin to login @real-auth-public", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("super admin reaches the real admin shell @real-auth-super-admin", async ({ page }) => {
  await signInAsLocalRole(page, "super-admin", "/admin");
  await expect(page.getByText("Local Super Admin").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("local-super-admin@sonae.test").first()).toBeVisible();
});

test("standard user reaches the real app shell @real-auth-user", async ({ page }) => {
  await signInAsLocalRole(page, "user", "/app");
  await expect(page.getByText("Local User").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("local-user@sonae.test").first()).toBeVisible();
});

test("standard user is redirected away from admin @real-auth-user", async ({ page }) => {
  await signInAsLocalRole(page, "user", "/app");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByText("Local User").first()).toBeVisible({ timeout: 15000 });
});
