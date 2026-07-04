import { inflateSync } from "node:zlib";
import { expect, type Page, test, type TestInfo } from "@playwright/test";
import { gotoWithoutServerCrash, skipWhenRedirectedToLogin } from "./helpers/navigation";
import {
  makeMovementAvatarProofPose,
  type MovementAvatarProofMode,
} from "../src/app/(dashboard)/demos/movements/_lib/movementAvatarProofFixtures";
import type {
  MovementDebugReplayFrame,
  MovementDebugReplaySession,
} from "../src/app/(dashboard)/demos/movements/_lib/movementDebugReplay";
import { buildMovementGamePathSimulation } from "../src/app/(dashboard)/demos/movements/_lib/movementGamePathSimulation";
import type { TrackingLandmark } from "../src/app/(dashboard)/demos/movements/_lib/movementTrackingCalibration";

process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY ??= "1";

type AvatarProofCase = {
  mode: MovementAvatarProofMode;
  label: string;
  baselinePattern: RegExp;
  ownerPattern: RegExp;
  spinePattern: RegExp;
};

type DecodedPng = {
  channels: 3 | 4;
  data: Uint8Array;
  height: number;
  width: number;
};

type AvatarVisualMetrics = {
  bounds: {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
  };
  centerY: number;
  height: number;
  visiblePixels: number;
  width: number;
};

type AvatarProofCapture = {
  metrics: AvatarVisualMetrics;
  png: DecodedPng;
};

const proofCases: AvatarProofCase[] = [
  {
    mode: "standing",
    label: "Standing",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "side-bend",
    label: "Side bend",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /torso player-spine-model/i,
    spinePattern: /Spine: player-spine-model/i,
  },
  {
    mode: "hands-front",
    label: "Hands front",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /torso player-spine-neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "head-up",
    label: "Head up",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /head player-calibrated/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "head-down",
    label: "Head down",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /head player-calibrated/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "head-left",
    label: "Head left",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /head player-calibrated/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "head-right",
    label: "Head right",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /head player-calibrated/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "squat",
    label: "Squat",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-stable-squat/i,
    spinePattern: /Spine: player-spine-model/i,
  },
  {
    mode: "far-squat",
    label: "Far squat",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-stable-squat/i,
    spinePattern: /Spine: player-spine-model/i,
  },
  {
    mode: "left-leg-raise",
    label: "Left leg raise",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-right-leg-raise/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "far-left-leg-raise",
    label: "Far left leg raise",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-right-leg-raise/i,
    spinePattern: /Spine: player-spine-model/i,
  },
  {
    mode: "right-leg-raise",
    label: "Right leg raise",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-left-leg-raise/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "root-turn-left",
    label: "Root turn left",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "root-turn-right",
    label: "Root turn right",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "root-travel-right",
    label: "Root travel right",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "root-travel-left",
    label: "Root travel left",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "root-travel-forward",
    label: "Root travel forward",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "root-travel-back",
    label: "Root travel back",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "root-turn-travel",
    label: "Root turn and travel",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "far-right-leg-raise",
    label: "Far right leg raise",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-left-leg-raise/i,
    spinePattern: /Spine: player-spine-model/i,
  },
  {
    mode: "weak-feet-standing",
    label: "Weak feet standing",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower player-lower-body-neutral; feet neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "lower-body-out-of-frame",
    label: "Lower body out of frame",
    baselinePattern: /Baseline: manual-calibration/i,
    ownerPattern: /lower neutral; feet neutral/i,
    spinePattern: /Spine: player-upper-body-neutral/i,
  },
  {
    mode: "upper-body-auto",
    label: "Upper-body auto baseline",
    baselinePattern: /Baseline: upper-body-auto-baseline/i,
    ownerPattern: /torso player-spine-neutral/i,
    spinePattern: /Spine: player-spine-neutral/i,
  },
  {
    mode: "upper-body-auto-rejected",
    label: "Upper-body auto rejected",
    baselinePattern: /Baseline: none/i,
    ownerPattern: /torso neutral/i,
    spinePattern: /Spine: player-spine-held/i,
  },
];

const gamePathProofModes: MovementAvatarProofMode[] = [
  "standing",
  "head-up",
  "head-down",
  "head-left",
  "head-right",
  "squat",
  "far-squat",
  "left-leg-raise",
  "far-left-leg-raise",
  "right-leg-raise",
  "far-right-leg-raise",
  "weak-feet-standing",
  "lower-body-out-of-frame",
];

function paethPredictor(left: number, above: number, upperLeft: number) {
  const estimate = left + above - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const aboveDistance = Math.abs(estimate - above);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= aboveDistance && leftDistance <= upperLeftDistance) return left;
  if (aboveDistance <= upperLeftDistance) return above;
  return upperLeft;
}

function decodePng(buffer: Buffer): DecodedPng {
  const pngSignature = "89504e470d0a1a0a";
  expect(buffer.subarray(0, 8).toString("hex")).toBe(pngSignature);

  let offset = 8;
  let width = 0;
  let height = 0;
  let channels: 3 | 4 = 4;
  const idatChunks: Buffer[] = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect(data[8], "Expected 8-bit screenshot PNG").toBe(8);
      expect([2, 6], "Expected RGB or RGBA screenshot PNG").toContain(data[9]);
      channels = data[9] === 6 ? 4 : 3;
    } else if (type === "IDAT") {
      idatChunks.push(data);
    } else if (type === "IEND") {
      break;
    }
  }

  expect(width, "Expected PNG width").toBeGreaterThan(0);
  expect(height, "Expected PNG height").toBeGreaterThan(0);

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
      else if (filterType === 4) {
        decoded[rowStart + x] = (raw + paethPredictor(left, above, upperLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter ${filterType}`);
      }
    }

    sourceOffset += stride;
  }

  return { channels, data: decoded, height, width };
}

function getPlayerAvatarRegion(png: DecodedPng) {
  return {
    maxX: Math.floor(png.width * 0.82),
    maxY: Math.floor(png.height * 0.74),
    minX: Math.floor(png.width * 0.52),
    minY: Math.floor(png.height * 0.18),
  };
}

function getPixelChannels(png: DecodedPng, x: number, y: number) {
  const offset = (y * png.width + x) * png.channels;

  return {
    alpha: png.channels === 4 ? png.data[offset + 3] : 255,
    blue: png.data[offset + 2],
    green: png.data[offset + 1],
    red: png.data[offset],
  };
}

function isVisibleAvatarPixel(png: DecodedPng, x: number, y: number) {
  const { alpha, blue, green, red } = getPixelChannels(png, x, y);
  const maxChannel = Math.max(red, green, blue);
  const minChannel = Math.min(red, green, blue);
  const brightness = red + green + blue;

  return alpha > 200 && brightness > 120 && maxChannel - minChannel > 18;
}

function getPlayerAvatarMetrics(png: DecodedPng): AvatarVisualMetrics {
  const region = getPlayerAvatarRegion(png);
  const bounds = {
    maxX: 0,
    maxY: 0,
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
  };
  let visiblePixels = 0;

  for (let y = region.minY; y < region.maxY; y += 1) {
    for (let x = region.minX; x < region.maxX; x += 1) {
      if (isVisibleAvatarPixel(png, x, y)) {
        visiblePixels += 1;
        bounds.minX = Math.min(bounds.minX, x);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
    }
  }

  if (visiblePixels === 0) {
    return {
      bounds: {
        maxX: 0,
        maxY: 0,
        minX: 0,
        minY: 0,
      },
      centerY: 0,
      height: 0,
      visiblePixels,
      width: 0,
    };
  }

  return {
    bounds,
    centerY: (bounds.minY + bounds.maxY) / 2,
    height: bounds.maxY - bounds.minY + 1,
    visiblePixels,
    width: bounds.maxX - bounds.minX + 1,
  };
}

function countPlayerRegionPixelDifference(before: DecodedPng, after: DecodedPng) {
  expect(after.width).toBe(before.width);
  expect(after.height).toBe(before.height);

  const region = getPlayerAvatarRegion(before);
  let changedPixels = 0;

  for (let y = region.minY; y < region.maxY; y += 1) {
    for (let x = region.minX; x < region.maxX; x += 1) {
      const beforePixel = getPixelChannels(before, x, y);
      const afterPixel = getPixelChannels(after, x, y);
      const delta =
        Math.abs(beforePixel.red - afterPixel.red) +
        Math.abs(beforePixel.green - afterPixel.green) +
        Math.abs(beforePixel.blue - afterPixel.blue);

      if (delta > 80) changedPixels += 1;
    }
  }

  return changedPixels;
}

function expectVisiblePlayerAvatar(metrics: AvatarVisualMetrics, mode: MovementAvatarProofMode) {
  expect(
    metrics.visiblePixels,
    `${mode} should render visible player-avatar pixels in the right-side proof region`,
  ).toBeGreaterThan(900);
}

async function captureProofScreenshot(
  page: Page,
  testInfo: TestInfo,
  mode: MovementAvatarProofMode,
): Promise<AvatarProofCapture> {
  await expect.poll(async () => {
    const pendingScreenshot = await page.screenshot({ fullPage: false });
    const pendingPng = decodePng(pendingScreenshot);
    return getPlayerAvatarMetrics(pendingPng).visiblePixels;
  }, {
    message: `${mode} should finish rendering visible player-avatar pixels in the right-side proof region`,
    timeout: 5000,
  }).toBeGreaterThan(900);

  const screenshot = await page.screenshot({ fullPage: false });
  const png = decodePng(screenshot);
  const metrics = getPlayerAvatarMetrics(png);

  expectVisiblePlayerAvatar(metrics, mode);

  await testInfo.attach(`movement-avatar-proof-${mode}`, {
    body: screenshot,
    contentType: "image/png",
  });

  await testInfo.attach(`movement-avatar-proof-${mode}-metrics`, {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });

  return {
    metrics,
    png,
  };
}

async function openAvatarProofMode(page: Page, proofCase: AvatarProofCase) {
  const isAlreadyOnProofPage = (() => {
    try {
      return new URL(page.url()).pathname === "/demos/movements/squat-proof";
    } catch {
      return false;
    }
  })();

  if (isAlreadyOnProofPage) {
    await page.getByTestId(`proof-mode-${proofCase.mode}`).click();
  } else {
    await gotoWithoutServerCrash(page, `/demos/movements/squat-proof?mode=${proofCase.mode}`);
    await skipWhenRedirectedToLogin(page, "Movement avatar proof eval requires the super-admin storage state.");
  }

  await expect(page.getByRole("heading", { name: "Synthetic player camera poses" })).toBeVisible();
  await expect(page.getByTestId("proof-current-mode")).toHaveText(
    `Current proof state: ${proofCase.label}`,
  );
  await expect(page.locator("canvas")).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId("proof-debug-owners")).toHaveText(proofCase.ownerPattern, {
    timeout: 30000,
  });
}

function proofCaseFor(mode: MovementAvatarProofMode) {
  const proofCase = proofCases.find((candidate) => candidate.mode === mode);
  expect(proofCase, `Expected proof case for ${mode}`).toBeDefined();
  return proofCase!;
}

function proofFrame(mode: MovementAvatarProofMode, capturedAt: number): MovementDebugReplayFrame {
  const pose = makeMovementAvatarProofPose(mode) as TrackingLandmark[];

  return {
    bodyConfidence: {},
    capturedAt,
    fallbacks: {},
    tracking: {
      pose,
      worldPose: pose,
    },
  };
}

function proofGamePathSession(mode: MovementAvatarProofMode): MovementDebugReplaySession {
  return {
    baselineSummary: "manual-calibration:1",
    durationMs: 1000,
    endedAt: 2000,
    id: `proof-${mode}`,
    movementId: "synthetic-proof",
    sampleCount: 2,
    samples: [
      proofFrame("standing", 1000),
      proofFrame(mode, 2000),
    ],
    startedAt: 1000,
    trigger: "synthetic-proof",
    warningSummary: "none",
  };
}

function expectedGamePathOwners(mode: MovementAvatarProofMode) {
  const simulation = buildMovementGamePathSimulation(proofGamePathSession(mode));
  const decision = simulation.decisions[1];
  expect(decision, `Expected game-path decision for ${mode}`).toBeDefined();

  return {
    feetOwner: decision!.feetOwner,
    lowerOwner: decision!.lowerOwner,
  };
}

test.describe("Movement Avatar Proof Eval", () => {
  test("synthetic player proof owners match the game-path simulation harness", async ({ page }) => {
    for (const mode of gamePathProofModes) {
      const expectedOwners = expectedGamePathOwners(mode);
      await openAvatarProofMode(page, proofCaseFor(mode));

      const ownerText = page.getByTestId("proof-debug-owners");
      await expect(ownerText).toContainText(`lower ${expectedOwners.lowerOwner}`);
      await expect(ownerText).toContainText(`feet ${expectedOwners.feetOwner}`);
    }
  });

  for (const proofCase of proofCases) {
    test(`synthetic webcam skeleton drives ${proofCase.label.toLowerCase()} avatar state`, async ({
      page,
    }, testInfo) => {
      await openAvatarProofMode(page, proofCase);

      await expect(page.getByTestId("proof-debug-baseline")).toHaveText(
        proofCase.baselinePattern,
      );
      await expect(page.getByTestId("proof-debug-spine")).toHaveText(proofCase.spinePattern);
      await expect(page.getByTestId("proof-debug-arm-depth")).toHaveText(
        /Arms: player-2d-safe-arms/i,
      );
      await expect(page.getByTestId("proof-debug-owners")).toHaveText(proofCase.ownerPattern);

      await captureProofScreenshot(page, testInfo, proofCase.mode);
    });
  }

  test("synthetic poses produce distinct rendered avatar silhouettes", async ({ page }, testInfo) => {
    test.setTimeout(90_000);

    await openAvatarProofMode(page, proofCaseFor("standing"));
    const standing = await captureProofScreenshot(page, testInfo, "standing");

    await openAvatarProofMode(page, proofCaseFor("squat"));
    const squat = await captureProofScreenshot(page, testInfo, "squat");

    await openAvatarProofMode(page, proofCaseFor("far-squat"));
    const farSquat = await captureProofScreenshot(page, testInfo, "far-squat");

    await openAvatarProofMode(page, proofCaseFor("left-leg-raise"));
    const leftLegRaise = await captureProofScreenshot(page, testInfo, "left-leg-raise");

    await openAvatarProofMode(page, proofCaseFor("far-left-leg-raise"));
    const farLeftLegRaise = await captureProofScreenshot(page, testInfo, "far-left-leg-raise");

    await openAvatarProofMode(page, proofCaseFor("right-leg-raise"));
    const rightLegRaise = await captureProofScreenshot(page, testInfo, "right-leg-raise");

    await openAvatarProofMode(page, proofCaseFor("far-right-leg-raise"));
    const farRightLegRaise = await captureProofScreenshot(page, testInfo, "far-right-leg-raise");

    expect(
      countPlayerRegionPixelDifference(standing.png, squat.png),
      "Squat should be visually distinct from standing in the player-avatar region",
    ).toBeGreaterThan(1800);
    expect(
      squat.metrics.centerY,
      "Squat avatar silhouette should sit lower than standing",
    ).toBeGreaterThan(standing.metrics.centerY + 20);
    expect(
      squat.metrics.height,
      "Squat avatar silhouette should be visibly compressed versus standing",
    ).toBeLessThan(standing.metrics.height - 20);
    expect(
      countPlayerRegionPixelDifference(standing.png, farSquat.png),
      "Far-camera squat should remain visually distinct from standing in the player-avatar region",
    ).toBeGreaterThan(1800);
    expect(
      farSquat.metrics.centerY,
      "Far-camera squat avatar silhouette should sit lower than standing",
    ).toBeGreaterThan(standing.metrics.centerY + 20);
    expect(
      farSquat.metrics.height,
      "Far-camera squat avatar silhouette should stay compressed versus standing",
    ).toBeLessThan(standing.metrics.height - 20);

    expect(
      countPlayerRegionPixelDifference(standing.png, leftLegRaise.png),
      "Left leg raise should be visually distinct from standing in the player-avatar region",
    ).toBeGreaterThan(1200);
    expect(
      countPlayerRegionPixelDifference(standing.png, farLeftLegRaise.png),
      "Far-camera left leg raise should remain visually distinct from standing in the player-avatar region",
    ).toBeGreaterThan(1200);
    expect(
      countPlayerRegionPixelDifference(standing.png, rightLegRaise.png),
      "Right leg raise should be visually distinct from standing in the player-avatar region",
    ).toBeGreaterThan(1200);
    expect(
      countPlayerRegionPixelDifference(standing.png, farRightLegRaise.png),
      "Far-camera right leg raise should remain visually distinct from standing in the player-avatar region",
    ).toBeGreaterThan(1200);
  });

  test("squat and leg raises stay mutually exclusive", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("squat"));
    await expect(page.getByTestId("proof-debug-owners")).toHaveText(/lower player-stable-squat/i);
    await expect(page.getByTestId("proof-debug-owners")).not.toContainText("leg-raise");
    await captureProofScreenshot(page, testInfo, "squat");

    await openAvatarProofMode(page, proofCaseFor("left-leg-raise"));
    await expect(page.getByTestId("proof-debug-owners")).toHaveText(/lower player-right-leg-raise/i);
    await expect(page.getByTestId("proof-debug-owners")).not.toContainText("stable-squat");
    await captureProofScreenshot(page, testInfo, "left-leg-raise");

    await openAvatarProofMode(page, proofCaseFor("far-left-leg-raise"));
    await expect(page.getByTestId("proof-debug-owners")).toHaveText(/lower player-right-leg-raise/i);
    await expect(page.getByTestId("proof-debug-owners")).not.toContainText("stable-squat");
    await captureProofScreenshot(page, testInfo, "far-left-leg-raise");

    await openAvatarProofMode(page, proofCaseFor("right-leg-raise"));
    await expect(page.getByTestId("proof-debug-owners")).toHaveText(/lower player-left-leg-raise/i);
    await expect(page.getByTestId("proof-debug-owners")).not.toContainText("stable-squat");
    await captureProofScreenshot(page, testInfo, "right-leg-raise");

    await openAvatarProofMode(page, proofCaseFor("far-right-leg-raise"));
    await expect(page.getByTestId("proof-debug-owners")).toHaveText(/lower player-left-leg-raise/i);
    await expect(page.getByTestId("proof-debug-owners")).not.toContainText("stable-squat");
    await captureProofScreenshot(page, testInfo, "far-right-leg-raise");
  });

  test("live player head pitch applies in the same direction as source head movement", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("head-up"));

    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-head").textContent();
      const match = text?.match(/tracking pitch (-?\d+\.\d+) · bone pitch (-?\d+\.\d+)/i);
      return match ? { bone: Number(match[2]), tracking: Number(match[1]) } : null;
    }, {
      message: "Expected head-up proof to convert positive tracking pitch into the corrected player bone pitch",
      timeout: 30000,
    }).toMatchObject({
      bone: expect.any(Number),
      tracking: expect.any(Number),
    });
    const headUpText = await page.getByTestId("proof-debug-head").textContent();
    const headUpMatch = headUpText?.match(/tracking pitch (-?\d+\.\d+) · bone pitch (-?\d+\.\d+)/i);
    expect(Number(headUpMatch?.[1] ?? 0)).toBeGreaterThan(0.15);
    expect(Number(headUpMatch?.[2] ?? 0)).toBeLessThan(-0.15);
    await captureProofScreenshot(page, testInfo, "head-up");

    await openAvatarProofMode(page, proofCaseFor("head-down"));

    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-head").textContent();
      const match = text?.match(/tracking pitch (-?\d+\.\d+) · bone pitch (-?\d+\.\d+)/i);
      return match ? { bone: Number(match[2]), tracking: Number(match[1]) } : null;
    }, {
      message: "Expected head-down proof to convert negative tracking pitch into the corrected player bone pitch",
      timeout: 30000,
    }).toMatchObject({
      bone: expect.any(Number),
      tracking: expect.any(Number),
    });
    const headDownText = await page.getByTestId("proof-debug-head").textContent();
    const headDownMatch = headDownText?.match(/tracking pitch (-?\d+\.\d+) · bone pitch (-?\d+\.\d+)/i);
    expect(Number(headDownMatch?.[1] ?? 0)).toBeLessThan(-0.15);
    expect(Number(headDownMatch?.[2] ?? 0)).toBeGreaterThan(0.15);
    await captureProofScreenshot(page, testInfo, "head-down");
  });

  test("live player head yaw mirrors source left and right movement", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("head-left"));

    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-head").textContent();
      const match = text?.match(/tracking yaw (-?\d+\.\d+) · bone yaw (-?\d+\.\d+)/i);
      return match ? { bone: Number(match[2]), tracking: Number(match[1]) } : null;
    }, {
      message: "Expected head-left proof to mirror source yaw on the player avatar",
      timeout: 30000,
    }).toMatchObject({
      bone: expect.any(Number),
      tracking: expect.any(Number),
    });
    const headLeftText = await page.getByTestId("proof-debug-head").textContent();
    const headLeftMatch = headLeftText?.match(/tracking yaw (-?\d+\.\d+) · bone yaw (-?\d+\.\d+)/i);
    expect(Number(headLeftMatch?.[1] ?? 0)).toBeLessThan(-0.35);
    expect(Number(headLeftMatch?.[2] ?? 0)).toBeGreaterThan(0.25);
    await captureProofScreenshot(page, testInfo, "head-left");

    await openAvatarProofMode(page, proofCaseFor("head-right"));

    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-head").textContent();
      const match = text?.match(/tracking yaw (-?\d+\.\d+) · bone yaw (-?\d+\.\d+)/i);
      return match ? { bone: Number(match[2]), tracking: Number(match[1]) } : null;
    }, {
      message: "Expected head-right proof to mirror source yaw on the player avatar",
      timeout: 30000,
    }).toMatchObject({
      bone: expect.any(Number),
      tracking: expect.any(Number),
    });
    const headRightText = await page.getByTestId("proof-debug-head").textContent();
    const headRightMatch = headRightText?.match(/tracking yaw (-?\d+\.\d+) · bone yaw (-?\d+\.\d+)/i);
    expect(Number(headRightMatch?.[1] ?? 0)).toBeGreaterThan(0.35);
    expect(Number(headRightMatch?.[2] ?? 0)).toBeLessThan(-0.25);
    await captureProofScreenshot(page, testInfo, "head-right");
  });

  test("synthetic root turn applies live avatar root yaw", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("root-turn-left"));

    await expect(page.getByTestId("proof-debug-root")).toContainText("world-landmarks", {
      timeout: 30000,
    });
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/applied (-?\d+\.\d+)/i);
      return match ? Math.abs(Number(match[1])) : 0;
    }, {
      message: "Expected root-turn proof to apply a visible avatar root yaw",
      timeout: 30000,
    }).toBeGreaterThan(2.6);

    await captureProofScreenshot(page, testInfo, "root-turn-left");
  });

  test("synthetic right root turn applies mirrored positive live avatar root yaw", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("root-turn-right"));

    await expect(page.getByTestId("proof-debug-root")).toContainText("world-landmarks", {
      timeout: 30000,
    });
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/yaw target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected mirrored root-turn-right proof to apply positive avatar root yaw",
      timeout: 30000,
    }).toBeGreaterThan(1.2);

    await captureProofScreenshot(page, testInfo, "root-turn-right");
  });

  test("synthetic root travel applies live avatar root path", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("root-travel-right"));

    await expect(page.getByTestId("proof-debug-root")).toContainText("world-landmarks", {
      timeout: 30000,
    });
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/x target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected mirrored root-travel proof to apply visible negative avatar root X movement",
      timeout: 30000,
    }).toBeLessThan(3.95);
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/z target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected root-travel proof to apply visible avatar root Z movement",
      timeout: 30000,
    }).toBeGreaterThan(0.12);

    await captureProofScreenshot(page, testInfo, "root-travel-right");
  });

  test("synthetic root travel applies left, forward, and back paths", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("root-travel-left"));

    await expect(page.getByTestId("proof-debug-root")).toContainText("world-landmarks", {
      timeout: 30000,
    });
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/x target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 4.2;
    }, {
      message: "Expected mirrored left root-travel proof to apply positive avatar root X movement",
      timeout: 30000,
    }).toBeGreaterThan(4.45);
    await captureProofScreenshot(page, testInfo, "root-travel-left");

    await openAvatarProofMode(page, proofCaseFor("root-travel-forward"));

    await expect(page.getByTestId("proof-debug-root")).toContainText("world-landmarks", {
      timeout: 30000,
    });
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/z target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected forward root-travel proof to apply positive avatar root Z movement",
      timeout: 30000,
    }).toBeGreaterThan(0.3);
    await captureProofScreenshot(page, testInfo, "root-travel-forward");

    await openAvatarProofMode(page, proofCaseFor("root-travel-back"));

    await expect(page.getByTestId("proof-debug-root")).toContainText("world-landmarks", {
      timeout: 30000,
    });
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/z target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected back root-travel proof to apply negative avatar root Z movement",
      timeout: 30000,
    }).toBeLessThan(-0.18);
    await captureProofScreenshot(page, testInfo, "root-travel-back");
  });

  test("synthetic root turn and travel applies live avatar yaw and path", async ({ page }, testInfo) => {
    await openAvatarProofMode(page, proofCaseFor("root-turn-travel"));

    await expect(page.getByTestId("proof-debug-root")).toContainText("world-landmarks", {
      timeout: 30000,
    });
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/yaw target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected mirrored mixed root proof to apply negative avatar root yaw",
      timeout: 30000,
    }).toBeLessThan(-1.2);
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/x target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected mirrored mixed root proof to apply visible negative avatar root X movement",
      timeout: 30000,
    }).toBeLessThan(3.95);
    await expect.poll(async () => {
      const text = await page.getByTestId("proof-debug-root").textContent();
      const match = text?.match(/z target -?\d+\.\d+ · applied (-?\d+\.\d+)/i);
      return match ? Number(match[1]) : 0;
    }, {
      message: "Expected mixed root proof to apply visible avatar root Z movement",
      timeout: 30000,
    }).toBeGreaterThan(0.12);

    await captureProofScreenshot(page, testInfo, "root-turn-travel");
  });
});
