#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";
import { sourceHashForReplaySession } from "./lib/replay-proof-identity.mjs";

const defaultBaseUrl = "http://localhost:3000";
const defaultStorageState = "e2e/.auth/super-admin.json";
let requestedOutputPath = "";

function printHelp() {
  console.log(`Collect rendered-avatar telemetry for every frame during uninterrupted Replay Lab playback.

Usage:
  npm run movement:replay:full-sequence -- --debug-session-json <file> --out <file> [options]

Options:
  --base-url <url>        App URL. Defaults to ${defaultBaseUrl}
  --debug-session-json <file>
                         Exported Replay Lab session fixture
  --out <file>           Full-sequence telemetry JSON output
  --storage-state <file> Playwright storage state to reuse for auth
  --avatar-url <path>    VRM the replay avatar should load
  --local-test-auth      Sign in through /local-test-auth before capture
  --role <role>          Local-test-auth role. Defaults to super-admin
  --secret <secret>      Local-test-auth secret. Defaults to LOCAL_TEST_AUTH_SECRET
  --playback-timeout-ms <ms>
                         Override the uninterrupted playback timeout
  --deterministic       Step and settle every source frame instead of timed playback
  --three-party         Render instructor identity and an independently constructed opposite player
  --headed               Show the browser while collecting
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = {
    avatarUrl: "",
    baseUrl: defaultBaseUrl,
    deterministic: false,
    debugSessionJson: "",
    headed: false,
    localTestAuth: false,
    out: "",
    playbackTimeoutMs: 0,
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    storageState: "",
    threeParty: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--deterministic") args.deterministic = true;
    else if (arg === "--three-party") args.threeParty = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--debug-session-json") args.debugSessionJson = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--avatar-url") args.avatarUrl = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--playback-timeout-ms") args.playbackTimeoutMs = Number(argv[++index] || 0);
    else throw new Error(`Unknown option: ${arg}`);
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

async function signInWithLocalTestAuth(page, args) {
  if (!args.secret) throw new Error("--local-test-auth requires --secret or LOCAL_TEST_AUTH_SECRET.");
  const url = new URL("/local-test-auth", args.baseUrl);
  url.searchParams.set("role", args.role);
  url.searchParams.set("secret", args.secret);
  url.searchParams.set("redirectTo", "/demos/movements/replay-lab");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForURL((currentUrl) => currentUrl.pathname === "/demos/movements/replay-lab", {
    timeout: 45_000,
  });
}

function replayUrl(args) {
  const url = new URL("/demos/movements/replay-lab", args.baseUrl.replace(/\/$/, ""));
  url.searchParams.set("debugReplaySessionUrl", "/__movement-replay-session.json");
  if (args.deterministic) url.searchParams.set("debugDeterministicReplay", "1");
  if (args.threeParty) url.searchParams.set("debugThreePartyMirror", "1");
  if (args.avatarUrl) url.searchParams.set("avatarUrl", args.avatarUrl);
  return url.toString();
}

function missingFrameIndexes(frames, frameCount) {
  const observed = new Set(frames.map((frame) => frame.frameIndex));
  return Array.from({ length: frameCount }, (_, index) => index)
    .filter((index) => !observed.has(index));
}

async function captureDeterministicFrames(page, lab, frameCount, threeParty) {
  const frames = [];
  let captureError = "";
  try {
    for (let startFrameIndex = 0; startFrameIndex < frameCount; startFrameIndex += 250) {
      const endFrameIndex = Math.min(frameCount, startFrameIndex + 250);
      const chunk = await page.evaluate(async ({ endFrameIndex, startFrameIndex, threeParty }) => {
        const waitForAnimationFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const waitFor = async (predicate, message) => {
          for (let attempt = 0; attempt < 240; attempt += 1) {
            if (predicate()) return;
            await waitForAnimationFrame();
          }
          throw new Error(message);
        };
        const root = document.querySelector('[data-testid="movement-replay-lab"]');
        const stepToFrame = window.__sonaeReplayLabStepToFrame;
        if (!root || typeof stepToFrame !== "function") {
          throw new Error("Replay Lab deterministic frame-step bridge is unavailable.");
        }

        const chunkFrames = [];
        if (startFrameIndex === 0 && endFrameIndex > 1) {
          const warmupFrameIndex = stepToFrame(1);
          if (warmupFrameIndex !== 1) {
            throw new Error(`Deterministic warmup selected ${warmupFrameIndex}; expected 1.`);
          }
          await waitFor(
            () => Number(root.getAttribute("data-current-frame-index") || -1) === 1,
            "Replay Lab did not select deterministic warmup frame 1.",
          );
          await waitFor(
            () => window.__sonaeReplayLabCommittedFrameIndex === 1,
            "Replay refs did not commit deterministic warmup frame 1.",
          );
          await waitFor(
            () => Boolean(window.__sonaeMovementAvatarDebug?.player?.avatarVisual),
            "Player avatar telemetry did not render deterministic warmup frame 1.",
          );
          if (threeParty) {
            await waitFor(
              () => Boolean(window.__sonaeMovementAvatarDebug?.instructor?.avatarVisual),
              "Instructor avatar telemetry did not render deterministic warmup frame 1.",
            );
          }
        }

        for (let frameIndex = startFrameIndex; frameIndex < endFrameIndex; frameIndex += 1) {
          const previousPlayerUpdatedAt = window.__sonaeMovementAvatarDebug?.player?.frameUpdatedAt ?? -1;
          const previousInstructorUpdatedAt = window.__sonaeMovementAvatarDebug?.instructor?.frameUpdatedAt ?? -1;
          const selectedFrameIndex = stepToFrame(frameIndex);
          if (selectedFrameIndex !== frameIndex) {
            throw new Error(`Deterministic step selected ${selectedFrameIndex}; expected ${frameIndex}.`);
          }
          await waitFor(
            () => Number(root.getAttribute("data-current-frame-index") || -1) === frameIndex,
            `Replay Lab did not select deterministic frame ${frameIndex}.`,
          );
          await waitFor(
            () => window.__sonaeReplayLabCommittedFrameIndex === frameIndex,
            `Replay refs did not commit deterministic frame ${frameIndex}.`,
          );
          await waitFor(
            () => (window.__sonaeMovementAvatarDebug?.player?.frameUpdatedAt ?? -1) > previousPlayerUpdatedAt,
            `Player avatar telemetry did not render deterministic frame ${frameIndex}.`,
          );
          if (threeParty) {
            await waitFor(
              () => (window.__sonaeMovementAvatarDebug?.instructor?.frameUpdatedAt ?? -1) > previousInstructorUpdatedAt,
              `Instructor avatar telemetry did not render deterministic frame ${frameIndex}.`,
            );
          }

          const renderedFrameIndex = Number(root.getAttribute("data-current-frame-index") || -1);
          const playerDebug = window.__sonaeMovementAvatarDebug?.player;
          const instructorDebug = window.__sonaeMovementAvatarDebug?.instructor;
          if (
            !playerDebug?.avatarVisual ||
            (threeParty && !instructorDebug?.avatarVisual) ||
            renderedFrameIndex !== frameIndex
          ) {
            throw new Error(
              `Deterministic frame ${frameIndex} did not produce matching rendered avatar telemetry for every required role.`,
            );
          }
          chunkFrames.push({
            avatars: threeParty
              ? {
                  instructor: structuredClone(instructorDebug),
                  player: structuredClone(playerDebug),
                }
              : undefined,
            debug: structuredClone(playerDebug),
            frameIndex,
            renderedFrameIndex,
          });
        }
        return chunkFrames;
      }, { endFrameIndex, startFrameIndex, threeParty });
      frames.push(...chunk);
      console.log(`Deterministic progress: ${frames.length}/${frameCount}.`);
    }
  } catch (error) {
    captureError = error instanceof Error ? error.message : String(error);
  }

  const currentFrameIndex = await lab.evaluate(
    (element) => Number(element.getAttribute("data-current-frame-index") || -1),
  );
  return { captureError, currentFrameIndex, frames };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requestedOutputPath = args.out;
  if (args.help) return printHelp();
  if (!args.debugSessionJson) throw new Error("Pass --debug-session-json <file>.");
  if (!args.out) throw new Error("Pass --out <file>.");
  if (args.threeParty && !args.deterministic) {
    throw new Error("--three-party currently requires --deterministic frame accounting.");
  }
  const debugSession = JSON.parse(await readFile(path.resolve(args.debugSessionJson), "utf8"));
  const expectedSessionId = typeof debugSession.id === "string" ? debugSession.id : "";
  if (!expectedSessionId || !/^[A-Za-z0-9_-]+$/.test(expectedSessionId)) {
    throw new Error("Debug replay session must include a selector-safe id.");
  }

  const storageState = args.storageState || (await fileExists(defaultStorageState) ? defaultStorageState : "");
  const browser = await chromium.launch({ headless: !args.headed });
  try {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { width: 960, height: 720 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);

    if (args.localTestAuth) await signInWithLocalTestAuth(page, args);
    await page.route("**/__movement-replay-session.json", (route) => route.fulfill({
      contentType: "application/json",
      path: path.resolve(args.debugSessionJson),
    }));
    await page.goto(replayUrl(args), { waitUntil: "domcontentloaded" });

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
    const requestedSession = page.locator(
      `[data-testid="movement-replay-session"][data-session-id="${expectedSessionId}"]`,
    );
    await requestedSession.waitFor();
    await requestedSession.click();
    await page.waitForFunction((sessionId) => {
      const root = document.querySelector('[data-testid="movement-replay-lab"]');
      return root?.getAttribute("data-active-session-id") === sessionId;
    }, expectedSessionId);
    await page.getByTestId("movement-replay-avatar-scene").waitFor();

    try {
      await page.waitForFunction((threeParty) => {
        const root = document.querySelector('[data-testid="movement-replay-lab"]');
        const player = window.__sonaeMovementAvatarDebug?.player;
        const instructor = window.__sonaeMovementAvatarDebug?.instructor;
        return Number(root?.getAttribute("data-frame-count") || 0) > 0 &&
          Boolean(player?.avatarVisual) &&
          (!threeParty || Boolean(instructor?.avatarVisual));
      }, args.threeParty, { timeout: 60_000 });
    } catch (error) {
      const startupState = await page.evaluate(() => ({
        frameCount: Number(document.querySelector('[data-testid="movement-replay-lab"]')?.getAttribute("data-frame-count") || 0),
        instructor: Boolean(window.__sonaeMovementAvatarDebug?.instructor?.avatarVisual),
        player: Boolean(window.__sonaeMovementAvatarDebug?.player?.avatarVisual),
        roles: Object.keys(window.__sonaeMovementAvatarDebug ?? {}),
      }));
      throw new Error(`Replay avatar telemetry startup failed: ${JSON.stringify(startupState)}. ${error instanceof Error ? error.message : String(error)}`);
    }
    // Let the VRM rest map, calibration, and floor locks settle on frame zero
    // before uninterrupted playback. Otherwise model-load convergence is
    // misreported as movement-frame jerk during the opening second.
    await page.waitForTimeout(2_000);

    const meta = await lab.evaluate((element) => ({
      frameCount: Number(element.getAttribute("data-frame-count") || 0),
      runtimeContract: element.getAttribute("data-runtime-contract") || "",
      runtimeLanes: (element.getAttribute("data-runtime-lanes") || "")
        .split(",")
        .filter(Boolean),
      sessionId: element.getAttribute("data-active-session-id") || "",
    }));

    if (!args.deterministic) await page.evaluate(() => {
      window.__sonaeFullSequenceCapture = { frames: [] };
      const root = document.querySelector('[data-testid="movement-replay-lab"]');
      if (!root) throw new Error("Replay Lab root is missing.");

      let captureActive = true;
      let lastCapturedFrame = -1;
      const captureCurrentRenderedFrame = () => {
        const frameIndex = Number(root.getAttribute("data-current-frame-index") || -1);
        if (frameIndex >= 0 && frameIndex !== lastCapturedFrame) {
          const sourceDebug = window.__sonaeMovementAvatarDebug?.player;
          const debug = sourceDebug ? structuredClone({
            avatarHead: sourceDebug.avatarHead,
            avatarName: sourceDebug.avatarName,
            avatarRoot: sourceDebug.avatarRoot,
            avatarSpine: sourceDebug.avatarSpine,
            avatarVisual: sourceDebug.avatarVisual,
            calibrationQuality: sourceDebug.calibrationQuality,
            fallbacks: sourceDebug.fallbacks,
            frameUpdatedAt: sourceDebug.frameUpdatedAt,
            headRaw: sourceDebug.headRaw,
            profileName: sourceDebug.profileName,
            retarget: sourceDebug.retarget,
            spineDrive: sourceDebug.spineDrive,
          }) : null;
          window.__sonaeFullSequenceCapture.frames.push({
            debug,
            frameIndex,
          });
          lastCapturedFrame = frameIndex;
        }
        if (captureActive) requestAnimationFrame(captureCurrentRenderedFrame);
      };

      window.__sonaeFullSequenceCapture.disconnect = () => {
        captureActive = false;
      };
      captureCurrentRenderedFrame();
    });

    let playbackError = "";
    let capture;
    if (args.deterministic) {
      capture = await captureDeterministicFrames(page, lab, meta.frameCount, args.threeParty);
      playbackError = capture.captureError;
    } else {
      await page.getByRole("button", { name: "Play replay" }).click();
      try {
        await page.waitForFunction((lastFrame) => {
          const root = document.querySelector('[data-testid="movement-replay-lab"]');
          return Number(root?.getAttribute("data-current-frame-index") || -1) === lastFrame;
        }, meta.frameCount - 1, {
          timeout: args.playbackTimeoutMs || Math.max(180_000, meta.frameCount * 250),
        });
      } catch (error) {
        playbackError = error instanceof Error ? error.message : String(error);
      }
      await page.waitForTimeout(250);

      capture = await page.evaluate(() => {
        const root = document.querySelector('[data-testid="movement-replay-lab"]');
        window.__sonaeFullSequenceCapture?.disconnect?.();
        const playbackClock = window.__sonaeReplayLabPlaybackClock ?? null;
        return {
          playbackClock,
          processedFrameIndexes: playbackClock?.processedFrameIndexes ?? [],
          currentFrameIndex: Number(root?.getAttribute("data-current-frame-index") || -1),
          frames: window.__sonaeFullSequenceCapture?.frames ?? [],
        };
      });
    }
    const frames = capture.frames;
    const renderedMissingFrames = missingFrameIndexes(frames, meta.frameCount);
    const processedFrames = (capture.processedFrameIndexes ?? []).map((frameIndex) => ({ frameIndex }));
    const processedMissingFrames = args.deterministic
      ? renderedMissingFrames
      : missingFrameIndexes(processedFrames, meta.frameCount);
    const missingFrames = args.deterministic ? renderedMissingFrames : processedMissingFrames;
    const playbackCompleted = capture.currentFrameIndex === meta.frameCount - 1;
    const result = {
      capturedAt: new Date().toISOString(),
      currentFrameIndex: capture.currentFrameIndex,
      frameCount: meta.frameCount,
      frames,
      missingFrameCount: missingFrames.length,
      missingFrames,
      motionPipelineFingerprint: movementPipelineFingerprint(),
      playbackCompleted,
      playbackClock: capture.playbackClock ?? null,
      processedFrameCount: args.deterministic ? frames.length : processedFrames.length,
      processedMissingFrameCount: processedMissingFrames.length,
      processedMissingFrames,
      renderedMissingFrameCount: renderedMissingFrames.length,
      renderedMissingFrames,
      playbackError: playbackCompleted && missingFrames.length === 0 ? "" : playbackError,
      playbackMode: args.deterministic
        ? "deterministic-rendered-frame-step"
        : "uninterrupted-source-time-sequence",
      proofMode: args.threeParty ? "three-party-mirror" : "player-avatar",
      recordingId: expectedSessionId,
      runtimeContract: meta.runtimeContract,
      runtimeLanes: meta.runtimeLanes,
      sessionId: meta.sessionId,
      sourceHash: sourceHashForReplaySession(debugSession),
    };

    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(result)}\n`);
    console.log(`Collected ${frames.length}/${meta.frameCount} rendered replay frame(s) for ${meta.sessionId}.`);
    console.log(`Playback reached frame ${capture.currentFrameIndex}/${meta.frameCount - 1}.`);
    console.log(`Missing frames: ${missingFrames.length}.`);
    console.log(`Wrote ${outPath}`);
    if (!playbackCompleted || missingFrames.length > 0) process.exitCode = 1;

    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (requestedOutputPath) {
    try {
      const failurePath = path.resolve(`${requestedOutputPath}.failure.json`);
      await mkdir(path.dirname(failurePath), { recursive: true });
      await writeFile(failurePath, `${JSON.stringify({
        error: message,
        failedAt: new Date().toISOString(),
      }, null, 2)}\n`);
    } catch {
      // Preserve the original capture error even when its diagnostic artifact cannot be written.
    }
  }
  console.error(message);
  process.exitCode = 1;
});
