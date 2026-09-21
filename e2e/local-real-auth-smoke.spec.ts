import { expect, test, type Page } from "@playwright/test";

const localAuthSecret = process.env.LOCAL_TEST_AUTH_SECRET || "hakken-local-test-auth";

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
  // The route carries the page it turned you away from, so the match cannot be
  // anchored to the end of the url.
  await expect(page).toHaveURL(/\/login(\?|$)/);
});

test("super admin reaches the real admin shell @real-auth-super-admin @real-auth-smoke", async ({ page }) => {
  await signInAsLocalRole(page, "super-admin", "/admin");
  await expect(page.getByText("Local Super Admin").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("local-super-admin@hakken.test").first()).toBeVisible();
});

test("standard user reaches the real app shell @real-auth-user @real-auth-smoke", async ({ page }) => {
  await signInAsLocalRole(page, "user", "/app");
  await expect(page.getByText("Local User").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("local-user@hakken.test").first()).toBeVisible();
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

test("standard user sends a message and the thread accepts it @real-auth-user @real-auth-smoke", async ({ page }) => {
  // A real model writes the reply, so this one waits on something slower than
  // the suite's default half minute.
  test.setTimeout(150_000);
  await signInAsLocalRole(page, "user", "/app");
  await page.goto("/app/assistant");

  const composer = page.locator("textarea");
  await expect(composer).toBeVisible({ timeout: 30000 });

  // Letters only. A numeric marker gets rewritten in the transcript: the PII
  // firewall redacts any run of 13 to 19 digits as a card number, and a
  // millisecond timestamp is thirteen.
  const message = `Real auth smoke ${Math.random().toString(36).replace(/[^a-z]/g, "").slice(0, 8)}`;
  await composer.click();
  await composer.fill(message);
  await page.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/\/app\/assistant\/[a-zA-Z0-9_-]+/, { timeout: 30000 });
  await expect(page.getByText(message).first()).toBeVisible({ timeout: 30000 });

  // This is the send half only, and the name says so now. The indicator below
  // is AssistantStagePill, which the thread renders whenever the last message
  // is the user's own — so it is already true by the line above, and it clears
  // again when the reply lands. It was documented as proof of the whole loop
  // (mutation, scheduled action, reactive query) and it is not.
  //
  // Asserting the reply itself is the right fix and wants a live run of this
  // lane to land safely — the assistant's own message, not the pill, not the
  // rating buttons (those sit behind a platform switch, so asserting them
  // would make the result depend on how the deployment is configured).
  await expect(page.getByRole("status").first()).toBeVisible({ timeout: 60000 });
});
