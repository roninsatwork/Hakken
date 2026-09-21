#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants, createReadStream, createWriteStream } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  movementCodeCommit,
  movementPipelineFingerprint,
} from "./lib/movementPipelineFingerprint.mjs";
import { sourceHashForReplaySession } from "./lib/replay-proof-identity.mjs";
import { serveLocalJsonFile } from "./lib/serveLocalJsonFile.mjs";

const defaultBaseUrl = "http://localhost:3000";
const defaultStorageState = "e2e/.auth/super-admin.json";
const deterministicFrameBatchSize = 32;
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
  --frame-start <index> First source frame for a deterministic repair window
  --frame-end <index>   Last source frame for a deterministic repair window (inclusive)
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
    frameEnd: null,
    frameStart: null,
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
    else if (arg === "--frame-start") args.frameStart = Number(argv[++index]);
    else if (arg === "--frame-end") args.frameEnd = Number(argv[++index]);
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

function replayUrl(args, debugReplaySessionUrl = "/__movement-replay-session.json") {
  const url = new URL("/demos/movements/replay-lab", args.baseUrl.replace(/\/$/, ""));
  url.searchParams.set("debugReplaySessionUrl", debugReplaySessionUrl);
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

function writeToStream(stream, chunk) {
  return new Promise((resolve, reject) => {
    stream.write(chunk, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

function endStream(stream) {
  return new Promise((resolve, reject) => {
    stream.end((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function pipeIntoStream(readable, writable) {
  for await (const chunk of readable) {
    await writeToStream(writable, chunk);
  }
}

async function appendFrameChunk(stream, state, chunk) {
  for (const frame of chunk) {
    await writeToStream(stream, `${state.hasFrames ? ",\n" : ""}${JSON.stringify(frame)}`);
    state.hasFrames = true;
  }
}

async function writeReplayResultWithFrameItems(outPath, result, frameItemsPath) {
  const stream = createWriteStream(outPath);
  const entries = Object.entries(result).filter(([key]) => key !== "frames");
  try {
    await writeToStream(stream, "{\n");
    for (const [key, value] of entries) {
      const serialized = JSON.stringify(value, null, 2).replaceAll("\n", "\n  ");
      await writeToStream(stream, `  ${JSON.stringify(key)}: ${serialized},\n`);
    }
    await writeToStream(stream, '  "frames": [\n');
    await pipeIntoStream(createReadStream(frameItemsPath), stream);
    await writeToStream(stream, "\n  ]\n}\n");
  } finally {
    await endStream(stream);
  }
}

async function captureDeterministicFrames(page, lab, threeParty, frameStart, frameEnd, options = {}) {
  const frames = [];
  const collectFullFrames = options.collectFullFrames !== false;
  let captureError = "";
  try {
    for (
      let startFrameIndex = frameStart;
      startFrameIndex <= frameEnd;
      startFrameIndex += deterministicFrameBatchSize
    ) {
      const endFrameIndex = Math.min(frameEnd + 1, startFrameIndex + deterministicFrameBatchSize);
      const chunk = await page.evaluate(async ({
        endFrameIndex,
        frameWindowStart,
        startFrameIndex,
        threeParty,
      }) => {
        const waitForAnimationFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
        const slimAvatarDebug = (debug) => debug ? structuredClone({
          avatarExpressions: debug.avatarExpressions,
          avatarHands: debug.avatarHands,
          avatarHead: debug.avatarHead,
          avatarName: debug.avatarName,
          avatarRoot: debug.avatarRoot,
          avatarSpine: debug.avatarSpine,
          avatarVisual: debug.avatarVisual,
          profileName: debug.profileName,
          sourceCapturedAt: debug.sourceCapturedAt,
          sourceFrameId: debug.sourceFrameId,
          updatedAt: debug.updatedAt,
        }) : null;
        const waitFor = async (predicate, message) => {
          for (let attempt = 0; attempt < 240; attempt += 1) {
            if (predicate()) return;
            await waitForAnimationFrame();
          }
          throw new Error(message);
        };
        const root = document.querySelector('[data-testid="movement-replay-lab"]');
        const stepToFrame = window.__hakkenReplayLabStepToFrame;
        if (!root || typeof stepToFrame !== "function") {
          throw new Error("Replay Lab deterministic frame-step bridge is unavailable.");
        }

        const chunkFrames = [];
        // Frames before the accepted setup window have no player motion by
        // contract; only require player telemetry from the window start on.
        const playerWindowStart = Number(root.getAttribute("data-player-setup-window-start") || 0);
        const firstSteppedFrameIndex = startFrameIndex === 0 ? 1 : startFrameIndex;
        if (startFrameIndex === 0) {
          const initialFrameIndex = stepToFrame(0);
          if (initialFrameIndex !== 0) {
            throw new Error(`Deterministic initial frame selected ${initialFrameIndex}; expected 0.`);
          }
          await waitFor(
            () => Number(root.getAttribute("data-current-frame-index") || -1) === 0,
            "Replay Lab did not select deterministic initial frame 0.",
          );
          await waitFor(
            () => window.__hakkenReplayLabCommittedFrameIndex === 0,
            "Replay refs did not commit deterministic initial frame 0.",
          );
          if (playerWindowStart === 0) {
            await waitFor(
              () => Boolean(window.__hakkenMovementAvatarDebug?.player?.avatarVisual) &&
                window.__hakkenMovementAvatarDebug?.player?.sourceFrameId?.endsWith(":0"),
              "Player avatar telemetry did not render deterministic initial frame 0.",
            );
          }
          if (threeParty) {
            await waitFor(
              () => Boolean(window.__hakkenMovementAvatarDebug?.instructor?.avatarVisual) &&
                window.__hakkenMovementAvatarDebug?.instructor?.sourceFrameId?.endsWith(":0"),
              "Instructor avatar telemetry did not render deterministic initial frame 0.",
            );
            await waitFor(
              () => window.__hakkenReplayGameBoundaryProof?.frameIndex === 0,
              "Replay/Game boundary proof did not commit deterministic initial frame 0.",
            );
          }
          const playerDebug = window.__hakkenMovementAvatarDebug?.player;
          const instructorDebug = window.__hakkenMovementAvatarDebug?.instructor;
          const replayGameBoundaryProof = window.__hakkenReplayGameBoundaryProof;
          chunkFrames.push({
            avatars: threeParty
              ? {
                  instructor: slimAvatarDebug(instructorDebug),
                  player: slimAvatarDebug(playerDebug),
                }
              : undefined,
            checksums: threeParty
              ? structuredClone(replayGameBoundaryProof?.checksums)
              : undefined,
            debug: slimAvatarDebug(playerDebug),
            frameIndex: 0 - frameWindowStart,
            renderedFrameIndex: 0,
            sourceFrameIndex: 0,
          });
        }

        for (let frameIndex = firstSteppedFrameIndex; frameIndex < endFrameIndex; frameIndex += 1) {
          const selectedFrameIndex = stepToFrame(frameIndex);
          if (selectedFrameIndex !== frameIndex) {
            throw new Error(`Deterministic step selected ${selectedFrameIndex}; expected ${frameIndex}.`);
          }
          await waitFor(
            () => Number(root.getAttribute("data-current-frame-index") || -1) === frameIndex,
            `Replay Lab did not select deterministic frame ${frameIndex}.`,
          );
          await waitFor(
            () => window.__hakkenReplayLabCommittedFrameIndex === frameIndex,
            `Replay refs did not commit deterministic frame ${frameIndex}.`,
          );
          if (frameIndex >= playerWindowStart) {
            await waitFor(
              () => window.__hakkenMovementAvatarDebug?.player?.sourceFrameId?.endsWith(`:${frameIndex}`),
              `Player avatar telemetry did not render deterministic frame ${frameIndex}.`,
            );
          }
          if (threeParty) {
            await waitFor(
              () => window.__hakkenMovementAvatarDebug?.instructor?.sourceFrameId?.endsWith(`:${frameIndex}`),
              `Instructor avatar telemetry did not render deterministic frame ${frameIndex}.`,
            );
            await waitFor(
              () => window.__hakkenReplayGameBoundaryProof?.frameIndex === frameIndex,
              `Replay/Game boundary proof did not commit deterministic frame ${frameIndex}.`,
            );
          }
          const renderedFrameIndex = Number(root.getAttribute("data-current-frame-index") || -1);
          const playerDebug = window.__hakkenMovementAvatarDebug?.player;
          const instructorDebug = window.__hakkenMovementAvatarDebug?.instructor;
          const replayGameBoundaryProof = window.__hakkenReplayGameBoundaryProof;
          if (
            (frameIndex >= playerWindowStart && !playerDebug?.avatarVisual) ||
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
                  instructor: slimAvatarDebug(instructorDebug),
                  player: slimAvatarDebug(playerDebug),
                }
              : undefined,
            checksums: threeParty
              ? structuredClone(replayGameBoundaryProof?.checksums)
              : undefined,
            debug: slimAvatarDebug(playerDebug),
            frameIndex: frameIndex - frameWindowStart,
            renderedFrameIndex,
            sourceFrameIndex: frameIndex,
          });
        }
        return chunkFrames;
      }, {
        endFrameIndex,
        frameWindowStart: frameStart,
        startFrameIndex,
        threeParty,
      });
      if (options.onChunk) await options.onChunk(chunk);
      frames.push(...(
        collectFullFrames
          ? chunk
          : chunk.map((frame) => ({ frameIndex: frame.frameIndex }))
      ));
      console.log(`Deterministic progress: ${frames.length}/${frameEnd - frameStart + 1}.`);
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
  if ((args.frameStart !== null || args.frameEnd !== null) && !args.deterministic) {
    throw new Error("--frame-start/--frame-end require --deterministic.");
  }
  const debugSession = JSON.parse(await readFile(path.resolve(args.debugSessionJson), "utf8"));
  const expectedSessionId = typeof debugSession.id === "string" ? debugSession.id : "";
  if (!expectedSessionId || !/^[A-Za-z0-9_-]+$/.test(expectedSessionId)) {
    throw new Error("Debug replay session must include a selector-safe id.");
  }

  const storageState = args.storageState || (await fileExists(defaultStorageState) ? defaultStorageState : "");
  const browser = await chromium.launch({ headless: !args.headed });
  let debugSessionServer = null;
  try {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { width: 960, height: 720 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);

    if (args.localTestAuth) await signInWithLocalTestAuth(page, args);
    debugSessionServer = await serveLocalJsonFile(path.resolve(args.debugSessionJson), {
      name: "__movement-replay-session.json",
    });
    await page.goto(replayUrl(args, debugSessionServer.url), { waitUntil: "domcontentloaded" });

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
        const player = window.__hakkenMovementAvatarDebug?.player;
        const instructor = window.__hakkenMovementAvatarDebug?.instructor;
        // When the shared sliding setup starts after frame 0, the player
        // avatar legitimately has no motion telemetry until playback reaches
        // the accepted window; only require it up front for window start 0.
        const playerWindowStart = Number(root?.getAttribute("data-player-setup-window-start") || 0);
        return Number(root?.getAttribute("data-frame-count") || 0) > 0 &&
          (playerWindowStart > 0 || Boolean(player?.avatarVisual)) &&
          (!threeParty || Boolean(instructor?.avatarVisual));
      }, args.threeParty, { timeout: 60_000 });
    } catch (error) {
      const startupState = await page.evaluate(() => ({
        frameCount: Number(document.querySelector('[data-testid="movement-replay-lab"]')?.getAttribute("data-frame-count") || 0),
        instructor: Boolean(window.__hakkenMovementAvatarDebug?.instructor?.avatarVisual),
        player: Boolean(window.__hakkenMovementAvatarDebug?.player?.avatarVisual),
        roles: Object.keys(window.__hakkenMovementAvatarDebug ?? {}),
      }));
      throw new Error(`Replay avatar telemetry startup failed: ${JSON.stringify(startupState)}. ${error instanceof Error ? error.message : String(error)}`);
    }
    // Let the VRM rest map, calibration, and floor locks settle on frame zero
    // before uninterrupted playback. Otherwise model-load convergence is
    // misreported as movement-frame jerk during the opening second.
    await page.waitForTimeout(2_000);

    const meta = await lab.evaluate((element) => ({
      avatarProfile: element.getAttribute("data-avatar-profile") || "",
      instructorAvatarProfile: element.getAttribute("data-instructor-avatar-profile") || "",
      frameCount: Number(element.getAttribute("data-frame-count") || 0),
      inputContractId: element.getAttribute("data-input-contract-id") || "",
      parityProofMode: element.getAttribute("data-parity-proof-mode") || "",
      recordingSchemaVersion: Number(element.getAttribute("data-recording-schema-version") || 0) || null,
      runtimeContract: element.getAttribute("data-runtime-contract") || "",
      runtimeLanes: (element.getAttribute("data-runtime-lanes") || "")
        .split(",")
        .filter(Boolean),
      sessionId: element.getAttribute("data-active-session-id") || "",
      setupPolicyId: element.getAttribute("data-setup-policy-id") || "",
      sourcePacketHash: element.getAttribute("data-source-packet-hash") || "",
    }));
    const frameStart = args.frameStart ?? 0;
    const frameEnd = args.frameEnd ?? meta.frameCount - 1;
    if (
      !Number.isInteger(frameStart) || !Number.isInteger(frameEnd) ||
      frameStart < 0 || frameEnd < frameStart || frameEnd >= meta.frameCount
    ) {
      throw new Error(`Invalid deterministic frame window ${frameStart}-${frameEnd} for ${meta.frameCount} source frames.`);
    }
    const captureFrameCount = args.deterministic ? frameEnd - frameStart + 1 : meta.frameCount;

    if (!args.deterministic) await page.evaluate(() => {
      window.__hakkenFullSequenceCapture = { frames: [] };
      const root = document.querySelector('[data-testid="movement-replay-lab"]');
      if (!root) throw new Error("Replay Lab root is missing.");

      let captureActive = true;
      let lastCapturedFrame = -1;
      const captureCurrentRenderedFrame = () => {
        const frameIndex = Number(root.getAttribute("data-current-frame-index") || -1);
        if (frameIndex >= 0 && frameIndex !== lastCapturedFrame) {
          const sourceDebug = window.__hakkenMovementAvatarDebug?.player;
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
          window.__hakkenFullSequenceCapture.frames.push({
            debug,
            frameIndex,
          });
          lastCapturedFrame = frameIndex;
        }
        if (captureActive) requestAnimationFrame(captureCurrentRenderedFrame);
      };

      window.__hakkenFullSequenceCapture.disconnect = () => {
        captureActive = false;
      };
      captureCurrentRenderedFrame();
    });

    let playbackError = "";
    let capture;
    const outPath = path.resolve(args.out);
    const streamedFrameItemsPath = `${outPath}.frames.tmp`;
    let frameItemStream = null;
    if (args.deterministic) {
      await mkdir(path.dirname(outPath), { recursive: true });
      const frameItemState = { hasFrames: false };
      frameItemStream = createWriteStream(streamedFrameItemsPath);
      try {
        capture = await captureDeterministicFrames(
          page,
          lab,
          args.threeParty,
          frameStart,
          frameEnd,
          {
            collectFullFrames: false,
            onChunk: (chunk) => appendFrameChunk(frameItemStream, frameItemState, chunk),
          },
        );
      } finally {
        if (frameItemStream) {
          await endStream(frameItemStream);
          frameItemStream = null;
        }
      }
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
        window.__hakkenFullSequenceCapture?.disconnect?.();
        const playbackClock = window.__hakkenReplayLabPlaybackClock ?? null;
        return {
          playbackClock,
          processedFrameIndexes: playbackClock?.processedFrameIndexes ?? [],
          currentFrameIndex: Number(root?.getAttribute("data-current-frame-index") || -1),
          frames: window.__hakkenFullSequenceCapture?.frames ?? [],
        };
      });
    }
    const frames = capture.frames;
    const renderedMissingFrames = missingFrameIndexes(frames, captureFrameCount);
    const processedFrames = (capture.processedFrameIndexes ?? []).map((frameIndex) => ({ frameIndex }));
    const processedMissingFrames = args.deterministic
      ? renderedMissingFrames
      : missingFrameIndexes(processedFrames, meta.frameCount);
    const missingFrames = args.deterministic ? renderedMissingFrames : processedMissingFrames;
    const playbackCompleted = capture.currentFrameIndex === frameEnd;
    const proofMode = args.threeParty ? "three-party-mirror" : "player-avatar";
    const code = {
      commit: movementCodeCommit(),
      motionPipelineFingerprint: movementPipelineFingerprint(),
    };
    const identity = {
      avatarProfile: meta.avatarProfile || null,
      instructorAvatarProfile: meta.instructorAvatarProfile || null,
      inputContractId: meta.inputContractId || null,
      proofMode: meta.parityProofMode || null,
      recordingSchemaVersion: meta.recordingSchemaVersion,
      runtimeContract: meta.runtimeContract || null,
      setupPolicyId: meta.setupPolicyId || null,
      sourcePacketHash: meta.sourcePacketHash || null,
    };
    const result = {
      capturedAt: new Date().toISOString(),
      code,
      currentFrameIndex: capture.currentFrameIndex,
      frameCount: captureFrameCount,
      frames,
      missingFrameCount: missingFrames.length,
      missingFrames,
      identity,
      motionPipelineFingerprint: code.motionPipelineFingerprint,
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
      proofMode,
      recordingId: expectedSessionId,
      runtimeContract: meta.runtimeContract,
      runtimeLanes: meta.runtimeLanes,
      sessionId: meta.sessionId,
      sourceHash: sourceHashForReplaySession(debugSession),
      sourceFrameCount: meta.frameCount,
      sourceFrameEnd: frameEnd,
      sourceFrameStart: frameStart,
    };

    await mkdir(path.dirname(outPath), { recursive: true });
    if (args.deterministic) {
      await writeReplayResultWithFrameItems(outPath, result, streamedFrameItemsPath);
    } else {
      await writeFile(outPath, `${JSON.stringify(result)}\n`);
    }
    console.log(`Collected ${frames.length}/${captureFrameCount} rendered replay frame(s) for ${meta.sessionId}.`);
    console.log(`Playback reached source frame ${capture.currentFrameIndex}/${frameEnd}.`);
    console.log(`Missing frames: ${missingFrames.length}.`);
    console.log(`Wrote ${outPath}`);
    if (!playbackCompleted || missingFrames.length > 0) process.exitCode = 1;

    await context.close();
  } finally {
    await debugSessionServer?.close();
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
