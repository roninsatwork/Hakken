#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const defaultBaseUrl = "http://localhost:3000";
const defaultStorageState = "e2e/.auth/super-admin.json";

function parseArgs(argv) {
  const args = {
    allowLegacy: false,
    baseUrl: defaultBaseUrl,
    debugSessionJson: "",
    headed: false,
    localTestAuth: false,
    out: "",
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
    skipPause: false,
    storageState: "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--allow-legacy") args.allowLegacy = true;
    else if (arg === "--headed") args.headed = true;
    else if (arg === "--local-test-auth") args.localTestAuth = true;
    else if (arg === "--skip-pause") args.skipPause = true;
    else if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--debug-session-json") args.debugSessionJson = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--storage-state") args.storageState = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
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
  --storage-state <file> Playwright storage state
  --allow-legacy         Exercise lifecycle but do not certify a missing input contract
  --local-test-auth      Sign in through /local-test-auth
  --role <role>          Local auth role. Defaults to super-admin
  --secret <secret>      Local auth secret
  --skip-pause           Keep playback uninterrupted for Replay/Game parity
  --headed               Show the browser
`);
}

function gameUrl(args, movementId) {
  const url = new URL(`/demos/movements/${movementId}/play`, args.baseUrl);
  url.searchParams.set("debugTracking", "1");
  url.searchParams.set("debugGamePacketUrl", "/__movement-game-packet.json");
  return url.toString();
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
  const session = JSON.parse(await readFile(sessionPath, "utf8"));
  const movementId = typeof session.movementId === "string" ? session.movementId : session.id;
  if (!movementId || !/^[A-Za-z0-9_-]+$/.test(movementId)) {
    throw new Error("The packet must include a selector-safe movementId.");
  }

  const storageState = args.storageState || (
    await fileExists(defaultStorageState) ? defaultStorageState : ""
  );
  const browser = await chromium.launch({ headless: !args.headed });
  try {
    const context = await browser.newContext({
      storageState: storageState || undefined,
      viewport: { height: 720, width: 1080 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(60_000);
    const redirectPath = `/demos/movements/${movementId}/play`;
    if (args.localTestAuth) await signInWithLocalTestAuth(page, args, redirectPath);
    await page.route("**/__movement-game-packet.json", (route) => route.fulfill({
      contentType: "application/json",
      path: sessionPath,
    }));
    await page.goto(gameUrl(args, movementId), { waitUntil: "domcontentloaded" });
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
    try {
      await page.waitForFunction(() => window.__sonaeMovementGamePacketProof?.phase === "complete", null, {
        timeout: Math.max(
          90_000,
          Math.max(Number(session.sampleCount || 0) - 60, 0) * 150 + 60_000,
        ),
      });
    } catch (error) {
      const completionState = await page.evaluate(() => window.__sonaeMovementGamePacketProof ?? null);
      throw new Error(`Mounted Game did not complete packet playback: ${JSON.stringify(completionState)}. ${error instanceof Error ? error.message : String(error)}`);
    }
    const finalProof = await page.evaluate(() => window.__sonaeMovementGamePacketProof);
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
      failures,
      final: finalProof,
      heldFrameIndex: heldProof?.playerFrameIndex ?? null,
      lifecycle: {
        pauseResumeChecked: !args.skipPause,
        playbackMode: args.skipPause ? "uninterrupted" : "pause-resume",
      },
      lobby: lobbyProof,
      passed: failures.length === 0,
      paused: pausedProof,
      proofTier: finalProof.contractStatus === "matched" ? "contract-certified" : "legacy-lifecycle-only",
      route: gameUrl(args, movementId),
    };
    const outPath = path.resolve(args.out);
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`);
    if (failures.length > 0) throw new Error(`Mounted Game packet proof failed: ${failures.join("; ")}`);
    console.log(`Mounted Game packet proof passed (${finalProof.expectedFrameCount} frame(s)).`);
    console.log(`Wrote ${outPath}`);
  } finally {
    await browser.close();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  runMountedGamePacketCapture(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
