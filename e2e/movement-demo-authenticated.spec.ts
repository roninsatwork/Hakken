import { expect, test } from "@playwright/test";
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from "./helpers/navigation";

const movementId = "movement_e2e_roll_down";

test.describe("Movement Demo: Authenticated Smoke", () => {
  test("library renders deterministic movement data", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movements");
    await skipWhenRedirectedToLogin(page, "Movement library smoke requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: "Posture Studio Library" })).toBeVisible();
    await expect(page.getByText("E2E Roll Down")).toBeVisible();
    await expect(page.getByRole("link", { name: "New Routine" })).toBeVisible();
  });

  test("capture route renders camera controls without shell crashes", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movement-capture");
    await skipWhenRedirectedToLogin(page, "Movement capture smoke requires the super-admin storage state.");

    await expect(page.getByRole("link", { name: "Back to Studio Library" })).toBeVisible();
    await expect(page.getByRole("button", { name: /posture capture/i })).toBeVisible();
    await expect(page.getByText(/Posture Tracking|Preparing posture model/i).first()).toBeVisible();
  });

  test("detail route renders the movement viewer and telemetry", async ({ page }) => {
    await gotoWithoutServerCrash(page, `/demos/movements/${movementId}`);
    await skipWhenRedirectedToLogin(page, "Movement detail smoke requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: /E2E Roll Down/i })).toBeVisible();
    await expect(page.getByText("Routine Summary")).toBeVisible();
    await expect(page.getByText("Posture Moments")).toBeVisible();
  });

  test("play route reaches the avatar lobby with deterministic frames loaded", async ({ page }) => {
    await gotoWithoutServerCrash(page, `/demos/movements/${movementId}/play`);
    await skipWhenRedirectedToLogin(page, "Movement play smoke requires the super-admin storage state.");

    await expect(page.getByText("Private posture studio")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Select Coach & Student" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Begin Practice" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Student", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Coach", exact: true })).toBeVisible();
  });
});
