#!/usr/bin/env node

import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";
import {
  buildReplaySliderSeekFidelity,
  parseReplaySliderSeekFrames,
  replaySliderSeekEventPasses,
  replaySliderTargetRatio,
} from "./lib/replaySliderSeekProof.mjs";

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
  --avatar-url <path>    VRM the replay avatar should load (default: lab default)
  --debug-session-json <file>
                         Serve one exported Replay Lab session fixture in local/dev capture mode
  --frames <list|auto>   Comma-separated frame indexes, or auto. Defaults to auto
  --slider-seek-frames <list>
                         Ordered frame targets for real slider-drag convergence proof
  --e2e-auth             Use the deterministic sonae_e2e_auth role cookie in memory
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
    e2eAuth: false,
    headed: false,
    localTestAuth: false,
    outDir: defaultOutDir,
    role: "super-admin",
    session: "",
    avatarUrl: "",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    sliderSeekFrames: "",
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
    } else if (arg === "--e2e-auth") {
      args.e2eAuth = true;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] || args.baseUrl;
    } else if (arg === "--out") {
      args.outDir = argv[++index] || args.outDir;
    } else if (arg === "--storage-state") {
      args.storageState = argv[++index] || "";
    } else if (arg === "--session") {
      args.session = argv[++index] || "";
    } else if (arg === "--avatar-url") {
      args.avatarUrl = argv[++index] || "";
    } else if (arg === "--debug-session-json") {
      args.debugSessionJson = argv[++index] || "";
    } else if (arg === "--frames") {
      args.frames = argv[++index] || "auto";
    } else if (arg === "--slider-seek-frames") {
      args.sliderSeekFrames = argv[++index] || "";
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
  if (args.avatarUrl) {
    url.searchParams.set("avatarUrl", args.avatarUrl);
  }
  if (args.sliderSeekFrames) {
    url.searchParams.set("debugDeterministicReplay", "1");
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

async function readPlayerAvatarDebug(page) {
  return page.evaluate(() => {
    const debug = window.__sonaeMovementAvatarDebug?.player;
    return debug ? structuredClone(debug) : null;
  });
}

async function waitForCleanSliderTelemetry(page, previousUpdatedAt, timeoutMs = 5_000) {
  const deadline = Date.now() + timeoutMs;
  let debug = null;
  let fidelity = null;
  while (Date.now() < deadline) {
    debug = await readPlayerAvatarDebug(page);
    fidelity = buildReplaySliderSeekFidelity(debug);
    if ((debug?.frameUpdatedAt ?? -1) > previousUpdatedAt && fidelity.clean) {
      return { debug, fidelity, telemetryRefreshed: true };
    }
    await page.waitForTimeout(50);
  }
  return {
    debug,
    fidelity: fidelity ?? buildReplaySliderSeekFidelity(debug),
    telemetryRefreshed: (debug?.frameUpdatedAt ?? -1) > previousUpdatedAt,
  };
}

async function dragSliderToFrame({ frameCount, page, requestedFrameIndex, slider }) {
  await slider.scrollIntoViewIfNeeded();
  const box = await slider.boundingBox();
  if (!box || box.width <= 0 || box.height <= 0) {
    throw new Error("Replay frame slider has no draggable bounds.");
  }
  const currentFrameIndex = Number.parseInt(await slider.inputValue(), 10);
  const thumbInset = Math.min(10, box.width / 4);
  const trackWidth = Math.max(1, box.width - thumbInset * 2);
  const xFor = (frameIndex) => (
    box.x + thumbInset + replaySliderTargetRatio(frameIndex, frameCount) * trackWidth
  );
  const y = box.y + box.height / 2;

  await page.mouse.move(xFor(currentFrameIndex), y);
  await page.mouse.down();
  await page.mouse.move(xFor(requestedFrameIndex), y, { steps: 8 });
  await page.mouse.up();

  let observedFrameIndex = Number.parseInt(await slider.inputValue(), 10);
  let correctionCount = 0;
  while (observedFrameIndex !== requestedFrameIndex && correctionCount < 200) {
    await slider.press(observedFrameIndex < requestedFrameIndex ? "ArrowRight" : "ArrowLeft");
    observedFrameIndex = Number.parseInt(await slider.inputValue(), 10);
    correctionCount += 1;
  }
  return { correctionCount, observedFrameIndex };
}

async function captureSliderSeekProof({
  frameCount,
  lab,
  outDir,
  page,
  requestedFrames,
  sessionPart,
}) {
  if (requestedFrames.length === 0) return null;
  const slider = page.getByTestId("movement-replay-frame-slider");
  await slider.waitFor({ state: "visible" });
  await page.waitForFunction(() => (
    typeof window.__sonaeReplayLabStepToFrame === "function" &&
    Number.isFinite(window.__sonaeReplayLabCommittedFrameIndex)
  ));
  const events = [];

  for (let sequenceIndex = 0; sequenceIndex < requestedFrames.length; sequenceIndex += 1) {
    const requestedFrameIndex = requestedFrames[sequenceIndex];
    const previousDebug = await readPlayerAvatarDebug(page);
    const startedAt = Date.now();
    const drag = await dragSliderToFrame({ frameCount, page, requestedFrameIndex, slider });
    if (drag.observedFrameIndex !== requestedFrameIndex) {
      throw new Error(
        `Replay slider drag stopped at ${drag.observedFrameIndex}; expected ${requestedFrameIndex} ` +
        `after ${drag.correctionCount} keyboard correction(s).`,
      );
    }
    try {
      await page.waitForFunction((frameIndex) => {
        const root = document.querySelector('[data-testid="movement-replay-lab"]');
        const range = document.querySelector('[data-testid="movement-replay-frame-slider"]');
        return (
          Number(root?.getAttribute("data-current-frame-index") || -1) === frameIndex &&
          Number(range?.value || -1) === frameIndex &&
          window.__sonaeReplayLabCommittedFrameIndex === frameIndex
        );
      }, requestedFrameIndex);
    } catch (error) {
      const failedState = await page.evaluate(() => ({
        committedFrameIndex: window.__sonaeReplayLabCommittedFrameIndex ?? null,
        currentFrameIndex: Number(
          document.querySelector('[data-testid="movement-replay-lab"]')
            ?.getAttribute("data-current-frame-index") ?? -1,
        ),
        sliderValue: Number(
          document.querySelector('[data-testid="movement-replay-frame-slider"]')?.value ?? -1,
        ),
        url: window.location.href,
      }));
      throw new Error(
        `Replay slider did not commit requested frame ${requestedFrameIndex}: ${JSON.stringify(failedState)}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    const telemetry = await waitForCleanSliderTelemetry(
      page,
      previousDebug?.frameUpdatedAt ?? -1,
    );
    const state = await lab.evaluate((element) => ({
      committedFrameIndex: window.__sonaeReplayLabCommittedFrameIndex ?? -1,
      observedFrameIndex: Number(element.getAttribute("data-current-frame-index") || -1),
    }));
    const sliderValue = Number.parseInt(await slider.inputValue(), 10);
    const playbackPaused = await page.getByRole("button", { name: "Play replay" }).count() === 1;
    const screenshotPath = path.join(
      outDir,
      `movement-replay-${sessionPart}-slider-seek-${sequenceIndex}-${requestedFrameIndex}.png`,
    );
    await page.getByTestId("movement-replay-avatar-section").screenshot({ path: screenshotPath });
    const event = {
      committedFrameIndex: state.committedFrameIndex,
      correctionCount: drag.correctionCount,
      durationMs: Date.now() - startedAt,
      fidelity: telemetry.fidelity,
      observedFrameIndex: state.observedFrameIndex,
      playbackPaused,
      requestedFrameIndex,
      screenshotPath,
      sequenceIndex,
      sliderValue,
      telemetryFrameUpdatedAt: telemetry.debug?.frameUpdatedAt ?? null,
      telemetryRefreshed: telemetry.telemetryRefreshed,
    };
    event.passed = replaySliderSeekEventPasses(event);
    events.push(event);
  }

  return {
    eventCount: events.length,
    events,
    failures: events.filter(({ passed }) => !passed).map((event) => ({
      observedFrameIndex: event.observedFrameIndex,
      repairSamples: event.fidelity?.repairSamples ?? [],
      requestedFrameIndex: event.requestedFrameIndex,
      sequenceIndex: event.sequenceIndex,
    })),
    ok: events.every(({ passed }) => passed),
    requestedFrames,
    schemaVersion: 1,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.e2eAuth && args.localTestAuth) {
    throw new Error("Choose either --e2e-auth or --local-test-auth, not both.");
  }
  const storageState = args.e2eAuth
    ? ""
    : args.storageState || (await fileExists(defaultStorageState) ? defaultStorageState : "");
  await mkdir(args.outDir, { recursive: true });

  const browser = await chromium.launch({ headless: !args.headed });
  try {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { width: 1440, height: 1100 },
    });
    if (args.e2eAuth) {
      const baseUrl = new URL(args.baseUrl);
      await context.addCookies([{
        domain: baseUrl.hostname,
        expires: -1,
        httpOnly: false,
        name: "sonae_e2e_auth",
        path: "/",
        sameSite: "Lax",
        secure: baseUrl.protocol === "https:",
        value: args.role,
      }]);
    }
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
    try {
      await lab.waitFor();
    } catch (error) {
      const pageState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 500) ?? "",
        title: document.title,
        url: window.location.href,
      }));
      throw new Error(
        `Replay Lab root did not render: ${JSON.stringify(pageState)}. ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
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

    const sliderSeekProof = await captureSliderSeekProof({
      frameCount: labMeta.frameCount,
      lab,
      outDir: args.outDir,
      page,
      requestedFrames: parseReplaySliderSeekFrames(args.sliderSeekFrames, labMeta.frameCount),
      sessionPart,
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
      const avatarDebug = await page.evaluate(() => (
        window.__sonaeMovementAvatarDebug ?? null
      ));
      const runtimeSetup = await page.evaluate(() => (
        window.__sonaeMovementRecordedPlayerSetup ?? null
      ));

      captures.push({
        avatarDebug,
        avatarPath,
        diagnostics,
        frame,
        runtimeSetup,
        sourcePath,
      });
    }

    const manifest = {
      baseUrl: args.baseUrl,
      capturedAt: new Date().toISOString(),
      captures,
      frameCount: labMeta.frameCount,
      frames,
      motionPipelineFingerprint: movementPipelineFingerprint(),
      authMode: args.e2eAuth ? "deterministic-e2e" : args.localTestAuth ? "local-test-auth" : "storage-state",
      sessionId: labMeta.sessionId,
      sliderSeekProof,
      storageState: storageState || null,
    };
    const manifestPath = path.join(args.outDir, `movement-replay-${sessionPart}-manifest.json`);
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2));

    console.log(`Captured ${captures.length} replay frame(s) for ${labMeta.sessionId || "latest session"}.`);
    if (sliderSeekProof) {
      console.log(
        `Slider seek proof: ${sliderSeekProof.ok ? "passed" : "failed"} (${sliderSeekProof.eventCount} event(s)).`,
      );
    }
    console.log(`Wrote ${path.resolve(args.outDir)}`);

    if (sliderSeekProof && !sliderSeekProof.ok) {
      throw new Error(`Replay slider seek proof failed for ${sliderSeekProof.failures.length} event(s).`);
    }

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
