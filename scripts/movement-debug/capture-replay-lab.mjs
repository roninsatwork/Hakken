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
  --session <id-or-tail> Click the matching session before capture
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

function replayUrl(baseUrl) {
  return `${baseUrl.replace(/\/$/, "")}/demos/movements/replay-lab`;
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
  if (!session) return;

  const exact = page.locator(`[data-testid="movement-replay-session"][data-session-id="${session}"]`);
  const partial = page.locator(`[data-testid="movement-replay-session"][data-session-id*="${session}"]`);
  const target = await exact.count() > 0 ? exact.first() : partial.first();

  if (await target.count() === 0) {
    throw new Error(`No replay session matched "${session}".`);
  }

  await target.click();
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

    await page.goto(replayUrl(args.baseUrl), { waitUntil: "domcontentloaded" });

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

      await page.getByTestId("movement-replay-avatar-section").screenshot({ path: avatarPath });
      await page.getByTestId("movement-replay-source-canvas").screenshot({ path: sourcePath });

      captures.push({
        avatarPath,
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
