#!/usr/bin/env node

import { chromium } from "@playwright/test";

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    movementId: "",
    role: "super-admin",
    secret: process.env.LOCAL_TEST_AUTH_SECRET || "",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--base-url") args.baseUrl = argv[++index] || args.baseUrl;
    else if (arg === "--movement-id") args.movementId = argv[++index] || "";
    else if (arg === "--role") args.role = argv[++index] || args.role;
    else if (arg === "--secret") args.secret = argv[++index] || "";
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Verify the actual Game Studio player avatar for mirror-side arms, head pitch, side bend, and raised legs.

Usage:
  npm run movement:avatar:live-behavior-gate -- --movement-id <id> --secret <local-test-auth-secret>
`);
}

async function signIn(page, args) {
  if (!args.secret) throw new Error("Pass --secret or LOCAL_TEST_AUTH_SECRET.");
  const url = new URL("/local-test-auth", args.baseUrl);
  url.searchParams.set("role", args.role);
  url.searchParams.set("secret", args.secret);
  url.searchParams.set("redirectTo", "/demos/movements");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForURL((currentUrl) => currentUrl.pathname === "/demos/movements", { timeout: 45_000 });
}

async function readPoseDebug(page, args, mode) {
  const url = new URL(`/demos/movements/${args.movementId}/play`, args.baseUrl);
  url.searchParams.set("debugTracking", "1");
  url.searchParams.set("debugPlayerPose", mode);
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__sonaeMovementAvatarDebug?.player?.avatarVisual), null, {
    timeout: 60_000,
  });
  return page.evaluate(() => structuredClone(window.__sonaeMovementAvatarDebug.player));
}

function segment(debug, name) {
  return debug?.avatarVisual?.segments?.[name]?.direction ?? null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.movementId) throw new Error("Pass --movement-id <id>.");

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 960, height: 720 } });
    const page = await context.newPage();
    await signIn(page, args);

    const arm = await readPoseDebug(page, args, "left-arm-raise");
    const head = await readPoseDebug(page, args, "head-down");
    const sideBend = await readPoseDebug(page, args, "side-bend");
    const leg = await readPoseDebug(page, args, "left-leg-raise");
    const legOut = await readPoseDebug(page, args, "left-leg-out-45");
    const measurements = {
      head: {
        renderedPitch: head.avatarHead?.bonePitch ?? 0,
        sourcePitch: head.headRaw?.pitch ?? 0,
      },
      leftLegRaise: {
        avatarLeftThighY: segment(leg, "leftThigh")?.y ?? 0,
        avatarRightThighY: segment(leg, "rightThigh")?.y ?? 0,
      },
      leftLegOut45: {
        avatarRightThighX: segment(legOut, "rightThigh")?.x ?? 0,
        avatarRightThighError: legOut.avatarVisual?.segments?.rightThigh?.sourceError ?? 1,
      },
      mirrorLeftArmRaise: {
        avatarLeftUpperArmY: segment(arm, "leftUpperArm")?.y ?? 0,
        avatarRightUpperArmY: segment(arm, "rightUpperArm")?.y ?? 0,
      },
      sideBend: {
        renderedSpineX: segment(sideBend, "spine")?.x ?? 0,
        sourceSideBend: sideBend.spineDrive?.sideBend ?? 0,
      },
    };
    const failures = [];
    if (
      measurements.mirrorLeftArmRaise.avatarRightUpperArmY <= 0.25 ||
      measurements.mirrorLeftArmRaise.avatarLeftUpperArmY >= -0.25
    ) failures.push("mirror-left-arm-did-not-drive-avatar-right");
    if (
      Math.abs(measurements.head.sourcePitch) < 0.12 ||
      Math.abs(measurements.head.renderedPitch) < 0.08 ||
      Math.sign(measurements.head.sourcePitch) !== Math.sign(measurements.head.renderedPitch)
    ) failures.push("head-down-did-not-reach-rendered-head");
    if (
      Math.abs(measurements.sideBend.sourceSideBend) < 0.4 ||
      Math.abs(measurements.sideBend.renderedSpineX) < 0.25
    ) failures.push("side-bend-did-not-reach-rendered-spine");
    if (
      measurements.leftLegRaise.avatarRightThighY <= 0.2 ||
      measurements.leftLegRaise.avatarLeftThighY >= -0.2
    ) failures.push("mirror-left-leg-did-not-drive-avatar-right");
    if (
      Math.abs(measurements.leftLegOut45.avatarRightThighX) < 0.45 ||
      measurements.leftLegOut45.avatarRightThighError > 0.08
    ) failures.push("leg-out-45-did-not-reach-rendered-avatar");

    const report = {
      failures,
      measurements,
      movementId: args.movementId,
      status: failures.length === 0 ? "passed" : "blocked",
    };
    console.log(JSON.stringify(report, null, 2));
    if (failures.length > 0) process.exitCode = 1;
    await context.close();
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
