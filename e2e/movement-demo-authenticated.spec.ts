import { expect, test } from "@playwright/test";
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from "./helpers/navigation";

const movementId = "movement_e2e_roll_down";

test.describe("Movement Demo: Authenticated Smoke", () => {
  test("library renders deterministic movement data", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movements");
    await skipWhenRedirectedToLogin(page, "Movement library smoke requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: "Movement Library" })).toBeVisible();
    await expect(page.getByText("E2E Roll Down")).toBeVisible();
    await expect(page.getByRole("link", { name: "New Capture" })).toBeVisible();
  });

  test("capture route renders camera controls without shell crashes", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movement-capture");
    await skipWhenRedirectedToLogin(page, "Movement capture smoke requires the super-admin storage state.");

    await expect(page.getByRole("link", { name: "Back to Library" })).toBeVisible();
    await expect(page.getByRole("button", { name: /movement capture/i })).toBeVisible();
    await expect(page.getByText(/AI Vision|Initializing Model/i).first()).toBeVisible();
  });

  test("detail route renders the movement viewer and telemetry", async ({ page }) => {
    await gotoWithoutServerCrash(page, `/demos/movements/${movementId}`);
    await skipWhenRedirectedToLogin(page, "Movement detail smoke requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: /E2E Roll Down/i })).toBeVisible();
    await expect(page.getByText("Telemetry Data")).toBeVisible();
    await expect(page.getByText("2 Captures")).toBeVisible();
  });

  test("play route reaches the avatar lobby with deterministic frames loaded", async ({ page }) => {
    await gotoWithoutServerCrash(page, `/demos/movements/${movementId}/play`);
    await skipWhenRedirectedToLogin(page, "Movement play smoke requires the super-admin storage state.");

    await expect(page.getByText("Movement Practice")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Choose Avatars" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Begin Session" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Player" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Instructor" })).toBeVisible();
  });
});
