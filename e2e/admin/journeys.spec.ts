import { expect, test } from "@playwright/test";
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from "../helpers/navigation";

test.describe("Super admin browser journeys", () => {
  test("AI model filters and AI tools show deterministic results", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/admin/ai/models");
    await skipWhenRedirectedToLogin(page, "AI model journey requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: /AI Models/i })).toBeVisible();
    await expect(page.getByText("E2E Primary Model")).toBeVisible();
    await expect(page.getByText(/Showing 1-15 of 18/i)).toBeVisible();

    await page.getByRole("button", { name: "Active", exact: true }).click();
    await expect(page.getByText(/Showing 1-15 of 16/i)).toBeVisible();
    await expect(page.getByText("Online").first()).toBeVisible();

    await page.getByRole("button", { name: "Inactive", exact: true }).click();
    await expect(page.getByText(/Showing 1-2 of 2/i)).toBeVisible();
    await expect(page.getByText("E2E Model 17")).toBeVisible();
    await expect(page.getByText("Offline").first()).toBeVisible();

    await page.getByRole("button", { name: "All", exact: true }).click();
    await expect(page.getByText(/Showing 1-15 of 18/i)).toBeVisible();

    await gotoWithoutServerCrash(page, "/admin/ai/tools");
    await skipWhenRedirectedToLogin(page, "AI tool journey requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: "Connectors" })).toBeVisible();
    await expect(page.getByText("Rightmove Connector")).toBeVisible();
    await expect(page.getByText(/Property search connector/i)).toBeVisible();
  });

  test("user management exposes searchable identities and edit controls", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/admin/users");
    await skipWhenRedirectedToLogin(page, "User management journey requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: /Access & Identity Control/i })).toBeVisible();
    await expect(page.getByRole("link", { name: /Invite Intelligence/i })).toBeVisible();
    await expect(page.getByText("E2E User")).toBeVisible();

    await page.getByPlaceholder(/Search users/i).fill("super");
    await expect(page.getByText("E2E Super Admin").first()).toBeVisible();

    await page.getByPlaceholder(/Search users/i).fill("user.e2e");
    const userRow = page.getByRole("row", { name: /E2E User user\.e2e@example\.com/i });
    await expect(userRow).toBeVisible();
    await userRow.hover();
    await userRow.locator("button").first().click();

    await expect(page.getByText(/Edit Protocol Identity/i)).toBeVisible();
    await expect(page.getByPlaceholder(/John Doe/i)).toHaveValue("E2E User");
    await expect(page.getByPlaceholder(/john@sonae\.ai/i)).toHaveValue("user.e2e@example.com");
  });
});
