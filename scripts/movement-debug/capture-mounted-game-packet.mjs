#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import {
  movementCodeCommit,
  movementPipelineFingerprint,
} from "./lib/movementPipelineFingerprint.mjs";
import { serveLocalJsonFile } from "./lib/serveLocalJsonFile.mjs";

const defaultBaseUrl = "http://localhost:3000";
const defaultStorageState = "e2e/.auth/super-admin.json";
const mountedGameRenderedFrameBatchSize = 32;

function parseArgs(argv) {
  const args = {
    allowLegacy: false,
    baseUrl: defaultBaseUrl,
    canvasScreenshot: "",
    debugSessionJson: "",
    frameEnd: null,
    frameStart: null,
    headed: false,
    localTestAuth: false,
    out: "",
    role: "super-admin",
    routeMovementId: "",
    screenshot: "",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    skipPause: false,
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-legacy") args.allowLegacy = true;
    else if (arg === "--canvas-screenshot") args.canvasScreenshot = argv[++index] || "";
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--skip-pause") args.skipPause = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--debug-session-json") args.debugSessionJson = argv[++index] || "";
    else if (arg === "--frame-start") args.frameStart = Number(argv[++index]);
    else if (arg === "--frame-end") args.frameEnd = Number(argv[++index]);
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--route-movement-id") args.routeMovementId = argv[++index] || "";
    else if (arg === "--screenshot") args.screenshot = argv[++index] || "";
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
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

async function signInWithLocalTestAuth(page, args, redirectPath) {
  if (!args.secret) throw new Error("--local-test-auth requires --secret or LOCAL_TEST_AUTH_SECRET.");
  const url = new URL("/local-test-auth", args.baseUrl);
  url.searchParams.set("role", args.role);
  url.searchParams.set("secret", args.secret);
  url.searchParams.set("redirectTo", redirectPath);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForURL((currentUrl) => currentUrl.pathname === redirectPath, { timeout: 45_000 });
}

function printHelp() {
  console.log(`Mount a recorded packet through the normal Game Studio lifecycle.

Usage:
  npm run movement:game:packet-proof -- --debug-session-json <file> --out <file>

Options:
  --base-url <url>        App URL. Defaults to ${defaultBaseUrl}
  --canvas-screenshot <file>
                         Save the rendered Game canvas after active rendering starts
  --storage-state <file> Playwright storage state
  --frame-start <index>  First source frame in a bounded repair window
  --frame-end <index>    Last source frame in a bounded repair window
  --allow-legacy         Exercise lifecycle but do not certify a missing input contract
  --local-test-auth      Sign in through /local-test-auth
  --role <role>          Local auth role. Defaults to super-admin
  --route-movement-id <id>
                         Existing movement used only to mount the Game route for an injected local packet
  --secret <secret>      Local auth secret
  --screenshot <file>    Save a visible mounted-Game frame after active rendering starts
  --skip-pause           Keep playback uninterrupted for Replay/Game parity
  --headed               Show the browser
`);
}

export function buildMountedGamePacketWindow(session, frameStart, frameEnd) {
  if (frameStart === null && frameEnd === null) {
    return { packet: session, sourceWindow: null };
  }
  const samples = Array.isArray(session?.samples) ? session.samples : [];
  if (
    !Number.isInteger(frameStart) || !Number.isInteger(frameEnd) ||
    frameStart < 0 || frameEnd < frameStart || frameEnd >= samples.length
  ) {
    throw new Error(`Invalid mounted Game frame window ${frameStart}-${frameEnd} for ${samples.length} source frames.`);
  }
  const requiredFrameCount = Math.max(
    0,
    Number(session?.setupPrefix?.requiredFrameCount ?? session?.inputContract?.setup?.prefixFrameCount ?? 0),
  );
  if (frameStart < requiredFrameCount) {
    throw new Error(
      `Mounted Game frame window ${frameStart}-${frameEnd} cannot preserve the ${requiredFrameCount}-frame setup prefix.`,
    );
  }
  const packetStart = frameStart - requiredFrameCount;
  const packetSamples = samples.slice(packetStart, frameEnd + 1);
  const channelPresent = (sample, channel) => {
    const tracking = sample?.tracking ?? {};
    if (channel === "camera") return Boolean(sample?.camera);
    if (channel === "face") return Array.isArray(tracking.face) && tracking.face.length > 0;
    if (channel === "hands") {
      return [tracking.hands?.left, tracking.hands?.right].some(
        (hand) => Array.isArray(hand?.landmarks) && hand.landmarks.length === 21,
      );
    }
    if (channel === "pose") return Array.isArray(tracking.pose) && tracking.pose.length === 33;
    if (channel === "worldPose") {
      return Array.isArray(tracking.worldPose) && tracking.worldPose.length === 33;
    }
    if (channel === "blendshapes") {
      const values = tracking.blendshapes ?? tracking.faceBlendshapes;
      return Array.isArray(values) && values.length > 0;
    }
    return false;
  };
  const channelSummary = Object.fromEntries(
    Object.keys(session?.channelSummary ?? {}).map((channel) => {
      const presentFrames = packetSamples.filter((sample) => channelPresent(sample, channel)).length;
      return [channel, {
        complete: presentFrames === packetSamples.length,
        presentFrames,
        totalFrames: packetSamples.length,
      }];
    }),
  );
  return {
    packet: {
      ...session,
      channelSummary,
      sampleCount: packetSamples.length,
      samples: packetSamples,
      setupPrefix: {
        ...session.setupPrefix,
        complete: true,
        frameIndexes: Array.from({ length: requiredFrameCount }, (_, index) => index),
        requiredFrameCount,
      },
    },
    sourceWindow: {
      activeFrameEnd: frameEnd,
      activeFrameStart: frameStart,
      packetFrameEnd: frameEnd,
      packetFrameStart: packetStart,
      setupFrameCount: requiredFrameCount,
    },
  };
}

export function updateMountedGamePlaybackWatchdog({
  nowMs,
  previous,
  proof,
  stallTimeoutMs = 60_000,
}) {
  const playerFrameIndex = Number.isInteger(proof?.playerFrameIndex)
    ? proof.playerFrameIndex
    : previous.playerFrameIndex;
  const renderedFrameCount = Number.isInteger(proof?.renderedFrameCount)
    ? proof.renderedFrameCount
    : previous.renderedFrameCount;
  const complete = proof?.phase === "complete";
  const didProgress = complete ||
    playerFrameIndex > previous.playerFrameIndex ||
    renderedFrameCount > previous.renderedFrameCount;
  const lastProgressAt = didProgress ? nowMs : previous.lastProgressAt;
  return {
    complete,
    lastProgressAt,
    playerFrameIndex,
    renderedFrameCount,
    stalled: !complete && nowMs - lastProgressAt >= stallTimeoutMs,
  };
}

function gameUrl(args, movementId, gamePacketUrl = "/__movement-game-packet.json") {
  const url = new URL(`/demos/movements/${movementId}/play`, args.baseUrl);
  url.searchParams.set("debugTracking", "1");
  url.searchParams.set("debugGamePacketUrl", gamePacketUrl);
  return url.toString();
}

async function readMountedGamePacketProof(page) {
  const finalProofBase = await page.evaluate(() => {
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
    const proof = window.__sonaeMovementGamePacketProof;
    if (!proof || typeof proof !== "object") return null;
    return {
      ...proof,
      firstRenderedBoundary: proof.firstRenderedBoundary
        ? {
            frameIndex: proof.firstRenderedBoundary.frameIndex,
            playerDebug: slimAvatarDebug(proof.firstRenderedBoundary.playerDebug),
          }
        : null,
      motionFrameProcessing: proof.motionFrameProcessing
        ? {
            ...proof.motionFrameProcessing,
            processedFrames: [],
          }
        : null,
      renderedFrames: [],
    };
  });
  if (!finalProofBase) return null;

  const renderedFrameCount = Number(finalProofBase.renderedFrameCount || 0);
  const renderedFrames = [];
  for (let startIndex = 0; startIndex < renderedFrameCount; startIndex += mountedGameRenderedFrameBatchSize) {
    const endIndex = Math.min(renderedFrameCount, startIndex + mountedGameRenderedFrameBatchSize);
    const chunk = await page.evaluate(({ endIndex, startIndex }) => {
      const proof = window.__sonaeMovementGamePacketProof;
      const frames = Array.isArray(proof?.renderedFrames) ? proof.renderedFrames : [];
      return frames.slice(startIndex, endIndex).map((frame) => ({
        checksums: structuredClone(frame.checksums),
        frameIndex: frame.frameIndex,
        playerApplied: structuredClone(frame.playerApplied),
        playerVisual: structuredClone(frame.playerVisual),
      }));
    }, { endIndex, startIndex });
    renderedFrames.push(...chunk);
    console.log(`Mounted Game rendered-frame readback: ${renderedFrames.length}/${renderedFrameCount}.`);
  }

  return {
    ...finalProofBase,
    renderedFrames,
  };
}

export async function runMountedGamePacketCapture(argv) {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }
  if (!args.debugSessionJson) throw new Error("Pass --debug-session-json <file>.");
  if (!args.out) throw new Error("Pass --out <file>.");

  const sessionPath = path.resolve(args.debugSessionJson);
  const sourceSession = JSON.parse(await readFile(sessionPath, "utf8"));
  const { packet: session, sourceWindow } = buildMountedGamePacketWindow(
    sourceSession,
    args.frameStart,
    args.frameEnd,
  );
  const movementId = typeof session.movementId === "string" ? session.movementId : session.id;
  if (!movementId || !/^[A-Za-z0-9_-]+$/.test(movementId)) {
    throw new Error("The packet must include a selector-safe movementId.");
  }
  const routeMovementId = args.routeMovementId || movementId;
  if (!/^[A-Za-z0-9_-]+$/.test(routeMovementId)) {
    throw new Error("--route-movement-id must be selector-safe.");
  }

  const storageState = args.storageState || (
    await fileExists(defaultStorageState) ? defaultStorageState : ""
  );
  const browser = await chromium.launch({ headless: !args.headed });
  let gamePacketServer = null;
  try {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { height: 720, width: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const redirectPath = `/demos/movements/${routeMovementId}/play`;
    if (args.localTestAuth) await signInWithLocalTestAuth(page, args, redirectPath);
    let gamePacketUrl = "/__movement-game-packet.json";
    if (sourceWindow) {
      await page.route("**/__movement-game-packet.json", (route) => route.fulfill({
        body: JSON.stringify(session),
        contentType: "application/json",
      }));
    } else {
      gamePacketServer = await serveLocalJsonFile(sessionPath, {
        name: "__movement-game-packet.json",
      });
      gamePacketUrl = gamePacketServer.url;
    }
    await page.goto(gameUrl(args, routeMovementId, gamePacketUrl), { waitUntil: "domcontentloaded" });
    try {
      await page.getByRole("button", { name: "Begin Practice" }).waitFor({ timeout: 15_000 });
    } catch (error) {
      const pageState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(0, 1000) ?? "",
        proof: window.__sonaeMovementGamePacketProof ?? null,
        title: document.title,
        url: window.location.href,
      }));
      throw new Error(`Mounted Game lobby did not render: ${JSON.stringify(pageState)}. ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await page.waitForFunction(() => window.__sonaeMovementGamePacketProof?.phase === "ready");
    } catch (error) {
      const setupState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(-1200) ?? "",
        proof: window.__sonaeMovementGamePacketProof ?? null,
      }));
      throw new Error(`Mounted Game packet setup did not become ready: ${JSON.stringify(setupState)}. ${error instanceof Error ? error.message : String(error)}`);
    }

    const lobbyProof = await page.evaluate(() => window.__sonaeMovementGamePacketProof);
    await page.getByRole("button", { name: "Begin Practice" }).click();
    const startButton = page.getByRole("button", { name: "Start practice" });
    await startButton.waitFor();
    await startButton.click();
    try {
      await page.waitForFunction(() => {
        const proof = window.__sonaeMovementGamePacketProof;
        return proof?.isPlaying === true || proof?.startGate?.status === "blocked";
      }, null, {
        timeout: 30_000,
      });
      const startProof = await page.evaluate(() => window.__sonaeMovementGamePacketProof);
      if (startProof?.isPlaying !== true) {
        throw new Error(`Game start gate blocked after ${startProof?.preStartFrameCount ?? 0} chronological pre-start frame(s).`);
      }
    } catch (error) {
      const startState = await page.evaluate(() => ({
        bodyText: document.body?.innerText?.slice(-1200) ?? "",
        proof: window.__sonaeMovementGamePacketProof ?? null,
      }));
      throw new Error(`Mounted Game did not start through its normal gate: ${JSON.stringify(startState)}. ${error instanceof Error ? error.message : String(error)}`);
    }
    try {
      await page.waitForFunction(() => {
        const proof = window.__sonaeMovementGamePacketProof;
        return proof && proof.activeFrameStartIndex !== null &&
          proof.playerFrameIndex >= proof.activeFrameStartIndex + 2 &&
          proof.instructorFrameIndex === proof.playerFrameIndex &&
          proof.lastRenderedFrameIndex === proof.playerFrameIndex;
      }, null, { timeout: 15_000 });
    } catch (error) {
      const playbackState = await page.evaluate(() => window.__sonaeMovementGamePacketProof ?? null);
      throw new Error(`Mounted Game did not render its first active frames: ${JSON.stringify(playbackState)}. ${error instanceof Error ? error.message : String(error)}`);
    }
    let visibleScreenshotPath = null;
    let visibleCanvasScreenshotPath = null;
    if (args.canvasScreenshot || args.screenshot) {
      await page.evaluate(() => {
        document.querySelectorAll("[data-movement-avatar-role]").forEach((element) => {
          element.setAttribute("style", "visibility: hidden !important");
        });
        const scrubber = document.querySelector(
          'input[aria-label="Debug frame number"]',
        )?.closest("div.pointer-events-auto");
        if (scrubber) scrubber.style.setProperty("visibility", "hidden", "important");
      });
    }
    if (args.canvasScreenshot) {
      visibleCanvasScreenshotPath = path.resolve(args.canvasScreenshot);
      await mkdir(path.dirname(visibleCanvasScreenshotPath), { recursive: true });
      await page.locator("canvas").first().screenshot({ path: visibleCanvasScreenshotPath });
    }
    if (args.screenshot) {
      visibleScreenshotPath = path.resolve(args.screenshot);
      await mkdir(path.dirname(visibleScreenshotPath), { recursive: true });
      await page.screenshot({ fullPage: false, path: visibleScreenshotPath });
    }

    let pausedProof = null;
    let heldProof = null;
    if (!args.skipPause) {
      await page.getByRole("button", { name: "Pause practice" }).click();
      try {
        await page.waitForFunction(() => window.__sonaeMovementGamePacketProof?.phase === "paused");
      } catch (error) {
        const pauseState = await page.evaluate(() => window.__sonaeMovementGamePacketProof ?? null);
        throw new Error(`Mounted Game did not pause recorded playback: ${JSON.stringify(pauseState)}. ${error instanceof Error ? error.message : String(error)}`);
      }
      pausedProof = await page.evaluate(() => window.__sonaeMovementGamePacketProof);
      await page.waitForTimeout(300);
      heldProof = await page.evaluate(() => window.__sonaeMovementGamePacketProof);
      if (heldProof.playerFrameIndex !== pausedProof.playerFrameIndex) {
        throw new Error("Recorded Game playback advanced while paused.");
      }

      await page.getByRole("button", { name: "Start practice" }).click();
      await page.waitForFunction(() => window.__sonaeMovementGamePacketProof?.isPlaying === true, null, {
        timeout: 30_000,
      });
    }
    const completionDeadline = Date.now() + Math.max(
      180_000,
      Math.max(Number(session.sampleCount || 0) - 60, 0) * 5_000 + 60_000,
    );
    let completionWatchdog = {
      complete: false,
      lastProgressAt: Date.now(),
      playerFrameIndex: -1,
      renderedFrameCount: -1,
      stalled: false,
    };
    while (!completionWatchdog.complete) {
      const completionState = await page.evaluate(() => window.__sonaeMovementGamePacketProof ?? null);
      completionWatchdog = updateMountedGamePlaybackWatchdog({
        nowMs: Date.now(),
        previous: completionWatchdog,
        proof: completionState,
      });
      if (completionWatchdog.stalled) {
        throw new Error(
          `Mounted Game playback stopped making progress: ${JSON.stringify(completionState)}.`,
        );
      }
      if (Date.now() >= completionDeadline) {
        throw new Error(
          `Mounted Game exceeded its progress-aware completion ceiling: ${JSON.stringify(completionState)}.`,
        );
      }
      if (!completionWatchdog.complete) await page.waitForTimeout(1_000);
    }
    const finalProof = await readMountedGamePacketProof(page);
    if (!finalProof) throw new Error("Mounted Game packet proof did not publish a final proof.");
    const uniqueProcessed = new Set(finalProof.processedFrameIndexes);
    const failures = [];
    if (finalProof.contractStatus !== "matched" && !args.allowLegacy) {
      failures.push("input contract was not matched");
    }
    if (finalProof.missingFrameIndexes.length > 0) failures.push("packet frames were skipped");
    if (finalProof.missingRenderedFrameIndexes.length > 0) failures.push("active packet frames were not rendered");
    if (uniqueProcessed.size !== finalProof.processedFrameIndexes.length) failures.push("packet frames were duplicated");
    if (finalProof.instructorFrameIndex !== finalProof.playerFrameIndex) failures.push("instructor/player source indexes diverged");

    const report = {
      code: {
        commit: movementCodeCommit(),
        motionPipelineFingerprint: movementPipelineFingerprint(),
      },
      failures,
      final: finalProof,
      heldFrameIndex: heldProof?.playerFrameIndex ?? null,
      lifecycle: {
        pauseResumeChecked: !args.skipPause,
        playbackMode: args.skipPause ? "uninterrupted" : "pause-resume",
      },
      identity: {
        avatarProfile: finalProof.avatarProfile ?? null,
        instructorAvatarProfile: finalProof.instructorAvatarProfile ?? null,
        inputContractId: finalProof.inputContractId ?? null,
        proofMode: finalProof.proofMode ?? null,
        recordingSchemaVersion: finalProof.recordingSchemaVersion ?? null,
        runtimeContract: finalProof.runtimeContract ?? null,
        setupPolicyId: finalProof.setupPolicyId ?? null,
        sourcePacketHash: finalProof.sourcePacketHash ?? null,
      },
      lobby: lobbyProof,
      passed: failures.length === 0,
      paused: pausedProof,
      proofTier: finalProof.contractStatus === "matched" ? "contract-certified" : "legacy-lifecycle-only",
      route: gameUrl(args, routeMovementId, gamePacketUrl),
      sourceWindow,
      visibleCanvasScreenshotPath,
      visibleScreenshotPath,
    };
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    if (failures.length > 0) throw new Error(`Mounted Game packet proof failed: ${failures.join("; ")}`);
    console.log(`Mounted Game packet proof passed (${finalProof.expectedFrameCount} frame(s)).`);
    console.log(`Wrote ${outPath}`);
  } finally {
    await gamePacketServer?.close();
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runMountedGamePacketCapture(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
