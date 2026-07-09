#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const defaultBaseUrl = "http://localhost:3000";
const defaultOutDir = "tmp/movement-replay-lab/captures";
const defaultStorageState = "e2e/.auth/super-admin.json";

function printHelp() {
  console.log(`Capture Movement Replay Lab proof images.

Usage:
  npm run movement:replay:capture -- [options]

Options:
  --base-url <url>        App URL. Defaults to ${defaultBaseUrl}
  --out <dir>            Output directory. Defaults to ${defaultOutDir}
  --storage-state <file> Playwright storage state to reuse for auth
  --session <id-title-tail> Click the matching session before capture
  --debug-session-json <file>
                         Serve one exported Replay Lab session fixture in local/dev capture mode
  --frames <list|auto>   Comma-separated frame indexes, or auto. Defaults to auto
  --local-test-auth      Sign in through /local-test-auth before capture
  --role <role>          Local-test-auth role. Defaults to super-admin
  --secret <secret>      Local-test-auth secret. Defaults to LOCAL_TEST_AUTH_SECRET
  --headed               Show the browser while capturing
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    frames: "auto",
    debugSessionJson: "",
    headed: false,
    localTestAuth: false,
    outDir: defaultOutDir,
    role: "super-admin",
    session: "",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--headed") {
      args.headed = true;
    } else if (arg === "--local-test-auth") {
      args.localTestAuth = true;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] || args.baseUrl;
    } else if (arg === "--out") {
      args.outDir = argv[++index] || args.outDir;
    } else if (arg === "--storage-state") {
      args.storageState = argv[++index] || "";
    } else if (arg === "--session") {
      args.session = argv[++index] || "";
    } else if (arg === "--debug-session-json") {
      args.debugSessionJson = argv[++index] || "";
    } else if (arg === "--frames") {
      args.frames = argv[++index] || "auto";
    } else if (arg === "--role") {
      args.role = argv[++index] || "super-admin";
    } else if (arg === "--secret") {
      args.secret = argv[++index] || "";
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return args;
}

async function fileExists(filePath) {
  try {
    await access(filePath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

function sanitizeFilePart(value) {
  return String(value || "unknown").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 80);
}

function replayUrl(baseUrl, args) {
  const url = new URL("/demos/movements/replay-lab", baseUrl.replace(/\/$/, ""));
  if (args.debugSessionJson) {
    url.searchParams.set("debugReplaySessionUrl", "/__movement-replay-session.json");
  }
  return url.toString();
}

function parseFrameSelection(value, frameCount) {
  if (frameCount <= 0) return [];
  if (!value || value === "auto") {
    return Array.from(new Set([
      0,
      Math.max(0, Math.floor((frameCount - 1) / 2)),
      frameCount - 1,
    ])).sort((left, right) => left - right);
  }

  return Array.from(new Set(
    value
      .split(",")
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((frame) => Number.isFinite(frame))
      .map((frame) => Math.max(0, Math.min(frame, frameCount - 1))),
  )).sort((left, right) => left - right);
}

async function selectSession(page, session) {
  await page.getByTestId("movement-replay-session").first().waitFor({ state: "visible" });

  if (!session) {
    const firstSession = page.getByTestId("movement-replay-session").first();
    await firstSession.click();
    return;
  }

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const exact = page.locator(`[data-testid="movement-replay-session"][data-session-id="${session}"]`);
    const partial = page.locator(`[data-testid="movement-replay-session"][data-session-id*="${session}"]`);
    const title = page.getByTestId("movement-replay-session").filter({ hasText: session });
    const target = await exact.count() > 0
      ? exact.first()
      : await partial.count() > 0
        ? partial.first()
        : await title.count() > 0 ? title.first() : null;

    if (target) {
      await target.click();
      return;
    }

    await page.waitForTimeout(500);
  }

  const available = await page.getByTestId("movement-replay-session").evaluateAll((nodes) => (
    nodes.map((node) => node.getAttribute("data-session-id")).filter(Boolean)
  ));
  throw new Error(`No replay session matched "${session}". Available sessions: ${available.join(", ") || "none"}.`);
}

async function signInWithLocalTestAuth(page, args) {
  if (!args.secret) {
    throw new Error("--local-test-auth requires --secret or LOCAL_TEST_AUTH_SECRET.");
  }

  const url = new URL("/local-test-auth", args.baseUrl);
  url.searchParams.set("role", args.role);
  url.searchParams.set("secret", args.secret);
  url.searchParams.set("redirectTo", "/demos/movements/replay-lab");

  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

  const authError = page.getByTestId("local-test-auth-error");
  await Promise.race([
    page.waitForURL((currentUrl) => currentUrl.pathname === "/demos/movements/replay-lab", { timeout: 45_000 }),
    authError.waitFor({ state: "visible", timeout: 45_000 }).then(async () => {
      const message = await authError.textContent();
      throw new Error(message || "Local test auth failed.");
    }),
  ]);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const storageState = args.storageState || (await fileExists(defaultStorageState) ? defaultStorageState : "");
  await mkdir(args.outDir, { recursive: true });

  const browser = await chromium.launch({ headless: !args.headed });
  try {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);

    if (args.localTestAuth) {
      await signInWithLocalTestAuth(page, args);
    }

    if (args.debugSessionJson) {
      await page.route("**/__movement-replay-session.json", (route) => route.fulfill({
        contentType: "application/json",
        path: path.resolve(args.debugSessionJson),
      }));
    }

    await page.goto(replayUrl(args.baseUrl, args), { waitUntil: "domcontentloaded" });

    const currentUrl = new URL(page.url());
    if (currentUrl.pathname === "/login") {
      throw new Error(
        `Replay lab redirected to /login. Pass --storage-state for an authenticated session, or restart the dev app with LOCAL_TEST_AUTH_ENABLED=1 and run with --local-test-auth.`,
      );
    }

    const lab = page.getByTestId("movement-replay-lab");
    await lab.waitFor();
    await selectSession(page, args.session);

    await page.getByTestId("movement-replay-source-canvas").waitFor();
    await page.getByTestId("movement-replay-avatar-scene").waitFor();
    await page.waitForTimeout(2_000);

    const labMeta = await lab.evaluate((element) => ({
      frameCount: Number(element.getAttribute("data-frame-count") || "0"),
      sessionId: element.getAttribute("data-active-session-id") || "",
    }));
    if (labMeta.frameCount <= 0) {
      throw new Error("Replay lab loaded, but no frames were available to capture.");
    }

    const frames = parseFrameSelection(args.frames, labMeta.frameCount);
    if (frames.length === 0) {
      throw new Error("No valid frame indexes selected.");
    }

    const sessionPart = sanitizeFilePart(labMeta.sessionId.slice(-8) || args.session || "latest");
    const captures = [];

    await page.screenshot({
      fullPage: false,
      path: path.join(args.outDir, `movement-replay-${sessionPart}-page.png`),
    });

    for (const frame of frames) {
      const frameButton = page.locator(`[data-testid="movement-replay-frame"][data-frame-index="${frame}"]`);
      if (await frameButton.count() > 0) {
        await frameButton.first().click();
      }
      await page.waitForTimeout(800);

      const avatarPath = path.join(args.outDir, `movement-replay-${sessionPart}-avatar-frame-${frame}.png`);
      const sourcePath = path.join(args.outDir, `movement-replay-${sessionPart}-source-frame-${frame}.png`);
      const diagnostics = await lab.evaluate((element) => {
        const readNumberAttr = (name) => {
          const value = element.getAttribute(name);
          if (value === null || value === "") return null;
          const parsed = Number(value);
          return Number.isFinite(parsed) ? parsed : null;
        };

        return {
          avatarLowerError: readNumberAttr("data-avatar-lower-error"),
          avatarRootAppliedX: readNumberAttr("data-avatar-root-applied-x"),
          avatarRootAppliedYaw: readNumberAttr("data-avatar-root-applied-yaw"),
          avatarRootAppliedZ: readNumberAttr("data-avatar-root-applied-z"),
          avatarRootSource: element.getAttribute("data-avatar-root-source") || null,
          avatarRootTargetX: readNumberAttr("data-avatar-root-target-x"),
          avatarRootTargetYaw: readNumberAttr("data-avatar-root-target-yaw"),
          avatarRootTargetZ: readNumberAttr("data-avatar-root-target-z"),
          avatarUpperError: readNumberAttr("data-avatar-upper-error"),
          avatarFollowAcceptanceStatus: element.getAttribute("data-avatar-follow-acceptance-status") || null,
          avatarFollowArmError: readNumberAttr("data-avatar-follow-current-arm-error"),
          avatarFollowArmStatus: element.getAttribute("data-avatar-follow-arm-status") || null,
          avatarFollowCurrentFailureCodes: element.getAttribute("data-avatar-follow-current-failure-codes") || null,
          avatarFollowFootError: readNumberAttr("data-avatar-follow-current-foot-error"),
          avatarFollowFootStatus: element.getAttribute("data-avatar-follow-foot-status") || null,
          avatarFollowHeadStatus: element.getAttribute("data-avatar-follow-head-status") || null,
          avatarFollowLeftFootClearance: readNumberAttr("data-avatar-follow-current-left-foot-clearance"),
          avatarFollowLeftFootError: readNumberAttr("data-avatar-follow-current-left-foot-error"),
          avatarFollowLeftShinError: readNumberAttr("data-avatar-follow-current-left-shin-error"),
          avatarFollowLeftShinAvatarDirection:
            element.getAttribute("data-avatar-follow-current-left-shin-avatar-direction") || null,
          avatarFollowLeftShinSourceDirection:
            element.getAttribute("data-avatar-follow-current-left-shin-source-direction") || null,
          avatarFollowPlantedFootClearance: readNumberAttr("data-avatar-follow-current-planted-foot-clearance"),
          avatarFollowRightFootClearance: readNumberAttr("data-avatar-follow-current-right-foot-clearance"),
          avatarFollowRightFootError: readNumberAttr("data-avatar-follow-current-right-foot-error"),
          avatarFollowRightShinError: readNumberAttr("data-avatar-follow-current-right-shin-error"),
          avatarFollowRightShinAvatarDirection:
            element.getAttribute("data-avatar-follow-current-right-shin-avatar-direction") || null,
          avatarFollowRightShinSourceDirection:
            element.getAttribute("data-avatar-follow-current-right-shin-source-direction") || null,
          avatarFollowSpineError: readNumberAttr("data-avatar-follow-current-spine-error"),
          avatarFollowSpineAvatarDirection:
            element.getAttribute("data-avatar-follow-current-spine-avatar-direction") || null,
          avatarFollowSpineSourceDirection:
            element.getAttribute("data-avatar-follow-current-spine-source-direction") || null,
          avatarFollowSpineStatus: element.getAttribute("data-avatar-follow-spine-status") || null,
          avatarFollowStatus: element.getAttribute("data-avatar-follow-status") || null,
          cameraConfidenceLostFrameCount: readNumberAttr("data-camera-confidence-lost-frame-count"),
          cameraConfidencePartialFrameCount: readNumberAttr("data-camera-confidence-partial-frame-count"),
          cameraConfidenceReadyFrameCount: readNumberAttr("data-camera-confidence-ready-frame-count"),
          cameraConfidenceUncertainFrameCount: readNumberAttr("data-camera-confidence-uncertain-frame-count"),
          cameraHelpEventCount: readNumberAttr("data-camera-help-event-count"),
          cameraScoreAllowedFrameCount: readNumberAttr("data-camera-score-allowed-frame-count"),
          coverageExplicitCount: readNumberAttr("data-coverage-explicit-count"),
          coverageFamilyCount: readNumberAttr("data-coverage-family-count"),
          coverageInternalDemoOnlyCount: readNumberAttr("data-coverage-internal-demo-only-count"),
          coverageInternalDemoOnlyFamilies: element.getAttribute("data-coverage-internal-demo-only-families") || null,
          coverageMissingProofCount: readNumberAttr("data-coverage-missing-proof-count"),
          coverageMissingProofFamilies: element.getAttribute("data-coverage-missing-proof-families") || null,
          coveragePhaseComplete: element.getAttribute("data-coverage-phase-complete") || null,
          coverageUnsupportedCount: readNumberAttr("data-coverage-unsupported-count"),
          coverageUnsupportedFamilies: element.getAttribute("data-coverage-unsupported-families") || null,
          coverageUserFacingCount: readNumberAttr("data-coverage-user-facing-count"),
          coverageUserFacingFamilies: element.getAttribute("data-coverage-user-facing-families") || null,
          currentCameraHelpEvents: element.getAttribute("data-current-camera-help-events") || null,
          currentCameraReasons: element.getAttribute("data-current-camera-reasons") || null,
          currentCameraScore: readNumberAttr("data-current-camera-score"),
          currentCameraState: element.getAttribute("data-current-camera-state") || null,
          currentFrameVisibility: readNumberAttr("data-current-frame-visibility"),
          currentScoreAllowed: element.getAttribute("data-current-score-allowed") || null,
          currentSourceOrigin: element.getAttribute("data-current-source-origin") || null,
          currentSourceStatus: element.getAttribute("data-current-source-status") || null,
          currentStartReadiness: element.getAttribute("data-current-start-readiness") || null,
          currentStartReadinessBlockedReasons: element.getAttribute("data-current-start-readiness-blocked-reasons") || null,
          currentStartReadinessPrompts: element.getAttribute("data-current-start-readiness-prompts") || null,
          currentVisibleBodyParts: element.getAttribute("data-current-visible-body-parts") || null,
          frameIndex: readNumberAttr("data-current-frame-index"),
          feetOwner: element.getAttribute("data-feet-owner") || null,
          gameLowerBodyTargetCanUsePlayerRetargetLegRaise: element.getAttribute("data-game-lower-body-target-can-use-player-retarget-leg-raise") || null,
          gameLowerBodyTargetInstructorMotion: readNumberAttr("data-game-lower-body-target-instructor-motion"),
          gameLowerBodyTargetPlayerRetargetMotion: readNumberAttr("data-game-lower-body-target-player-retarget-motion"),
          gameLowerBodyTargetShouldHoldPlayerSquat: element.getAttribute("data-game-lower-body-target-should-hold-player-squat") || null,
          gameLowerBodyTargetStage: element.getAttribute("data-game-lower-body-target-stage") || null,
          gameplayClearMovementEventCount: readNumberAttr("data-gameplay-clear-movement-event-count"),
          gameplayScoreDeltaTotal: readNumberAttr("data-gameplay-score-delta-total"),
          gameplayTrackingUncertaintyEventCount: readNumberAttr("data-gameplay-tracking-uncertainty-event-count"),
          headAppliedYaw: readNumberAttr("data-head-applied-yaw"),
          headOwner: element.getAttribute("data-head-owner") || null,
          headRawConfidence: readNumberAttr("data-head-raw-confidence"),
          headRawSource: element.getAttribute("data-head-raw-source") || null,
          headRawYaw: readNumberAttr("data-head-raw-yaw"),
          legRaiseAppliedDepth: readNumberAttr("data-leg-raise-applied-depth"),
          legRaiseExpiresInMs: readNumberAttr("data-leg-raise-expires-in-ms"),
          legRaiseHoldActive: element.getAttribute("data-leg-raise-hold-active") || null,
          legRaiseRawLeftDepth: readNumberAttr("data-leg-raise-raw-left-depth"),
          legRaiseRawRightDepth: readNumberAttr("data-leg-raise-raw-right-depth"),
          legRaiseSide: element.getAttribute("data-leg-raise-side") || null,
          lowerOwner: element.getAttribute("data-lower-owner") || null,
          motionFrameInput: element.getAttribute("data-motion-frame-input") || null,
          retargetLeftKnee: readNumberAttr("data-retarget-left-knee"),
          retargetRightKnee: readNumberAttr("data-retarget-right-knee"),
          rootHeadingConfidence: readNumberAttr("data-root-heading-confidence"),
          rootHeadingYaw: readNumberAttr("data-root-heading-yaw"),
          rootIntentKey: element.getAttribute("data-root-intent-key") || null,
          rootIntentLabel: element.getAttribute("data-root-intent-label") || null,
          rootIntentPlantedFoot: element.getAttribute("data-root-intent-planted-foot") || null,
          rootIntentSwingFoot: element.getAttribute("data-root-intent-swing-foot") || null,
          rootIntentTravelDirection: element.getAttribute("data-root-intent-travel-direction") || null,
          rootIntentTravelDistance: readNumberAttr("data-root-intent-travel-distance"),
          rootJumpCount: readNumberAttr("data-root-jump-count"),
          rootPathDistance: readNumberAttr("data-root-path-distance"),
          rootPivotCount: readNumberAttr("data-root-pivot-count"),
          rootPositionConfidence: readNumberAttr("data-root-position-confidence"),
          rootSource: element.getAttribute("data-root-source") || null,
          rootSourceLimitedCount: readNumberAttr("data-root-source-limited-count"),
          rootStepCount: readNumberAttr("data-root-step-count"),
          rootTravelCount: readNumberAttr("data-root-travel-count"),
          rootTurnCount: readNumberAttr("data-root-turn-count"),
          rootWeightTransferCount: readNumberAttr("data-root-weight-transfer-count"),
          rootWorldCount: readNumberAttr("data-root-world-count"),
          spineConfidence: readNumberAttr("data-spine-confidence"),
          spineForwardLean: readNumberAttr("data-spine-forward-lean"),
          spineOwner: element.getAttribute("data-spine-owner") || null,
          spineSideBend: readNumberAttr("data-spine-side-bend"),
          spineTwist: readNumberAttr("data-spine-twist"),
          startReadinessBlockedFrameCount: readNumberAttr("data-start-readiness-blocked-frame-count"),
          startReadinessCanStartGameFrameCount: readNumberAttr("data-start-readiness-can-start-game-frame-count"),
          startReadinessReadyFrameCount: readNumberAttr("data-start-readiness-ready-frame-count"),
        };
      });

      await page.getByTestId("movement-replay-avatar-section").screenshot({ path: avatarPath });
      await page.getByTestId("movement-replay-source-canvas").screenshot({ path: sourcePath });

      captures.push({
        avatarPath,
        diagnostics,
        frame,
        sourcePath,
      });
    }

    const manifest = {
      baseUrl: args.baseUrl,
      capturedAt: new Date().toISOString(),
      captures,
      frameCount: labMeta.frameCount,
      frames,
      sessionId: labMeta.sessionId,
      storageState: storageState || null,
    };
    const manifestPath = path.join(args.outDir, `movement-replay-${sessionPart}-manifest.json`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`Captured ${captures.length} replay frame(s) for ${labMeta.sessionId || "latest session"}.`);
    console.log(`Wrote ${path.resolve(args.outDir)}`);

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
