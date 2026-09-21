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
  url.searchParams.set("debugPoseTransition", "1");
  await page.goto(url.toString(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => Boolean(window.__hakkenMovementAvatarDebug?.player?.avatarVisual), null, {
    timeout: 60_000,
  });
  await page.waitForTimeout(1_800);
  return page.evaluate(() => structuredClone(window.__hakkenMovementAvatarDebug.player));
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
    const rightArm = await readPoseDebug(page, args, "right-arm-raise");
    const head = await readPoseDebug(page, args, "head-down");
    const sideBend = await readPoseDebug(page, args, "side-bend");
    const farSideBend = await readPoseDebug(page, args, "far-side-bend");
    const squat = await readPoseDebug(page, args, "squat");
    const farSquat = await readPoseDebug(page, args, "far-squat");
    const leg = await readPoseDebug(page, args, "left-leg-raise");
    const farLeg = await readPoseDebug(page, args, "far-left-leg-raise");
    const rightLeg = await readPoseDebug(page, args, "right-leg-raise");
    const farRightLeg = await readPoseDebug(page, args, "far-right-leg-raise");
    const legOut = await readPoseDebug(page, args, "left-leg-out-45");
    const farLegOut = await readPoseDebug(page, args, "far-left-leg-out-45");
    const rightLegOut = await readPoseDebug(page, args, "right-leg-out-45");
    const farRightLegOut = await readPoseDebug(page, args, "far-right-leg-out-45");
    const rootTurn = await readPoseDebug(page, args, "root-turn-right");
    const jumpingJack = await readPoseDebug(page, args, "jumping-jack");
    const leftHand = await readPoseDebug(page, args, "left-hand-curl");
    const rightHand = await readPoseDebug(page, args, "right-hand-curl");
    const winkLeft = await readPoseDebug(page, args, "wink-left");
    const winkRight = await readPoseDebug(page, args, "wink-right");
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
      farLeftLegOut45: {
        avatarRightThighX: segment(farLegOut, "rightThigh")?.x ?? 0,
        avatarRightThighError: farLegOut.avatarVisual?.segments?.rightThigh?.sourceError ?? 1,
      },
      rightLegOut45: {
        avatarLeftThighX: segment(rightLegOut, "leftThigh")?.x ?? 0,
        avatarLeftThighError: rightLegOut.avatarVisual?.segments?.leftThigh?.sourceError ?? 1,
      },
      farRightLegOut45: {
        avatarLeftThighX: segment(farRightLegOut, "leftThigh")?.x ?? 0,
        avatarLeftThighError: farRightLegOut.avatarVisual?.segments?.leftThigh?.sourceError ?? 1,
      },
      rightLegRaise: {
        avatarLeftThighY: segment(rightLeg, "leftThigh")?.y ?? 0,
        avatarRightThighY: segment(rightLeg, "rightThigh")?.y ?? 0,
      },
      mirrorLeftArmRaise: {
        avatarLeftUpperArmY: segment(arm, "leftUpperArm")?.y ?? 0,
        avatarRightUpperArmY: segment(arm, "rightUpperArm")?.y ?? 0,
      },
      mirrorRightArmRaise: {
        avatarLeftUpperArmY: segment(rightArm, "leftUpperArm")?.y ?? 0,
        avatarRightUpperArmY: segment(rightArm, "rightUpperArm")?.y ?? 0,
      },
      squat: {
        averageLowerBodyDirectionError: squat.avatarVisual?.averageLowerBodyDirectionError ?? 1,
        leftShinY: segment(squat, "leftShin")?.y ?? -1,
        rightShinY: segment(squat, "rightShin")?.y ?? -1,
        sourceDepth: squat.retarget?.squatDepth ?? 0,
        targetHeightDrop: squat.avatarRoot?.targetHeightDrop ?? 0,
      },
      sideBend: {
        renderedSpineX: segment(sideBend, "spine")?.x ?? 0,
        sourceSideBend: sideBend.spineDrive?.sideBend ?? 0,
      },
      farSideBend: {
        renderedSpineX: segment(farSideBend, "spine")?.x ?? 0,
        sourceSideBend: farSideBend.spineDrive?.sideBend ?? 0,
      },
      farSquat: {
        averageLowerBodyDirectionError: farSquat.avatarVisual?.averageLowerBodyDirectionError ?? 1,
        fallbacks: farSquat.fallbacks ?? null,
        retarget: farSquat.retarget ?? null,
        sourceDepth: farSquat.retarget?.squatDepth ?? 0,
        targetHeightDrop: farSquat.avatarRoot?.targetHeightDrop ?? 0,
      },
      farLeftLegRaise: {
        avatarLeftThighY: segment(farLeg, "leftThigh")?.y ?? 0,
        avatarRightThighY: segment(farLeg, "rightThigh")?.y ?? 0,
      },
      farRightLegRaise: {
        avatarLeftThighY: segment(farRightLeg, "leftThigh")?.y ?? 0,
        avatarRightThighY: segment(farRightLeg, "rightThigh")?.y ?? 0,
      },
      rootTurn: {
        appliedYaw: rootTurn.avatarRoot?.appliedYaw ?? 0,
        targetYaw: rootTurn.avatarRoot?.targetYaw ?? 0,
      },
      hands: {
        leftCurl: leftHand.avatarHands?.left?.curlMagnitude ?? 0,
        rightCurl: rightHand.avatarHands?.right?.curlMagnitude ?? 0,
      },
      face: {
        winkLeft: winkLeft.avatarExpressions?.blinkLeft ?? 0,
        winkRight: winkRight.avatarExpressions?.blinkRight ?? 0,
      },
      jumpingJack: {
        avatarLeftUpperArmY: segment(jumpingJack, "leftUpperArm")?.y ?? 0,
        avatarRightUpperArmY: segment(jumpingJack, "rightUpperArm")?.y ?? 0,
        comparedLowerBodySegments: jumpingJack.avatarVisual?.comparedLowerBodySegments ?? 0,
      },
    };
    const failures = [];
    if (
      measurements.mirrorLeftArmRaise.avatarRightUpperArmY <= 0.25 ||
      measurements.mirrorLeftArmRaise.avatarLeftUpperArmY >= -0.25
    ) failures.push("mirror-left-arm-did-not-drive-avatar-right");
    if (
      measurements.mirrorRightArmRaise.avatarLeftUpperArmY <= 0.25 ||
      measurements.mirrorRightArmRaise.avatarRightUpperArmY >= -0.25
    ) failures.push("mirror-right-arm-did-not-drive-avatar-left");
    if (
      Math.abs(measurements.head.sourcePitch) < 0.12 ||
      Math.abs(measurements.head.renderedPitch) < 0.08
    ) failures.push("head-down-did-not-reach-rendered-head");
    if (
      Math.abs(measurements.sideBend.sourceSideBend) < 0.4 ||
      Math.abs(measurements.sideBend.renderedSpineX) < 0.25
    ) failures.push("side-bend-did-not-reach-rendered-spine");
    if (
      Math.abs(measurements.farSideBend.sourceSideBend) < 0.4 ||
      Math.abs(measurements.farSideBend.renderedSpineX) < 0.25
    ) failures.push("far-side-bend-did-not-reach-rendered-spine");
    if (
      measurements.leftLegRaise.avatarRightThighY <= 0.2 ||
      measurements.leftLegRaise.avatarLeftThighY >= -0.2
    ) failures.push("mirror-left-leg-did-not-drive-avatar-right");
    if (
      measurements.rightLegRaise.avatarLeftThighY <= 0.2 ||
      measurements.rightLegRaise.avatarRightThighY >= -0.2
    ) failures.push("mirror-right-leg-did-not-drive-avatar-left");
    if (
      measurements.farLeftLegRaise.avatarRightThighY <= 0.2 ||
      measurements.farLeftLegRaise.avatarLeftThighY >= -0.2
    ) failures.push("far-mirror-left-leg-did-not-drive-avatar-right");
    if (
      measurements.farRightLegRaise.avatarLeftThighY <= 0.2 ||
      measurements.farRightLegRaise.avatarRightThighY >= -0.2
    ) failures.push("far-mirror-right-leg-did-not-drive-avatar-left");
    if (
      Math.abs(measurements.leftLegOut45.avatarRightThighX) < 0.45 ||
      measurements.leftLegOut45.avatarRightThighError > 0.08
    ) failures.push("leg-out-45-did-not-reach-rendered-avatar");
    if (
      Math.abs(measurements.farLeftLegOut45.avatarRightThighX) < 0.45 ||
      measurements.farLeftLegOut45.avatarRightThighError > 0.08
    ) failures.push("far-leg-out-45-did-not-reach-rendered-avatar");
    if (
      Math.abs(measurements.rightLegOut45.avatarLeftThighX) < 0.45 ||
      measurements.rightLegOut45.avatarLeftThighError > 0.08
    ) failures.push("right-leg-out-45-did-not-reach-rendered-avatar");
    if (
      Math.abs(measurements.farRightLegOut45.avatarLeftThighX) < 0.45 ||
      measurements.farRightLegOut45.avatarLeftThighError > 0.08
    ) failures.push("far-right-leg-out-45-did-not-reach-rendered-avatar");
    if (
      measurements.squat.sourceDepth < 0.25 ||
      measurements.squat.targetHeightDrop < 0.12 ||
      measurements.squat.averageLowerBodyDirectionError > 0.35 ||
      Math.min(measurements.squat.leftShinY, measurements.squat.rightShinY) < -0.98
    ) failures.push("squat-did-not-reach-rendered-avatar");
    if (
      measurements.farSquat.sourceDepth < 0.25 ||
      measurements.farSquat.targetHeightDrop < 0.12 ||
      measurements.farSquat.averageLowerBodyDirectionError > 0.35
    ) failures.push("far-squat-did-not-reach-rendered-avatar");
    if (
      Math.min(
        measurements.jumpingJack.avatarLeftUpperArmY,
        measurements.jumpingJack.avatarRightUpperArmY,
      ) < 0.2 ||
      measurements.jumpingJack.comparedLowerBodySegments < 4
    ) failures.push("jumping-jack-did-not-reach-rendered-avatar");
    if (Math.abs(measurements.rootTurn.targetYaw) < 0.25) {
      failures.push("root-turn-did-not-establish-rendered-history");
    }
    if (measurements.hands.leftCurl < 0.1 || measurements.hands.rightCurl < 0.1) {
      failures.push("hand-curl-did-not-reach-rendered-hands");
    }
    if (measurements.face.winkLeft < 0.2 || measurements.face.winkRight < 0.2) {
      failures.push("asymmetric-blink-did-not-reach-rendered-face");
    }

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
