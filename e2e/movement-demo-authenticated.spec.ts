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
    await expect(page.getByText(/same-side L->avatarLeft R->avatarRight/i)).toHaveCount(1);
    await expect(page.getByText(/facing-player L->avatarRight R->avatarLeft/i)).toHaveCount(1);
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

  test("rendered player bones follow mirror-side arms, head pitch, side bend, and raised legs", async ({ page }) => {
    const readPlayerDebug = async () => {
      await page.waitForFunction(() => Boolean(
        (window as Window & { __sonaeMovementAvatarDebug?: { player?: { avatarVisual?: unknown } } })
          .__sonaeMovementAvatarDebug?.player?.avatarVisual,
      ), undefined, { timeout: 30000 });
      return page.evaluate(() => (
        (window as Window & { __sonaeMovementAvatarDebug?: { player?: Record<string, unknown> } })
          .__sonaeMovementAvatarDebug?.player
      ));
    };

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=left-arm-raise`,
    );
    await skipWhenRedirectedToLogin(page, "Rendered mirror proof requires the super-admin storage state.");
    const armDebug = await readPlayerDebug() as {
      avatarVisual: { segments: Record<string, { direction: { y: number } }> };
    };
    expect(armDebug.avatarVisual.segments.rightUpperArm?.direction.y).toBeGreaterThan(0.25);
    expect(armDebug.avatarVisual.segments.leftUpperArm?.direction.y).toBeLessThan(-0.25);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=head-down`,
    );
    const headDebug = await readPlayerDebug() as {
      avatarHead: { bonePitch: number };
      headRaw: { pitch: number };
    };
    expect(Math.abs(headDebug.headRaw.pitch)).toBeGreaterThan(0.12);
    expect(Math.abs(headDebug.avatarHead.bonePitch)).toBeGreaterThan(0.08);
    expect(Math.sign(headDebug.avatarHead.bonePitch)).toBe(Math.sign(headDebug.headRaw.pitch));

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=side-bend`,
    );
    const sideBendDebug = await readPlayerDebug() as {
      avatarVisual: { segments: Record<string, { direction: { x: number } }> };
      spineDrive: { sideBend: number };
    };
    expect(Math.abs(sideBendDebug.spineDrive.sideBend)).toBeGreaterThan(0.4);
    expect(Math.abs(sideBendDebug.avatarVisual.segments.spine?.direction.x)).toBeGreaterThan(0.25);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=left-leg-raise`,
    );
    const legDebug = await readPlayerDebug() as {
      avatarVisual: { segments: Record<string, { direction: { y: number } }> };
    };
    expect(legDebug.avatarVisual.segments.rightThigh?.direction.y).toBeGreaterThan(0.2);
    expect(legDebug.avatarVisual.segments.leftThigh?.direction.y).toBeLessThan(-0.2);
  });

  test("rendered instructor and mirrored player converge on the same anatomical arm", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=right-arm-raise&debugPlayerPose=left-arm-raise`,
    );
    await skipWhenRedirectedToLogin(page, "Three-party mirror proof requires the super-admin storage state.");

    const instructor = page.locator('[data-movement-avatar-role="instructor"]');
    const player = page.locator('[data-movement-avatar-role="player"]');
    await expect(instructor).not.toHaveAttribute("data-movement-avatar-visual", "null", { timeout: 30000 });
    await expect(player).not.toHaveAttribute("data-movement-avatar-visual", "null", { timeout: 30000 });

    const instructorVisual = JSON.parse(
      (await instructor.getAttribute("data-movement-avatar-visual")) ?? "null",
    ) as { segments: Record<string, { direction: { y: number } }> };
    const playerVisual = JSON.parse(
      (await player.getAttribute("data-movement-avatar-visual")) ?? "null",
    ) as { segments: Record<string, { direction: { y: number } }> };

    await expect(instructor).toHaveAttribute(
      "data-movement-side-map",
      "same-side L->avatarLeft R->avatarRight",
    );
    await expect(player).toHaveAttribute(
      "data-movement-side-map",
      "facing-player L->avatarRight R->avatarLeft",
    );
    expect(instructorVisual.segments.rightUpperArm?.direction.y).toBeGreaterThan(0.25);
    expect(instructorVisual.segments.leftUpperArm?.direction.y).toBeLessThan(-0.25);
    expect(playerVisual.segments.rightUpperArm?.direction.y).toBeGreaterThan(0.25);
    expect(playerVisual.segments.leftUpperArm?.direction.y).toBeLessThan(-0.25);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=left-arm-raise&debugPlayerPose=right-arm-raise`,
    );
    await expect(instructor).not.toHaveAttribute("data-movement-avatar-visual", "null", { timeout: 30000 });
    await expect(player).not.toHaveAttribute("data-movement-avatar-visual", "null", { timeout: 30000 });

    const oppositeInstructorVisual = JSON.parse(
      (await instructor.getAttribute("data-movement-avatar-visual")) ?? "null",
    ) as { segments: Record<string, { direction: { y: number } }> };
    const oppositePlayerVisual = JSON.parse(
      (await player.getAttribute("data-movement-avatar-visual")) ?? "null",
    ) as { segments: Record<string, { direction: { y: number } }> };

    expect(oppositeInstructorVisual.segments.leftUpperArm?.direction.y).toBeGreaterThan(0.25);
    expect(oppositeInstructorVisual.segments.rightUpperArm?.direction.y).toBeLessThan(-0.25);
    expect(oppositePlayerVisual.segments.leftUpperArm?.direction.y).toBeGreaterThan(0.25);
    expect(oppositePlayerVisual.segments.rightUpperArm?.direction.y).toBeLessThan(-0.25);
  });

  test("rendered leg raises converge and keep the opposite planted foot on the floor", async ({ page }) => {
    const readLegTelemetry = async () => page.locator("[data-movement-avatar-role]").evaluateAll((elements) =>
      elements.map((element) => {
        const visual = JSON.parse(element.getAttribute("data-movement-avatar-visual") ?? "null") as {
          footing: {
            leftFootClearance: number;
            rightFootClearance: number;
          };
          segments: Record<string, { direction: { y: number } }>;
        };
        return {
          role: element.getAttribute("data-movement-avatar-role"),
          visual,
        };
      }),
    );

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=right-leg-raise&debugPlayerPose=left-leg-raise`,
    );
    await skipWhenRedirectedToLogin(page, "Three-party leg mirror proof requires the super-admin storage state.");
    await expect(page.locator('[data-movement-avatar-role="instructor"]')).not.toHaveAttribute(
      "data-movement-avatar-visual",
      "null",
      { timeout: 30000 },
    );

    const rightRaise = await readLegTelemetry();
    expect(rightRaise).toHaveLength(2);
    rightRaise.forEach(({ visual }) => {
      expect(visual.segments.rightThigh?.direction.y).toBeGreaterThan(0.25);
      expect(visual.segments.leftThigh?.direction.y).toBeLessThan(-0.25);
      expect(Math.abs(visual.footing.leftFootClearance)).toBeLessThanOrEqual(0.05);
      expect(visual.footing.rightFootClearance).toBeGreaterThan(0.5);
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=left-leg-raise&debugPlayerPose=right-leg-raise`,
    );
    await expect(page.locator('[data-movement-avatar-role="instructor"]')).not.toHaveAttribute(
      "data-movement-avatar-visual",
      "null",
      { timeout: 30000 },
    );

    const leftRaise = await readLegTelemetry();
    expect(leftRaise).toHaveLength(2);
    leftRaise.forEach(({ visual }) => {
      expect(visual.segments.leftThigh?.direction.y).toBeGreaterThan(0.25);
      expect(visual.segments.rightThigh?.direction.y).toBeLessThan(-0.25);
      expect(Math.abs(visual.footing.rightFootClearance)).toBeLessThanOrEqual(0.05);
      expect(visual.footing.leftFootClearance).toBeGreaterThan(0.5);
    });
  });

  test("rendered head and side-lean axes follow the three-party mirror contract", async ({ page }) => {
    const readAxialTelemetry = async () => page.locator("[data-movement-avatar-role]").evaluateAll((elements) =>
      elements.map((element) => {
        const visual = JSON.parse(element.getAttribute("data-movement-avatar-visual") ?? "null") as {
          segments: Record<string, { direction: { x: number } }>;
        };
        return {
          avatarHead: JSON.parse(element.getAttribute("data-movement-avatar-head") ?? "null") as {
            appliedLocalRoll: number;
            bonePitch: number;
            boneRoll: number;
            boneYaw: number;
          },
          avatarSpine: JSON.parse(element.getAttribute("data-movement-avatar-spine") ?? "null") as {
            chest: { y: number };
            upperChest: { y: number };
          },
          role: element.getAttribute("data-movement-avatar-role"),
          visual,
        };
      }),
    );
    const waitForAxialTelemetry = () => expect(
      page.locator('[data-movement-avatar-role="instructor"]'),
    ).not.toHaveAttribute("data-movement-avatar-head", "null", { timeout: 30000 });
    const waitForRenderedHeadRoll = (direction: -1 | 1) => expect.poll(
      async () => (await readAxialTelemetry()).every(({ avatarHead }) =>
        direction * avatarHead.boneRoll > 0.2 && direction * avatarHead.appliedLocalRoll > 0.04,
      ),
      { timeout: 30000 },
    ).toBe(true);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=head-down&debugPlayerPose=head-down`,
    );
    await skipWhenRedirectedToLogin(page, "Three-party axial proof requires the super-admin storage state.");
    await waitForAxialTelemetry();
    (await readAxialTelemetry()).forEach(({ avatarHead }) => {
      expect(avatarHead.bonePitch).toBeLessThan(-0.2);
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=head-right&debugPlayerPose=head-left`,
    );
    await waitForAxialTelemetry();
    (await readAxialTelemetry()).forEach(({ avatarHead }) => {
      expect(avatarHead.boneYaw).toBeLessThan(-0.3);
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=head-left&debugPlayerPose=head-right`,
    );
    await waitForAxialTelemetry();
    (await readAxialTelemetry()).forEach(({ avatarHead }) => {
      expect(avatarHead.boneYaw).toBeGreaterThan(0.3);
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=head-roll-right&debugPlayerPose=head-roll-left`,
    );
    await waitForAxialTelemetry();
    await waitForRenderedHeadRoll(1);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=head-roll-left&debugPlayerPose=head-roll-right`,
    );
    await waitForAxialTelemetry();
    await waitForRenderedHeadRoll(-1);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=side-bend-right&debugPlayerPose=side-bend-left`,
    );
    await waitForAxialTelemetry();
    (await readAxialTelemetry()).forEach(({ visual }) => {
      expect(visual.segments.spine?.direction.x).toBeLessThan(-0.15);
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=side-bend-left&debugPlayerPose=side-bend-right`,
    );
    await waitForAxialTelemetry();
    (await readAxialTelemetry()).forEach(({ visual }) => {
      expect(visual.segments.spine?.direction.x).toBeGreaterThan(0.15);
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=standing-twist-right&debugPlayerPose=standing-twist-left`,
    );
    await waitForAxialTelemetry();
    (await readAxialTelemetry()).forEach(({ avatarSpine }) => {
      expect(avatarSpine.chest.y).toBeLessThan(-0.04);
      expect(avatarSpine.upperChest.y).toBeLessThan(-0.03);
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=standing-twist-left&debugPlayerPose=standing-twist-right`,
    );
    await waitForAxialTelemetry();
    (await readAxialTelemetry()).forEach(({ avatarSpine }) => {
      expect(avatarSpine.chest.y).toBeGreaterThan(0.04);
      expect(avatarSpine.upperChest.y).toBeGreaterThan(0.03);
    });

    const readRootOffsets = async () => page.locator("[data-movement-avatar-role]").evaluateAll((elements) => {
      const offsets: Record<string, number> = {};
      elements.forEach((element) => {
        const role = element.getAttribute("data-movement-avatar-role");
        const root = JSON.parse(element.getAttribute("data-movement-avatar-root") ?? "null") as {
          targetX: number;
        } | null;
        if (!role || !root) return;
        offsets[role] = Number((root.targetX - (role === "instructor" ? -5 : 5)).toFixed(2));
      });
      return offsets;
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPoseTransition=1&debugInstructorPose=root-travel-right&debugPlayerPose=root-travel-left`,
    );
    await expect.poll(readRootOffsets, { intervals: [50, 100], timeout: 30000 }).toEqual({
      instructor: 0.58,
      player: 0.58,
    });

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPoseTransition=1&debugInstructorPose=root-travel-left&debugPlayerPose=root-travel-right`,
    );
    await expect.poll(readRootOffsets, { intervals: [50, 100], timeout: 30000 }).toEqual({
      instructor: -0.58,
      player: -0.58,
    });
  });

  test("rendered fingers and asymmetric face signals follow the three-party mirror contract", async ({ page }) => {
    const readHandAndFaceTelemetry = async () => page.locator("[data-movement-avatar-role]").evaluateAll((elements) =>
      elements.map((element) => ({
        expressions: JSON.parse(element.getAttribute("data-movement-avatar-expressions") ?? "null") as {
          blinkLeft: number | null;
          blinkRight: number | null;
        },
        hands: JSON.parse(element.getAttribute("data-movement-avatar-hands") ?? "null") as {
          left: { curlMagnitude: number };
          right: { curlMagnitude: number };
        },
      })),
    );
    const waitForHandSide = (side: "left" | "right") => expect.poll(
      async () => (await readHandAndFaceTelemetry()).every(({ hands }) =>
        hands[side].curlMagnitude > 3 && hands[side === "left" ? "right" : "left"].curlMagnitude < 0.1,
      ),
      { timeout: 30000 },
    ).toBe(true);
    const waitForWinkSide = (side: "Left" | "Right") => expect.poll(
      async () => (await readHandAndFaceTelemetry()).every(({ expressions }) =>
        (expressions[`blink${side}`] ?? 0) > 0.8 && (expressions[`blink${side === "Left" ? "Right" : "Left"}`] ?? 0) < 0.1,
      ),
      { timeout: 30000 },
    ).toBe(true);

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=right-hand-curl&debugPlayerPose=left-hand-curl`,
    );
    await skipWhenRedirectedToLogin(page, "Three-party hand and face proof requires the super-admin storage state.");
    await waitForHandSide("right");

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=left-hand-curl&debugPlayerPose=right-hand-curl`,
    );
    await waitForHandSide("left");

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=wink-right&debugPlayerPose=wink-left`,
    );
    await waitForWinkSide("Right");

    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugInstructorPose=wink-left&debugPlayerPose=wink-right`,
    );
    await waitForWinkSide("Left");
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

  test("debug start gate releases for fully framed feet with low detector confidence", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=weak-feet-standing&debugStartGate=1`,
    );
    await skipWhenRedirectedToLogin(page, "Movement start-gate proof requires the super-admin storage state.");

    await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible({ timeout: 30000 });

    await page.getByRole("button", { name: "Start practice" }).click();

    await expect(page.getByText("Get Ready", { exact: true })).toBeVisible();
    await expect(page.getByTestId("movement-game-start-countdown")).toBeVisible({ timeout: 10000 });
    await expect(page.getByTestId("movement-game-readiness-banner")).toHaveCount(0, { timeout: 10000 });
    await expect(page.getByRole("heading", { name: "Practice Complete" })).toBeVisible({ timeout: 10000 });
  });

  test("debug start gate keeps genuinely cropped lower-body coordinates blocked", async ({ page }) => {
    await gotoWithoutServerCrash(
      page,
      `/demos/movements/${movementId}/play?debugTracking=1&debugPlayerPose=lower-body-out-of-frame&debugStartGate=1`,
    );
    await skipWhenRedirectedToLogin(page, "Movement start-gate proof requires the super-admin storage state.");

    await expect(page.getByRole("button", { name: "Start practice" })).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: "Start practice" }).click();

    await expect(page.getByTestId("movement-game-readiness-banner")).toContainText(
      "Step back so your whole body is visible.",
      { timeout: 10000 },
    );
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
