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

test("unauthenticated users are redirected from admin to login @real-auth-public @real-auth-smoke", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login$/);
});

test("super admin reaches the real admin shell @real-auth-super-admin @real-auth-smoke", async ({ page }) => {
  await signInAsLocalRole(page, "super-admin", "/admin");
  await expect(page.getByText("Local Super Admin").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("local-super-admin@sonae.test").first()).toBeVisible();
});

test("standard user reaches the real app shell @real-auth-user @real-auth-smoke", async ({ page }) => {
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

test("super admin reads a real admin table @real-auth-super-admin @real-auth-smoke", async ({ page }) => {
  await signInAsLocalRole(page, "super-admin", "/admin");
  await page.goto("/admin/companies");
  await expect(page.getByRole("table").first()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText("Local Test Company").first()).toBeVisible({ timeout: 30000 });
});

test("standard user sends a message and the assistant answers @real-auth-user @real-auth-smoke", async ({ page }) => {
  await signInAsLocalRole(page, "user", "/app");
  await page.goto("/app/assistant");

  const composer = page.locator("textarea");
  await expect(composer).toBeVisible({ timeout: 30000 });

  const message = `Real auth smoke ${Date.now()}`;
  await composer.click();
  await composer.fill(message);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/app\/assistant\/[a-zA-Z0-9_-]+/, { timeout: 30000 });
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 30000 });

  await expect(page.getByRole("button", { name: "Helpful" }).first()).toBeVisible({ timeout: 90000 });
});
