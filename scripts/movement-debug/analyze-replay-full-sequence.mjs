#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const MIRRORED_SEGMENTS = [
  { avatar: "rightUpperArm", sameAvatar: "leftUpperArm", source: [11, 13], type: "arm" },
  { avatar: "rightLowerArm", sameAvatar: "leftLowerArm", source: [13, 15], type: "arm" },
  { avatar: "leftUpperArm", sameAvatar: "rightUpperArm", source: [12, 14], type: "arm" },
  { avatar: "leftLowerArm", sameAvatar: "rightLowerArm", source: [14, 16], type: "arm" },
  { avatar: "rightThigh", sameAvatar: "leftThigh", source: [23, 25], type: "leg" },
  { avatar: "rightShin", sameAvatar: "leftShin", source: [25, 27], type: "leg" },
  { avatar: "leftThigh", sameAvatar: "rightThigh", source: [24, 26], type: "leg" },
  { avatar: "leftShin", sameAvatar: "rightShin", source: [26, 28], type: "leg" },
];
const MIRROR_LIMB_PAIRS = [
  {
    avatarLeft: "leftUpperArm",
    avatarRight: "rightUpperArm",
    sourceLeft: [11, 13],
    sourceRight: [12, 14],
    type: "upper-arm",
  },
  {
    avatarLeft: "leftLowerArm",
    avatarRight: "rightLowerArm",
    sourceLeft: [13, 15],
    sourceRight: [14, 16],
    type: "lower-arm",
  },
  {
    avatarLeft: "leftThigh",
    avatarRight: "rightThigh",
    sourceLeft: [23, 25],
    sourceRight: [24, 26],
    type: "thigh",
  },
  {
    avatarLeft: "leftShin",
    avatarRight: "rightShin",
    sourceLeft: [25, 27],
    sourceRight: [26, 28],
    type: "shin",
  },
];
const SEGMENT_PARENT = {
  leftLowerArm: "leftUpperArm",
  leftShin: "leftThigh",
  rightLowerArm: "rightUpperArm",
  rightShin: "rightThigh",
};
const STABLE_SOURCE_FOOT_CLEARANCE_STEP = 0.005;
const ARM_MIRROR_RECOVERY_CONFIDENCE = 0.75;
const MIRROR_OWNERSHIP_DECISIVE_MARGIN = 0.006;
const MIRROR_OWNERSHIP_WINDOW_TRANSITIONS = 3;

function parseArgs(argv) {
  const args = { out: "", session: "", strict: false, telemetry: "" };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--telemetry") args.telemetry = argv[++index] || "";
    else if (arg === "--session") args.session = argv[++index] || "";
    else if (arg === "--out") args.out = argv[++index] || "";
    else if (arg === "--strict") args.strict = true;
    else if (arg === "--help" || arg === "-h") args.help = true;
    else throw new Error(`Unknown option: ${arg}`);
  }
  return args;
}

function printHelp() {
  console.log(`Analyze every rendered Replay Lab frame for mirror ownership, body response, and temporal jerk.

Usage:
  npm run movement:replay:full-sequence:analyze -- --telemetry <file> --session <file> [--out <file>] [--strict]
`);
}

function vector(start, end) {
  if (!start || !end) return null;
  const x = end.x - start.x;
  const y = end.y - start.y;
  const z = (end.z ?? 0) - (start.z ?? 0);
  const length = Math.hypot(x, y, z);
  return length > 0.000001 ? { x: x / length, y: y / length, z: z / length } : null;
}

function angle(left, right) {
  if (!left || !right) return 0;
  const dot = Math.max(-1, Math.min(1, left.x * right.x + left.y * right.y + left.z * right.z));
  return Math.acos(dot);
}

function accumulatedSourceSegmentStep(session, frames, endIndex, source) {
  const startIndex = Math.max(0, endIndex - MIRROR_OWNERSHIP_WINDOW_TRANSITIONS);
  let total = 0;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const previousPose = replayPose(session, frames[index - 1].frameIndex);
    const pose = replayPose(session, frames[index].frameIndex);
    total += angle(
      vector(previousPose[source[0]], previousPose[source[1]]),
      vector(pose[source[0]], pose[source[1]]),
    );
  }
  return total;
}

function accumulatedAvatarSegmentStep(frames, endIndex, segment) {
  const startIndex = Math.max(0, endIndex - MIRROR_OWNERSHIP_WINDOW_TRANSITIONS);
  let total = 0;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    total += angle(
      frames[index - 1].debug?.avatarVisual?.segments?.[segment]?.direction,
      frames[index].debug?.avatarVisual?.segments?.[segment]?.direction,
    );
  }
  return total;
}

function wrappedAngleStep(previous, current) {
  if (!Number.isFinite(previous) || !Number.isFinite(current)) return 0;
  const difference = current - previous;
  return Math.abs(Math.atan2(Math.sin(difference), Math.cos(difference)));
}

function spineDriveStep(previousDebug, currentDebug) {
  return Math.max(...["forwardLean", "sideBend", "twist"].map((key) => (
    Math.abs((currentDebug.spineDrive?.[key] ?? 0) - (previousDebug.spineDrive?.[key] ?? 0))
  )));
}

function correlation(left, right) {
  if (left.length < 3 || left.length !== right.length) return 0;
  const leftAverage = left.reduce((sum, value) => sum + value, 0) / left.length;
  const rightAverage = right.reduce((sum, value) => sum + value, 0) / right.length;
  let numerator = 0;
  let leftVariance = 0;
  let rightVariance = 0;
  for (let index = 0; index < left.length; index += 1) {
    const leftDelta = left[index] - leftAverage;
    const rightDelta = right[index] - rightAverage;
    numerator += leftDelta * rightDelta;
    leftVariance += leftDelta * leftDelta;
    rightVariance += rightDelta * rightDelta;
  }
  const denominator = Math.sqrt(leftVariance * rightVariance);
  return denominator > 0.000001 ? numerator / denominator : 0;
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function renderedSideBendMagnitude(debug, visualSegments) {
  const axialRotations = [
    debug.avatarSpine?.chest?.z,
    debug.avatarSpine?.upperChest?.z,
  ].filter((value) => Number.isFinite(value));
  if (axialRotations.length > 0) {
    return Math.max(...axialRotations.map((value) => Math.abs(value)));
  }

  const legacySpineDirectionX = visualSegments.spine?.direction?.x;
  return Number.isFinite(legacySpineDirectionX)
    ? Math.abs(legacySpineDirectionX)
    : null;
}

function replayPose(session, frameIndex) {
  return session.samples?.[frameIndex]?.tracking?.pose ?? [];
}

function armSideFromSegment(segmentName) {
  return segmentName.startsWith("left") ? "left" : "right";
}

function isMirrorOwnershipFrameEligible({ currentDebug, expectedAvatar, pair, previousDebug, wrongAvatar }) {
  const debugFrames = [currentDebug, previousDebug];
  if (pair.type === "thigh" || pair.type === "shin") {
    return debugFrames.every((debug) => (
      (debug.retarget?.appliedLowerBody ?? 0) >= 4 &&
      [expectedAvatar, wrongAvatar].every((segmentName) => (
        (debug.avatarVisual?.segments?.[segmentName]?.confidence ?? 0) >= 0.45
      ))
    ));
  }
  if (pair.type !== "upper-arm" && pair.type !== "lower-arm") return true;

  return debugFrames.every((debug) => (
    [expectedAvatar, wrongAvatar].every((segmentName) => {
      const side = armSideFromSegment(segmentName);
      return (
        (debug.avatarVisual?.segments?.[segmentName]?.confidence ?? 0) >=
          ARM_MIRROR_RECOVERY_CONFIDENCE &&
        debug.fallbacks?.[`${side}Arm`] === "retargeted-arm"
      );
    })
  ));
}

function mirroredSourceFootClearance(pose, avatarSide) {
  const sourceAnkle = pose[avatarSide === "left" ? 28 : 27];
  const oppositeAnkle = pose[avatarSide === "left" ? 27 : 28];
  const leftShoulder = pose[11];
  const rightShoulder = pose[12];
  const leftHip = pose[23];
  const rightHip = pose[24];
  if (
    !sourceAnkle || !oppositeAnkle || !leftShoulder || !rightShoulder ||
    !leftHip || !rightHip
  ) return null;

  const shoulderCenter = {
    x: (leftShoulder.x + rightShoulder.x) / 2,
    y: (leftShoulder.y + rightShoulder.y) / 2,
    z: ((leftShoulder.z ?? 0) + (rightShoulder.z ?? 0)) / 2,
  };
  const hipCenter = {
    x: (leftHip.x + rightHip.x) / 2,
    y: (leftHip.y + rightHip.y) / 2,
    z: ((leftHip.z ?? 0) + (rightHip.z ?? 0)) / 2,
  };
  const torsoLength = Math.hypot(
    hipCenter.x - shoulderCenter.x,
    hipCenter.y - shoulderCenter.y,
    hipCenter.z - shoulderCenter.z,
  );
  if (torsoLength < 0.000001) return null;

  return (oppositeAnkle.y - sourceAnkle.y) / torsoLength;
}

export function analyzeFullSequence({ session, telemetry }) {
  const isDeterministicFrameStep = telemetry.playbackMode === "deterministic-rendered-frame-step";
  const frames = telemetry.frames ?? [];
  const missingFrames = telemetry.missingFrames ?? [];
  const segmentSeries = Object.fromEntries(MIRRORED_SEGMENTS.map((segment) => [
    `${segment.type}:${segment.avatar}`,
    { avatar: [], same: [], source: [], staticFrames: [] },
  ]));
  const headRaw = [];
  const headRendered = [];
  const sideBendRaw = [];
  const sideBendRendered = [];
  const suppressedLegFrames = [];
  const jerkFrames = [];
  const ownerTransitions = [];
  const mirrorOwnership = Object.fromEntries(MIRROR_LIMB_PAIRS.map((pair) => [
    pair.type,
    { ambiguousFrames: [], excludedFrames: [], failedFrames: [], passedFrames: [], samples: 0 },
  ]));
  let previousFrame = null;

  frames.forEach((frame, frameArrayIndex) => {
    const debug = frame.debug;
    if (!debug) return;
    const pose = replayPose(session, frame.frameIndex);
    const sourceQuality = debug.retarget?.sourceQuality ?? 0;
    const visualSegments = debug.avatarVisual?.segments ?? {};

    if (Math.abs(debug.headRaw?.pitch ?? 0) >= 0.06 && debug.avatarHead) {
      headRaw.push(debug.headRaw.pitch);
      headRendered.push(debug.avatarHead.bonePitch ?? 0);
    }
    const renderedSideBend = renderedSideBendMagnitude(debug, visualSegments);
    if (Math.abs(debug.spineDrive?.sideBend ?? 0) >= 0.08 && renderedSideBend !== null) {
      sideBendRaw.push(Math.abs(debug.spineDrive.sideBend));
      sideBendRendered.push(renderedSideBend);
    }
    if (
      frame.frameIndex >= 5 &&
      sourceQuality >= 0.45 &&
      (debug.retarget?.appliedLowerBody ?? 0) < 4 &&
      (debug.avatarVisual?.averageLowerBodyDirectionError ?? 0) > 0.08
    ) {
      suppressedLegFrames.push(frame.frameIndex);
    }

    if (previousFrame?.debug && sourceQuality >= 0.45) {
      const previousPose = replayPose(session, previousFrame.frameIndex);
      const targetRootYawStep = wrappedAngleStep(
        previousFrame.debug.avatarRoot?.targetYaw,
        debug.avatarRoot?.targetYaw,
      );
      const intendedSpineStep = spineDriveStep(previousFrame.debug, debug);
      MIRRORED_SEGMENTS.forEach((segment) => {
        const currentSource = vector(pose[segment.source[0]], pose[segment.source[1]]);
        const previousSource = vector(previousPose[segment.source[0]], previousPose[segment.source[1]]);
        const currentAvatar = visualSegments[segment.avatar]?.direction;
        const previousAvatar = previousFrame.debug.avatarVisual?.segments?.[segment.avatar]?.direction;
        const currentTarget = visualSegments[segment.avatar]?.sourceDirection;
        const previousTarget = previousFrame.debug.avatarVisual?.segments?.[segment.avatar]?.sourceDirection;
        const parentSegment = SEGMENT_PARENT[segment.avatar];
        const currentParentTarget = parentSegment
          ? visualSegments[parentSegment]?.sourceDirection
          : null;
        const previousParentTarget = parentSegment
          ? previousFrame.debug.avatarVisual?.segments?.[parentSegment]?.sourceDirection
          : null;
        const currentSame = visualSegments[segment.sameAvatar]?.direction;
        const previousSame = previousFrame.debug.avatarVisual?.segments?.[segment.sameAvatar]?.direction;
        if (
          !currentSource || !previousSource || !currentAvatar || !previousAvatar ||
          !currentTarget || !previousTarget || !currentSame || !previousSame
        ) return;
        const sourceStep = angle(previousSource, currentSource);
        const targetStep = angle(previousTarget, currentTarget);
        const parentTargetStep = angle(previousParentTarget, currentParentTarget);
        const intendedWorldStep = Math.max(
          targetStep,
          parentTargetStep,
          targetRootYawStep,
          segment.type === "arm" ? intendedSpineStep : 0,
        );
        const avatarStep = angle(previousAvatar, currentAvatar);
        const sameStep = angle(previousSame, currentSame);
        const series = segmentSeries[`${segment.type}:${segment.avatar}`];
        series.source.push(sourceStep);
        series.avatar.push(avatarStep);
        series.same.push(sameStep);
        if (targetStep >= 0.025 && avatarStep < 0.004) series.staticFrames.push(frame.frameIndex);
        if (frame.frameIndex >= 5 && avatarStep >= 0.18 && intendedWorldStep < 0.06) {
          jerkFrames.push({ frameIndex: frame.frameIndex, segment: segment.avatar, sourceStep: intendedWorldStep, avatarStep });
        }
      });
      MIRROR_LIMB_PAIRS.forEach((pair) => {
        const sourceLeftStep = accumulatedSourceSegmentStep(
          session,
          frames,
          frameArrayIndex,
          pair.sourceLeft,
        );
        const sourceRightStep = accumulatedSourceSegmentStep(
          session,
          frames,
          frameArrayIndex,
          pair.sourceRight,
        );
        if (Math.max(sourceLeftStep, sourceRightStep) < 0.025) return;
        if (Math.abs(sourceLeftStep - sourceRightStep) < 0.015) return;
        const sourceSide = sourceLeftStep > sourceRightStep ? "left" : "right";
        const expectedAvatar = sourceSide === "left" ? pair.avatarRight : pair.avatarLeft;
        const wrongAvatar = sourceSide === "left" ? pair.avatarLeft : pair.avatarRight;
        const result = mirrorOwnership[pair.type];
        if (!isMirrorOwnershipFrameEligible({
          currentDebug: debug,
          expectedAvatar,
          pair,
          previousDebug: previousFrame.debug,
          wrongAvatar,
        })) {
          result.excludedFrames.push({ frameIndex: frame.frameIndex, sourceSide });
          return;
        }
        const expectedStep = accumulatedAvatarSegmentStep(
          frames,
          frameArrayIndex,
          expectedAvatar,
        );
        const wrongStep = accumulatedAvatarSegmentStep(
          frames,
          frameArrayIndex,
          wrongAvatar,
        );
        const detail = {
          expectedAvatar,
          expectedStep,
          frameIndex: frame.frameIndex,
          sourceSide,
          sourceStep: Math.max(sourceLeftStep, sourceRightStep),
          wrongStep,
        };
        if (Math.abs(expectedStep - wrongStep) < MIRROR_OWNERSHIP_DECISIVE_MARGIN) {
          result.ambiguousFrames.push(detail);
          return;
        }
        result.samples += 1;
        if (expectedStep > wrongStep) result.passedFrames.push(detail);
        else result.failedFrames.push(detail);
      });

      const previousOwner = previousFrame.debug.fallbacks?.owners ?? "";
      const owner = debug.fallbacks?.owners ?? "";
      if (owner !== previousOwner) ownerTransitions.push({ frameIndex: frame.frameIndex, from: previousOwner, to: owner });
      const previousFooting = previousFrame.debug.avatarVisual?.footing;
      const footing = debug.avatarVisual?.footing;
      if (previousFooting && footing) {
        for (const side of ["left", "right"]) {
          const key = `${side}FootClearance`;
          const clearanceStep = Math.abs((footing[key] ?? 0) - (previousFooting[key] ?? 0));
          const previousSourceClearance = mirroredSourceFootClearance(previousPose, side);
          const sourceClearance = mirroredSourceFootClearance(pose, side);
          const sourceStep = previousSourceClearance === null || sourceClearance === null
            ? 0
            : Math.abs(sourceClearance - previousSourceClearance);
          if (clearanceStep >= 0.12 && sourceStep < STABLE_SOURCE_FOOT_CLEARANCE_STEP) {
            jerkFrames.push({
              frameIndex: frame.frameIndex,
              segment: `${side}FootClearance`,
              sourceStep,
              avatarStep: clearanceStep,
            });
          }
        }
      }
    }
    previousFrame = frame;
  });

  const segmentMetrics = Object.fromEntries(Object.entries(segmentSeries).map(([key, series]) => {
    const sourceTotal = series.source.reduce((sum, value) => sum + value, 0);
    const avatarTotal = series.avatar.reduce((sum, value) => sum + value, 0);
    const sameTotal = series.same.reduce((sum, value) => sum + value, 0);
    return [key, {
      mirrorCorrelation: round(correlation(series.source, series.avatar)),
      mirrorResponseRatio: round(avatarTotal / Math.max(sourceTotal, 0.0001)),
      sameSideCorrelation: round(correlation(series.source, series.same)),
      sameSideResponseRatio: round(sameTotal / Math.max(sourceTotal, 0.0001)),
      staticFrameCount: series.staticFrames.length,
      worstStaticFrames: series.staticFrames.slice(0, 20),
    }];
  }));

  const headResponseRatio = headRendered.reduce((sum, value) => sum + Math.abs(value), 0) /
    Math.max(headRaw.reduce((sum, value) => sum + Math.abs(value), 0), 0.0001);
  const sideBendResponseRatio = sideBendRendered.reduce((sum, value) => sum + value, 0) /
    Math.max(sideBendRaw.reduce((sum, value) => sum + value, 0), 0.0001);
  const eligibleFrameCount = frames.filter((frame) => (frame.debug?.retarget?.sourceQuality ?? 0) >= 0.45).length;
  const failures = [];
  if (missingFrames.length > 0) failures.push({ code: "rendered-frames-missing", count: missingFrames.length });
  if (suppressedLegFrames.length / Math.max(eligibleFrameCount, 1) > 0.02) {
    failures.push({ code: "rendered-leg-motion-suppressed", count: suppressedLegFrames.length });
  }
  if (headRaw.length >= 5 && (correlation(headRaw, headRendered) < 0.7 || headResponseRatio < 0.55)) {
    failures.push({ code: "rendered-head-pitch-under-response", count: headRaw.length });
  }
  if (sideBendRaw.length >= 5 && (correlation(sideBendRaw, sideBendRendered) < 0.55 || sideBendResponseRatio < 0.35)) {
    failures.push({ code: "rendered-side-bend-under-response", count: sideBendRaw.length });
  }
  if (!isDeterministicFrameStep && jerkFrames.length / Math.max(eligibleFrameCount, 1) > 0.01) {
    failures.push({ code: "rendered-motion-jerk", count: jerkFrames.length });
  }
  const mirrorOwnershipSummary = Object.fromEntries(Object.entries(mirrorOwnership).map(([key, value]) => [
    key,
    {
      ambiguousFrameCount: value.ambiguousFrames.length,
      excludedFrameCount: value.excludedFrames.length,
      failedFrameCount: value.failedFrames.length,
      passRate: round(value.passedFrames.length / Math.max(value.samples, 1)),
      passedFrameCount: value.passedFrames.length,
      sampleCount: value.samples,
      worstFrames: value.failedFrames.slice(0, 20).map((frame) => ({
        ...frame,
        expectedStep: round(frame.expectedStep),
        sourceStep: round(frame.sourceStep),
        wrongStep: round(frame.wrongStep),
      })),
    },
  ]));
  Object.entries(mirrorOwnershipSummary).forEach(([segment, summary]) => {
    if (summary.sampleCount >= 10 && summary.passRate < 0.6) {
      failures.push({ code: "rendered-mirror-side-mismatch", count: summary.failedFrameCount, segment });
    }
  });

  return {
    eligibleFrameCount,
    failures,
    frameCount: telemetry.frameCount,
    head: {
      correlation: round(correlation(headRaw, headRendered)),
      responseRatio: round(headResponseRatio),
      sampleCount: headRaw.length,
    },
    jerk: {
      blocking: !isDeterministicFrameStep,
      frameCount: jerkFrames.length,
      worstFrames: jerkFrames.slice(0, 30).map((entry) => ({
        ...entry,
        avatarStep: round(entry.avatarStep),
        sourceStep: round(entry.sourceStep),
      })),
    },
    playbackMode: telemetry.playbackMode ?? "timed-playback",
    mirrorSegments: segmentMetrics,
    mirrorSideOwnership: mirrorOwnershipSummary,
    missingFrameCount: missingFrames.length,
    ownerTransitions: {
      count: ownerTransitions.length,
      worstFrames: ownerTransitions.slice(0, 30),
    },
    sessionId: telemetry.sessionId,
    sideBend: {
      correlation: round(correlation(sideBendRaw, sideBendRendered)),
      responseRatio: round(sideBendResponseRatio),
      sampleCount: sideBendRaw.length,
    },
    status: failures.length === 0 ? "passed" : "blocked",
    suppressedLegMotion: {
      frameCount: suppressedLegFrames.length,
      ratio: round(suppressedLegFrames.length / Math.max(eligibleFrameCount, 1)),
      worstFrames: suppressedLegFrames.slice(0, 30),
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) return printHelp();
  if (!args.telemetry) throw new Error("Pass --telemetry <file>.");
  if (!args.session) throw new Error("Pass --session <file>.");
  const telemetry = JSON.parse(await readFile(path.resolve(args.telemetry), "utf8"));
  const session = JSON.parse(await readFile(path.resolve(args.session), "utf8"));
  const report = analyzeFullSequence({ session, telemetry });
  if (args.out) await writeFile(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (args.strict && report.status !== "passed") process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
