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
    await expect(page.getByText("Peak Squat", { exact: true })).toBeVisible();
    await expect(page.getByText(/body\d+\.\d+/)).toBeVisible();
    await expect(page.getByText("Instructor Diagnostics")).toBeVisible();
  });

  test("debug player poses drive the actual play route with replay-aligned owners", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=far-squat`,
    );
    await skipWhenRedirectedToLogin(page, "Movement play debug pose proof requires the super-admin storage state.");

    await expect(page.getByText("Your Avatar Diagnostics")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/lower player-stable-squat/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("lower player-stable-squat; feet recorded-retarget", { exact: true })).toBeVisible();
    await expect(page.getByText("Spine readiness")).toHaveCount(2);
    await expect(page.getByText(/ready \d+%/i).first()).toBeVisible();
    await expect(page.getByText("Truth readiness")).toHaveCount(2);
    await expect(page.getByText(/facing-player L->avatarRight R->avatarLeft/i)).toHaveCount(2);
    await expect(page.getByText(/player-left-leg-raise/i)).toHaveCount(0);
    await expect(page.getByText(/player-right-leg-raise/i)).toHaveCount(0);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=far-left-leg-raise`,
    );

    await expect(page.getByText("Your Avatar Diagnostics")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/lower player-right-leg-raise/i)).toBeVisible({ timeout: 30000 });
    await expect(page.getByText(/player-stable-squat/i)).toHaveCount(0);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=weak-feet-standing`,
    );

    await expect(page.getByText("Your Avatar Diagnostics")).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("movement-hud-setup-recovery-cue")).toHaveText("Show both feet.");
  });

  test("debug recorded game frame keeps paused player and instructor sync measurable", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugGameFrame=2`,
    );
    await skipWhenRedirectedToLogin(page, "Movement debug frame proof requires the super-admin storage state.");

    await expect(page.getByText("Debug Scrub")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Instructor Diagnostics")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Your Avatar Diagnostics")).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Studio Ready")).toBeVisible();
    await expect(page.getByTestId("movement-hud-posture-sync")).not.toHaveText("0%");
  });

  test("debug start gate blocks weak spine setup before practice starts", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=weak-spine-standing&debugStartGate=1`,
    );
    await skipWhenRedirectedToLogin(page, "Movement start-gate proof requires the super-admin storage state.");

    await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Spine blocked").first()).toBeVisible({ timeout: 30000 });
    await expect(page.getByText("Step back until head, shoulders, and hips are visible.")).toBeVisible();

    await page.getByRole("button", { name: "Start practice" }).click();

    await expect(page.getByText("Get Ready", { exact: true })).toBeVisible();
    await expect(page.getByText("Line up your spine first.")).toBeVisible({ timeout: 8000 });
    await expect(page.getByText("Check Setup")).toBeVisible();
    await expect(page.getByText("Guided Practice")).toHaveCount(0);
  });

  test("debug start gate blocks weak feet setup before practice starts", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=weak-feet-standing&debugStartGate=1`,
    );
    await skipWhenRedirectedToLogin(page, "Movement start-gate proof requires the super-admin storage state.");

    await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId("movement-hud-setup-recovery-cue")).toHaveText("Show both feet.");

    await page.getByRole("button", { name: "Start practice" }).click();

    await expect(page.getByText("Get Ready", { exact: true })).toBeVisible();
    await expect(page.getByText("Check Setup")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("movement-hud-setup-recovery-cue")).toHaveText("Show both feet.");
    await expect(page.getByText("Guided Practice")).toHaveCount(0);
  });

  test("replay lab renders deterministic debug sessions and capture targets", async ({ page }) => {
    await gotoWithoutServerCrash(page, "/demos/movements/replay-lab");
    await skipWhenRedirectedToLogin(page, "Movement replay lab smoke requires the super-admin storage state.");

    await expect(page.getByRole("heading", { name: "Replay Alignment" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Run Selected Recordings" })).toBeVisible();
    await expect(page.getByTestId("movement-replay-session")).toBeVisible();
    await expect(page.getByTestId("movement-replay-source-canvas")).toBeVisible();
    await expect(page.getByTestId("movement-replay-avatar-section")).toBeVisible();
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-next-proof-rehearsal-count",
      "2",
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-next-proof-rehearsal-readiness",
      "needs-selection",
    );
    await expect(page.getByTestId("movement-replay-proof-rehearsal")).toBeVisible();
    await expect(page.getByTestId("movement-replay-proof-rehearsal-readiness")).toContainText("Ready to record?");
    await expect(page.getByTestId("movement-replay-proof-rehearsal-readiness")).toContainText("Select recordings first");
    await expect(page.getByTestId("movement-replay-proof-rehearsal-item")).toHaveCount(2);
    await expect(page.getByTestId("movement-replay-proof-rehearsal")).toContainText("movement-proof-root-travel");
    await expect(page.getByTestId("movement-replay-proof-rehearsal")).toContainText("movement-proof-seated-forward-fold");
    await expect(page.getByTestId("movement-replay-proof-rehearsal")).toContainText("no clear root path is visible");
    await expect(page.getByTestId("movement-replay-proof-rehearsal")).toContainText("Chair contact is hidden or unstable");
    await expect(page.getByTestId("movement-replay-proof-rehearsal-candidate-summary")).toContainText("0/2 at threshold");
    await expect(page.getByTestId("movement-replay-proof-rehearsal-candidate-summary")).toContainText("0 below threshold · 2 missing");
    await expect(page.getByTestId("movement-replay-proof-rehearsal-candidate-summary")).toHaveAttribute(
      "data-missing-count",
      "2",
    );
    await expect(page.getByTestId("movement-replay-proof-rehearsal-evidence")).toHaveCount(2);
    await expect(page.getByTestId("movement-replay-proof-rehearsal-evidence").first()).toContainText("No matching frame");
    await expect(page.getByTestId("movement-replay-proof-rehearsal-score")).toHaveCount(2);
    await expect(page.getByTestId("movement-replay-proof-rehearsal-score").first()).toContainText("0.00 / 0.16 (0%)");
    await expect(page.getByRole("button", { name: "Jump Evidence" }).first()).toBeDisabled();
    await expect(page.getByRole("button", { name: /Select All \d+/ })).toBeVisible();
    await expect(page.getByTestId("movement-replay-frame")).toHaveCount(0);
    await page.getByTestId("movement-replay-session").first().click();
    await expect(page.getByTestId("movement-replay-frame")).toHaveCount(4);
    await expect(page.getByTestId("movement-replay-frame").first()).toHaveAttribute(
      "data-replay-studio-frame-status",
      /^(blocked|review|pass|)$/,
    );
    await expect(page.getByTestId("movement-replay-frame").first()).toHaveAttribute(
      "data-replay-studio-failure-codes",
      /.*/,
    );
    await expect(page.getByTestId("movement-replay-frame").first()).toHaveAttribute(
      "data-replay-studio-next-fix-area",
      /.*/,
    );
    await expect(page.getByTestId("movement-replay-game-path")).toBeVisible();
    await expect(page.getByTestId("movement-replay-game-path")).toContainText("Game lower / feet");
    await expect(page.getByTestId("movement-replay-avatar-follow")).toBeVisible();
    await expect(page.getByTestId("movement-replay-avatar-follow")).toContainText("Avatar Follow");
    await expect(page.getByTestId("movement-replay-avatar-follow")).toContainText("Judge");
    await expect(page.getByTestId("movement-replay-avatar-follow")).toContainText("Visual match");
    await expect(page.getByTestId("movement-replay-export-fix-log")).toBeVisible();
    await expect(page.getByTestId("movement-replay-studio-judge-status")).toBeVisible();
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-avatar-follow-status",
      /^(blocked|review|pass|--)$/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-replay-studio-frame-status",
      /^(blocked|review|pass|)$/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-replay-studio-session-status",
      /^(blocked|review|pass|)$/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-avatar-follow-session-issue-count",
      /\d+/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-avatar-follow-status",
      "blocked",
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-avatar-follow-acceptance-status",
      "blocked-for-acceptance",
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-avatar-follow-head-status",
      "blocked",
    );
    const avatarFollowErrorIssue = page.locator(
      '[data-testid="movement-replay-avatar-follow-issue"][data-avatar-follow-issue-severity="error"]',
    );
    await expect(avatarFollowErrorIssue.first()).toContainText(
      "no persisted VRM bone telemetry",
    );
    await expect(page.getByTestId("movement-replay-start-gate")).toBeVisible();
    await expect(page.getByTestId("movement-replay-start-gate")).toContainText("Start Gate");
    await expect(page.getByTestId("movement-replay-start-gate")).toContainText("Top Messages");
    await expect(page.getByTestId("movement-replay-start-gate-message").first()).toBeVisible();
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-current-start-readiness-message",
      /.+/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-start-readiness-top-messages",
      /.+/,
    );
    await page.getByRole("button", { name: /Select All \d+/ }).click();
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-next-proof-rehearsal-readiness",
      "needs-run",
    );
    await expect(page.getByTestId("movement-replay-proof-rehearsal-readiness")).toContainText("Run selected recordings");
    await page.getByRole("button", { name: "Run Selected Recordings" }).click();
    await expect(page.getByTestId("movement-replay-run-status")).toContainText(/Run 1 complete/);
    await expect(page.getByTestId("movement-replay-avatar-follow-batch")).toBeVisible();
    await expect(page.getByTestId("movement-replay-avatar-follow-batch-item").first()).toBeVisible();
    await expect(page.getByTestId("movement-replay-avatar-follow-batch-item").first()).toHaveAttribute(
      "data-avatar-follow-status",
      /^(blocked|review|pass)$/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-avatar-follow-batch-worst-status",
      /^(blocked|review|pass)$/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-avatar-follow-batch-worst-issue",
      /.+/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-start-readiness-batch-blocked-recording-count",
      /\d+/,
    );
    await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
      "data-start-readiness-batch-top-message",
      /.+/,
    );
    await expect(page.getByTestId("movement-replay-setup-review")).toBeVisible();
    const blockedSetupRecordingCount = await page
      .getByTestId("movement-replay-lab")
      .getAttribute("data-start-readiness-batch-blocked-recording-count");
    if (Number(blockedSetupRecordingCount ?? 0) > 0) {
      await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
        "data-next-proof-rehearsal-readiness",
        "setup-blocked",
      );
      await expect(page.getByTestId("movement-replay-proof-rehearsal-readiness")).toContainText("Fix setup blockers first");
      await expect(page.getByTestId("movement-replay-setup-review-item").first()).toBeVisible();
      await expect(page.getByTestId("movement-replay-setup-review-item").first()).toContainText("blocked");
    } else {
      await expect(page.getByTestId("movement-replay-lab")).toHaveAttribute(
        "data-next-proof-rehearsal-readiness",
        "ready",
      );
      await expect(page.getByTestId("movement-replay-proof-rehearsal-readiness")).toContainText("Ready to rehearse proof");
      await expect(page.getByTestId("movement-replay-setup-review")).toContainText("No setup blockers");
    }
    await expect(page.getByTestId("movement-replay-session-setup-summary").first()).toBeVisible();
    await expect(page.getByTestId("movement-replay-session-setup-summary").first()).toContainText("Setup");
    await expect(page.getByRole("button", { name: "Scene PNG" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Source Strip" })).toBeVisible();
    await page.getByRole("button", { name: "Source Strip" }).click();
    await expect(page.getByTestId("movement-replay-capture-status")).toContainText("setup labels");
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
