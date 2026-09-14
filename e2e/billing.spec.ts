import { test, expect } from "@playwright/test";
import { setE2ERole } from "./helpers/auth";

test("company admin reaches Billing in the user frontend and is refused platform Admin", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await setE2ERole(page, "company-admin");
  await page.goto("/app/settings/billing");
  await expect(page.getByRole("heading", { name: "Billing", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Billing", exact: true })).toHaveAttribute("href", "/app/settings/billing");
  await expect(page.getByRole("button", { name: "Manage billing in Stripe" })).toBeVisible();
  await expect(page.locator('nav a[href^="/admin"]')).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("company-billing.png"), fullPage: true });
  await page.goto("/admin/settings/billing");
  await expect(page).toHaveURL(/\/app$/);
  expect(errors).toEqual([]);
});

test("super admin sees oversight, missing setup and plan price selection", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await setE2ERole(page, "super-admin");
  await page.goto("/admin/settings/billing");
  await expect(page.getByRole("heading", { name: "Paying companies" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Users on paid subscriptions" })).toBeVisible();
  await expect(page.getByText("£297.00", { exact: true })).toBeVisible();
  await page.screenshot({ path: test.info().outputPath("billing-overview.png"), fullPage: true });
  await page.getByRole("link", { name: "Stripe setup", exact: true }).click();
  await expect(page.getByText("Stripe key missing or wrong mode", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Webhook endpoint")).toHaveValue("https://e2e-placeholder.convex.site/stripe/webhook");
  await page.screenshot({ path: test.info().outputPath("billing-setup.png"), fullPage: true });
  await page.getByRole("link", { name: "Manage plans and Stripe prices" }).click();
  await page.getByRole("link", { name: "Stripe price", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Link Stripe price" })).toBeVisible();
  await page.getByRole("button", { name: "Load Stripe prices" }).click();
  await expect(page.getByRole("option", { name: "Pro monthly — £99.00" })).toBeAttached();
  expect(errors).toEqual([]);
});
