import { expect, test } from "@playwright/test";
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from "./helpers/navigation";

const movementId = "movement_e2e_roll_down";

test.describe("Movement Demo: Authenticated Smoke", () => {
  test("library renders deterministic movement data", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movements");
    await skipWhenRedirectedToLogin(page, "Movement library smoke requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: "Posture Studio Library" })).toBeVisible();
    await expect(page.getByText("E2E Roll Down")).toBeVisible();
    await expect(page.getByRole("button", { name: "Roll down", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Roll down", exact: true }).click();
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

  test("guided preview route keeps avatar selection before practice starts", async ({ page }) => {
    await gotoWithoutServerCrash(page, `/demos/movements/${movementId}/play?guidedPreview=1`);
    await skipWhenRedirectedToLogin(page, "Movement guided preview smoke requires the super-admin storage state.");

    await expect(page.getByText("Private posture studio")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Select Coach & Student" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Begin Practice" })).toBeVisible();
  });

  test("guided debug preview enters recorded playback with scrub controls", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?guidedPreview=1&debugTracking=1`,
    );
    await skipWhenRedirectedToLogin(page, "Movement guided preview smoke requires the super-admin storage state.");

    await expect(page.getByText("Debug Scrub")).toBeVisible({ timeout: 30000 });
    await expect(page.getByRole("spinbutton", { name: "Debug frame number" })).toBeVisible();
    await expect(page.getByText("Peak Squat")).toBeVisible();
    await expect(page.getByText(/body\d+\.\d+/)).toBeVisible();
    await expect(page.getByText("Coach Diagnostics")).toBeVisible();
  });

  test("debug player poses drive the actual play route with replay-aligned owners", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=far-squat`,
    );
    await skipWhenRedirectedToLogin(page, "Movement play debug pose proof requires the super-admin storage state.");

    await expect(page.getByText("Student Diagnostics")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/lower player-stable-squat/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/feet recorded-retarget/i)).toBeVisible();
    await expect(page.getByText(/player-left-leg-raise/i)).toHaveCount(0);
    await expect(page.getByText(/player-right-leg-raise/i)).toHaveCount(0);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=far-left-leg-raise`,
    );

    await expect(page.getByText("Student Diagnostics")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/lower player-right-leg-raise/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/player-stable-squat/i)).toHaveCount(0);
  });

  test("replay lab renders deterministic debug sessions and capture targets", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movements/replay-lab");
    await skipWhenRedirectedToLogin(page, "Movement replay lab smoke requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: "Replay Alignment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run Selected Recordings" })).toBeVisible();
    await expect(page.getByTestId("movement-replay-session")).toBeVisible();
    await expect(page.getByTestId("movement-replay-source-canvas")).toBeVisible();
    await expect(page.getByTestId("movement-replay-avatar-section")).toBeVisible();
    await expect(page.getByTestId("movement-replay-frame")).toHaveCount(0);
    await page.getByTestId("movement-replay-session").first().click();
    await expect(page.getByTestId("movement-replay-frame")).toHaveCount(4);
    await expect(page.getByTestId("movement-replay-game-path")).toBeVisible();
    await expect(page.getByTestId("movement-replay-game-path")).toContainText("Game lower / feet");
    await page.getByRole("checkbox", { name: /Select recording/ }).first().check();
    await page.getByRole("button", { name: "Run Selected Recordings" }).click();
    await expect(page.getByTestId("movement-replay-run-status")).toContainText(/Run 1 complete/);
    await expect(page.getByRole("button", { name: "Scene PNG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Source Strip" })).toBeVisible();
  });

  test("sidebar Replay Alignment item opens the replay lab", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movements");
    await skipWhenRedirectedToLogin(page, "Movement replay lab sidebar smoke requires the super-admin storage state.");

    await page.getByRole("button", { name: "Posture Studio" }).click();
    await page.getByRole("link", { name: "Replay Alignment" }).click();

    await expect(page).toHaveURL(/\/demos\/movements\/replay-lab$/);
    await expect(page.getByRole("heading", { name: "Replay Alignment" })).toBeVisible();
  });
});
