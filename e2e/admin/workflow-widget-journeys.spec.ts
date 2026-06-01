import { expect, test } from "@playwright/test";
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from "../helpers/navigation";

test.describe("Admin widget and workflow journeys", () => {
  test("admin can edit company widget configuration and copy integration snippet", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/admin/companies/company_e2e/widget");
    await skipWhenRedirectedToLogin(page, "Widget journey requires an authenticated admin storage state.");

    await expect(page.getByRole("heading", { name: /Widget Deployer/i })).toBeVisible();

    const publicNameInput = page.getByPlaceholder(/Sales Assistant/i);
    await expect(publicNameInput).toHaveValue("E2E Website Bot");
    await publicNameInput.fill("Phase 6 Widget Bot");

    await page.getByRole("button", { name: /Integration/i }).click();
    await expect(page.getByText(/Authorized Domains/i)).toBeVisible();
    await page.getByPlaceholder(/example\.com/i).fill("example.com, app.example.com");
    await expect(page.getByText(/widget_e2e/i)).toBeVisible();

    await page.getByRole("button", { name: /Copy to clipboard/i }).click();
    await expect(page.getByRole("button", { name: /Copied/i })).toBeVisible();

    await page.getByRole("button", { name: /Publish Configuration/i }).click();
    await expect(page.getByRole("button", { name: /Publish Configuration/i })).toBeEnabled();
  });

  test("admin can create a workflow and verify schedules and logs", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/admin/workflows");
    await skipWhenRedirectedToLogin(page, "Workflow journey requires an authenticated admin storage state.");

    await expect(page.getByRole("heading", { name: /^Workflows$/i })).toBeVisible();
    await expect(page.getByText("E2E Workflow")).toBeVisible();

    await page.getByRole("button", { name: /New Workflow/i }).click();
    await expect(page.getByText(/Configure Workflow/i)).toBeVisible();
    await page.getByPlaceholder(/Market Research Flow/i).fill("Phase 6 Workflow");
    await page.getByPlaceholder(/Daily analysis/i).fill("Created by deterministic e2e journey.");
    await page.getByRole("button", { name: /Initialize Workflow/i }).click();

    await expect(page).toHaveURL(/\/admin\/workflows\/workflow_e2e_created/);
    await expect(page.getByRole("heading", { name: /Phase 6 Workflow/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Save Graph/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Manual Run/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Node Library/i })).toBeVisible();

    await gotoWithoutServerCrash(page, "/admin/workflows/schedules");
    await expect(page.getByRole("heading", { name: /^Schedules$/i })).toBeVisible();
    await expect(page.getByText("E2E Morning Schedule")).toBeVisible();
    await expect(page.getByText("Every day at 09:00")).toBeVisible();
    await page.getByTitle(/Force Dispatch/i).click();
    await expect(page.getByText(/Manual Dispatch Initiated/i)).toBeVisible();
    await page.getByRole("button", { name: /Got it/i }).click();

    await gotoWithoutServerCrash(page, "/admin/workflows/logs");
    await expect(page.getByRole("heading", { name: /Workflow Executions/i })).toBeVisible();
    await expect(page.getByText("E2E Workflow")).toBeVisible();
    await expect(page.getByText(/Success/i).first()).toBeVisible();
    await expect(page.getByText(/Completed deterministic browser journey/i)).toBeVisible();
  });
});
