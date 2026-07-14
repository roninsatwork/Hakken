#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { inflateSync } from "node:zlib";
import { chromium } from "@playwright/test";

const defaultBaseUrl = "http://localhost:3000";
const defaultPlanPath = "tmp/movement-replay-lab/current-game-visual-proof-plan.json";
const defaultOutDir = "tmp/movement-replay-lab/captures/game-visual-proof";
const defaultStorageState = "e2e/.auth/super-admin.json";
export const gameVisualDiagnosticsTitle = "Your Avatar Diagnostics";

function printHelp() {
  console.log(`Capture focused Game Studio visual proof screenshots.

Usage:
  npm run movement:game-visual-capture -- --plan tmp/movement-replay-lab/current-game-visual-proof-plan.json

Options:
  --plan <file>                  Game visual proof plan JSON. Defaults to ${defaultPlanPath}
  --out <dir>                    Output directory. Defaults to ${defaultOutDir}
  --base-url <url>               Override plan URLs to this app URL. Defaults to ${defaultBaseUrl}
  --storage-state <file>         Playwright storage state to reuse for auth
  --local-test-auth              Sign in through /local-test-auth before capture
  --role <role>                  Local-test-auth role. Defaults to super-admin
  --secret <secret>              Local-test-auth secret. Defaults to LOCAL_TEST_AUTH_SECRET
  --max-sessions <n>             Limit selected sessions. Defaults to all
  --max-frames <n>               Limit total target frames. Defaults to all
  --headed                       Show the browser while capturing
  --help                         Show this help
`);
}

function parsePositiveInteger(value, fallback = Number.POSITIVE_INFINITY) {
  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseGameVisualCaptureArgs(argv) {
  const args = {
    baseUrl: defaultBaseUrl,
    headed: false,
    localTestAuth: false,
    maxFrames: Number.POSITIVE_INFINITY,
    maxSessions: Number.POSITIVE_INFINITY,
    outDir: defaultOutDir,
    planPath: defaultPlanPath,
    role: "super-admin",
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
    } else if (arg === "--plan") {
      args.planPath = argv[++index] || args.planPath;
    } else if (arg === "--out") {
      args.outDir = argv[++index] || args.outDir;
    } else if (arg === "--base-url") {
      args.baseUrl = argv[++index] || args.baseUrl;
    } else if (arg === "--storage-state") {
      args.storageState = argv[++index] || "";
    } else if (arg === "--role") {
      args.role = argv[++index] || "super-admin";
    } else if (arg === "--secret") {
      args.secret = argv[++index] || "";
    } else if (arg === "--max-sessions") {
      args.maxSessions = parsePositiveInteger(argv[++index], args.maxSessions);
    } else if (arg === "--max-frames") {
      args.maxFrames = parsePositiveInteger(argv[++index], args.maxFrames);
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

function rewriteBaseUrl(url, baseUrl) {
  if (!url) return "";
  const parsedUrl = new URL(url);
  const parsedBase = new URL(baseUrl);
  parsedUrl.protocol = parsedBase.protocol;
  parsedUrl.host = parsedBase.host;
  return parsedUrl.toString();
}

function frameSpecificRoute(url, frameIndex) {
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.set("debugGameFrame", String(frameIndex));
  return parsedUrl.toString();
}

export function flattenGameVisualCaptureTargets(plan, options = {}) {
  const baseUrl = options.baseUrl || plan?.baseUrl || defaultBaseUrl;
  const maxSessions = options.maxSessions ?? Number.POSITIVE_INFINITY;
  const maxFrames = options.maxFrames ?? Number.POSITIVE_INFINITY;
  const sessions = Array.isArray(plan?.sessions) ? plan.sessions.slice(0, maxSessions) : [];
  const targets = [];

  for (const session of sessions) {
    const frames = Array.isArray(session?.frames) ? session.frames : [];
    for (const frame of frames) {
      const frameIndex = Number.isFinite(frame?.frameIndex) ? frame.frameIndex : 0;
      const playRouteHint = frame?.playRouteHint
        ? frame.playRouteHint
        : session?.playRouteHint ? frameSpecificRoute(session.playRouteHint, frameIndex) : "";
      const url = playRouteHint
        ? rewriteBaseUrl(playRouteHint, baseUrl)
        : `${baseUrl.replace(/\/$/, "")}/demos/movements/${session.movementId}/play?debugTracking=1&guidedPreview=1&debugGameFrame=${frameIndex}`;

      targets.push({
        cases: Array.isArray(frame?.cases) ? frame.cases : [],
        displayLowerLabel: frame?.displayLowerLabel ?? "unknown",
        frameIndex,
        movementId: session?.movementId ?? null,
        proofCases: Array.isArray(session?.proofCases) ? session.proofCases : [],
        recordingId: session?.recordingId ?? "unknown-recording",
        sourceLowerLabel: frame?.sourceLowerLabel ?? "unknown",
        url,
      });
      if (targets.length >= maxFrames) return targets;
    }
  }

  return targets;
}

async function signInWithLocalTestAuth(page, args, redirectPath) {
  if (!args.secret) {
    throw new Error("--local-test-auth requires --secret or LOCAL_TEST_AUTH_SECRET.");
  }

  const url = new URL("/local-test-auth", args.baseUrl);
  url.searchParams.set("role", args.role);
  url.searchParams.set("secret", args.secret);
  url.searchParams.set("redirectTo", redirectPath);

  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });

  const authError = page.getByTestId("local-test-auth-error");
  await Promise.race([
    page.waitForURL((currentUrl) => currentUrl.pathname === redirectPath, { timeout: 45_000 }),
    authError.waitFor({ state: "visible", timeout: 45_000 }).then(async () => {
      const message = await authError.textContent();
      throw new Error(message || "Local test auth failed.");
    }),
  ]);
}

function paethPredictor(left, above, upperLeft) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

export function decodePng(buffer) {
  if (buffer.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error("Expected PNG screenshot data.");
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels = 4;
  const idatChunks = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      if (data[8] !== 8 || ![2, 6].includes(data[9])) {
        throw new Error("Expected an 8-bit RGB/RGBA PNG screenshot.");
      }
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  const bytesPerPixel = channels;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idatChunks));
  const decoded = new Uint8Array(width * height * bytesPerPixel);
  let sourceOffset = 0;

  for (let y = 0; y < height; y += 1) {
    const filterType = inflated[sourceOffset];
    sourceOffset += 1;
    const rowStart = y * stride;
    const previousRowStart = rowStart - stride;

    for (let x = 0; x < stride; x += 1) {
      const raw = inflated[sourceOffset + x];
      const left = x >= bytesPerPixel ? decoded[rowStart + x - bytesPerPixel] : 0;
      const above = y > 0 ? decoded[previousRowStart + x] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel
        ? decoded[previousRowStart + x - bytesPerPixel]
        : 0;

      if (filterType === 0) decoded[rowStart + x] = raw;
      else if (filterType === 1) decoded[rowStart + x] = (raw + left) & 0xff;
      else if (filterType === 2) decoded[rowStart + x] = (raw + above) & 0xff;
      else if (filterType === 3) decoded[rowStart + x] = (raw + Math.floor((left + above) / 2)) & 0xff;
      else if (filterType === 4) decoded[rowStart + x] = (raw + paethPredictor(left, above, upperLeft)) & 0xff;
      else throw new Error(`Unsupported PNG filter ${filterType}`);
    }

    sourceOffset += stride;
  }

  return { channels, data: decoded, height, width };
}

export function canvasPixelMetrics(buffer) {
  const png = decodePng(buffer);
  let nonBackgroundPixels = 0;
  let brightPixels = 0;

  for (let y = 0; y < png.height; y += 1) {
    for (let x = 0; x < png.width; x += 1) {
      const offset = (y * png.width + x) * png.channels;
      const red = png.data[offset] ?? 0;
      const green = png.data[offset + 1] ?? 0;
      const blue = png.data[offset + 2] ?? 0;
      const alpha = png.channels === 4 ? png.data[offset + 3] ?? 255 : 255;
      const isBackground = red < 16 && green < 16 && blue < 24;
      if (alpha > 16 && !isBackground) nonBackgroundPixels += 1;
      if (alpha > 16 && red + green + blue > 180) brightPixels += 1;
    }
  }

  return {
    brightPixels,
    height: png.height,
    nonBackgroundPixels,
    width: png.width,
  };
}

async function captureTarget(page, target, outDir) {
  const targetPart = [
    sanitizeFilePart(target.recordingId.slice(-8)),
    `frame-${target.frameIndex}`,
    sanitizeFilePart(target.cases.join("-") || "target"),
  ].join("-");
  const pagePath = path.join(outDir, `${targetPart}-page.png`);
  const canvasPath = path.join(outDir, `${targetPart}-canvas.png`);

  await page.goto(target.url, { waitUntil: "domcontentloaded" });
  const currentUrl = new URL(page.url());
  if (currentUrl.pathname === "/login") {
    throw new Error("Game visual route redirected to /login.");
  }

  await page.locator("canvas").first().waitFor({ state: "visible", timeout: 45_000 });
  await page.getByText(gameVisualDiagnosticsTitle).waitFor({ state: "visible", timeout: 45_000 });
  await page.waitForTimeout(1_500);

  const requestedFrame = new URL(target.url).searchParams.get("debugGameFrame");
  let capturedDebugFrameIndex = null;
  if (requestedFrame !== null) {
    const frameNumberInput = page.getByLabel("Debug frame number");
    await frameNumberInput.waitFor({ state: "visible", timeout: 45_000 });
    const capturedFrameNumber = Number(await frameNumberInput.inputValue());
    capturedDebugFrameIndex = Number.isFinite(capturedFrameNumber) ? capturedFrameNumber - 1 : null;
    if (capturedDebugFrameIndex !== Number(requestedFrame)) {
      throw new Error(`Expected debug frame ${requestedFrame}, captured frame ${capturedDebugFrameIndex ?? "unknown"}.`);
    }
  }

  const canvas = page.locator("canvas").first();
  const canvasBuffer = await canvas.screenshot({ path: canvasPath });
  const pageBuffer = await page.screenshot({ fullPage: false, path: pagePath });
  const metrics = canvasPixelMetrics(canvasBuffer);
  const avatarDebug = await page.evaluate(() => (
    window.__sonaeMovementAvatarDebug ?? null
  ));
  const runtimeSetup = await page.evaluate(() => (
    window.__sonaeMovementRecordedPlayerSetup ?? null
  ));

  return {
    avatarDebug,
    canvasPath,
    capturedDebugFrameIndex,
    currentUrl: page.url(),
    metrics,
    pagePath,
    pageScreenshotBytes: pageBuffer.byteLength,
    runtimeSetup,
    status: metrics.nonBackgroundPixels > 1_000 ? "captured" : "needs-review",
    target,
  };
}

async function main() {
  const args = parseGameVisualCaptureArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const plan = JSON.parse(await readFile(path.resolve(args.planPath), "utf8"));
  const targets = flattenGameVisualCaptureTargets(plan, {
    baseUrl: args.baseUrl,
    maxFrames: args.maxFrames,
    maxSessions: args.maxSessions,
  });
  if (targets.length === 0) {
    throw new Error("No Game visual proof targets found in the plan.");
  }

  const storageState = args.storageState || (await fileExists(defaultStorageState) ? defaultStorageState : "");
  await mkdir(args.outDir, { recursive: true });

  const browser = await chromium.launch({ headless: !args.headed });
  const captures = [];
  const errors = [];

  try {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { width: 1440, height: 1100 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(45_000);

    if (args.localTestAuth) {
      const firstTargetPath = new URL(targets[0].url).pathname;
      await signInWithLocalTestAuth(page, args, firstTargetPath);
    }

    for (const target of targets) {
      try {
        captures.push(await captureTarget(page, target, args.outDir));
        console.log(`Captured ${target.recordingId} frame ${target.frameIndex}: ${target.cases.join(", ") || "target"}`);
      } catch (error) {
        errors.push({
          message: error instanceof Error ? error.message : String(error),
          target,
        });
        console.error(`Failed ${target.recordingId} frame ${target.frameIndex}: ${errors.at(-1).message}`);
      }
    }

    await context.close();
  } finally {
    await browser.close();
  }

  const manifest = {
    baseUrl: args.baseUrl,
    capturedAt: new Date().toISOString(),
    captures,
    errors,
    planPath: path.resolve(args.planPath),
    storageState: storageState || null,
    summary: {
      capturedCount: captures.length,
      errorCount: errors.length,
      needsReviewCount: captures.filter((capture) => capture.status === "needs-review").length,
      targetCount: targets.length,
    },
  };
  const manifestPath = path.join(args.outDir, "game-visual-proof-captures-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(
    `Game visual capture: ${manifest.summary.capturedCount}/${manifest.summary.targetCount} captured, ${manifest.summary.errorCount} error(s), ${manifest.summary.needsReviewCount} needs-review.`,
  );
  console.log(`Wrote ${path.resolve(args.outDir)}`);

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
