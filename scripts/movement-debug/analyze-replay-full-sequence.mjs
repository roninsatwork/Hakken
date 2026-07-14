#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  inspectReplayTelemetryFrames,
  sourceHashForReplaySession,
} from "./lib/replay-proof-identity.mjs";
import { movementPipelineFingerprint } from "./lib/movementPipelineFingerprint.mjs";

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
    minimumSourceStep: 0.025,
    sourceLeft: [11, 13],
    sourceRight: [12, 14],
    type: "upper-arm",
  },
  {
    avatarLeft: "leftLowerArm",
    avatarRight: "rightLowerArm",
    minimumSourceStep: 0.025,
    sourceLeft: [11, 13, 15],
    sourceRight: [12, 14, 16],
    type: "lower-arm",
  },
  {
    avatarLeft: "leftThigh",
    avatarRight: "rightThigh",
    // Lower limbs can drift by a few hundredths during head/arm-only
    // recordings. That is not a decisive side-ownership signal.
    minimumSourceStep: 0.06,
    sourceLeft: [23, 25],
    sourceRight: [24, 26],
    type: "thigh",
  },
  {
    avatarLeft: "leftShin",
    avatarRight: "rightShin",
    minimumSourceStep: 0.06,
    sourceLeft: [25, 27],
    sourceRight: [26, 28],
    type: "shin",
  },
];
const SEGMENT_PARENT = {
  leftUpperArm: "spine",
  leftLowerArm: "leftUpperArm",
  leftShin: "leftThigh",
  rightUpperArm: "spine",
  rightLowerArm: "rightUpperArm",
  rightShin: "rightThigh",
};
const STABLE_SOURCE_FOOT_CLEARANCE_STEP = 0.005;
const ARM_MIRROR_RECOVERY_CONFIDENCE = 0.75;
const MIRROR_OWNERSHIP_DECISIVE_MARGIN = 0.006;
const MIRROR_OWNERSHIP_WINDOW_TRANSITIONS = 3;
const OWNER_FLICKER_RENDERED_STEP = 0.12;
const OWNER_FLICKER_RETURN_STEP = 0.06;
const MINIMUM_SIDE_BEND_SOURCE_RANGE = 0.04;
const PERSISTENT_RENDERED_FAILURE_FRAMES = 3;
const HARD_MIRROR_WRONG_SIDE_STEP = 0.06;
const HARD_MIRROR_WRONG_SIDE_MARGIN = 0.02;
const MIRROR_OWNERSHIP_MINIMUM_DOMINANCE_RATIO = 2.5;
const UPPER_ARM_JOINT_SINGULARITY_MARGIN = 0.18;

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

function displayAnatomicalVector(start, end) {
  const raw = vector(start, end);
  if (!raw) return null;
  const planarLength = Math.hypot(raw.x, raw.y);
  if (planarLength <= 0.00001) return raw;

  // Match buildWorldSegmentsWithDisplayAlignedArms exactly: normalise the
  // landmark segment first, damp its unit-depth component, then reconstruct
  // the planar unit direction. Scaling raw z before normalisation can reverse
  // which elbow looks dominant during a turn.
  const alignedDepth = Math.max(-1, Math.min(1, raw.z * 0.18));
  const planarScale = Math.sqrt(Math.max(0, 1 - alignedDepth * alignedDepth));
  return {
    x: (raw.x / planarLength) * planarScale,
    y: (raw.y / planarLength) * planarScale,
    z: alignedDepth,
  };
}

function midpoint(left, right) {
  if (!left || !right) return null;
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
    z: ((left.z ?? 0) + (right.z ?? 0)) / 2,
  };
}

function sourceUpperArmJointAngle(session, frameIndex, source) {
  const pose = replayPose(session, frameIndex);
  return angle(
    displayAnatomicalVector(
      midpoint(pose[23], pose[24]),
      midpoint(pose[11], pose[12]),
    ),
    displayAnatomicalVector(pose[source[0]], pose[source[1]]),
  );
}

function angle(left, right) {
  if (!left || !right) return 0;
  const dot = Math.max(-1, Math.min(1, left.x * right.x + left.y * right.y + left.z * right.z));
  return Math.acos(dot);
}

function accumulatedSourceSegmentStep(session, frames, endIndex, source, segmentType) {
  const startIndex = Math.max(0, endIndex - MIRROR_OWNERSHIP_WINDOW_TRANSITIONS);
  let total = 0;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    const previousPose = segmentType.startsWith("raw-display-anatomical")
      ? replayPose(session, frames[index - 1].frameIndex)
      : replayRetargetPose(session, frames[index - 1].frameIndex);
    const pose = segmentType.startsWith("raw-display-anatomical")
      ? replayPose(session, frames[index].frameIndex)
      : replayRetargetPose(session, frames[index].frameIndex);
    if (segmentType === "raw-display-anatomical-upper-joint") {
      const previousTorso = displayAnatomicalVector(
        midpoint(previousPose[23], previousPose[24]),
        midpoint(previousPose[11], previousPose[12]),
      );
      const torso = displayAnatomicalVector(
        midpoint(pose[23], pose[24]),
        midpoint(pose[11], pose[12]),
      );
      const previousJointAngle = angle(
        previousTorso,
        displayAnatomicalVector(previousPose[source[0]], previousPose[source[1]]),
      );
      const jointAngle = angle(
        torso,
        displayAnatomicalVector(pose[source[0]], pose[source[1]]),
      );
      total += Math.abs(jointAngle - previousJointAngle);
    } else if (segmentType === "raw-display-anatomical-joint") {
      const previousJointAngle = angle(
        displayAnatomicalVector(previousPose[source[0]], previousPose[source[1]]),
        displayAnatomicalVector(previousPose[source[1]], previousPose[source[2]]),
      );
      const jointAngle = angle(
        displayAnatomicalVector(pose[source[0]], pose[source[1]]),
        displayAnatomicalVector(pose[source[1]], pose[source[2]]),
      );
      total += Math.abs(jointAngle - previousJointAngle);
    } else {
      total += angle(
        segmentType === "raw-display-anatomical"
          ? displayAnatomicalVector(previousPose[source[0]], previousPose[source[1]])
          : vector(previousPose[source[0]], previousPose[source[1]]),
        segmentType === "raw-display-anatomical"
          ? displayAnatomicalVector(pose[source[0]], pose[source[1]])
          : vector(pose[source[0]], pose[source[1]]),
      );
    }
  }
  return total;
}

function accumulatedAvatarSegmentStep(frames, endIndex, segment, relativeToParent = false) {
  const startIndex = Math.max(0, endIndex - MIRROR_OWNERSHIP_WINDOW_TRANSITIONS);
  let total = 0;
  for (let index = startIndex + 1; index <= endIndex; index += 1) {
    if (relativeToParent) {
      const parent = SEGMENT_PARENT[segment];
      const previousSegments = frames[index - 1].debug?.avatarVisual?.segments;
      const segments = frames[index].debug?.avatarVisual?.segments;
      const previousJointAngle = angle(
        previousSegments?.[parent]?.direction,
        previousSegments?.[segment]?.direction,
      );
      const jointAngle = angle(
        segments?.[parent]?.direction,
        segments?.[segment]?.direction,
      );
      total += Math.abs(jointAngle - previousJointAngle);
    } else {
      total += angle(
        frames[index - 1].debug?.avatarVisual?.segments?.[segment]?.direction,
        frames[index].debug?.avatarVisual?.segments?.[segment]?.direction,
      );
    }
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

function range(values) {
  if (values.length === 0) return 0;
  return Math.max(...values) - Math.min(...values);
}

function consecutiveFrameRuns(entries, frameIndex = (entry) => entry) {
  const sorted = [...entries].sort((left, right) => frameIndex(left) - frameIndex(right));
  const runs = [];
  sorted.forEach((entry) => {
    const currentRun = runs.at(-1);
    if (!currentRun || frameIndex(entry) !== frameIndex(currentRun.at(-1)) + 1) {
      runs.push([entry]);
      return;
    }
    currentRun.push(entry);
  });
  return runs;
}

function persistentFrameRuns(entries, frameIndex = (entry) => entry) {
  return consecutiveFrameRuns(entries, frameIndex)
    .filter((run) => run.length >= PERSISTENT_RENDERED_FAILURE_FRAMES);
}

function round(value) {
  return Number.isFinite(value) ? Number(value.toFixed(4)) : null;
}

function renderedSideBend(debug, visualSegments) {
  const axialRotations = [
    debug.avatarSpine?.chest?.z,
    debug.avatarSpine?.upperChest?.z,
  ].filter((value) => Number.isFinite(value));
  if (axialRotations.length > 0) {
    // Keep the sign of the dominant final VRM rotation. Side bend is an
    // anatomical direction: comparing absolute magnitudes made a correct
    // left/right sequence look uncorrelated whenever either direction had a
    // different rest-pose offset, and it would also allow an inverted avatar
    // to pass. The response-ratio check below still intentionally measures
    // magnitude with absolute values.
    return axialRotations.reduce((dominant, value) => (
      Math.abs(value) > Math.abs(dominant) ? value : dominant
    ));
  }

  const legacySpineDirectionX = visualSegments.spine?.direction?.x;
  return Number.isFinite(legacySpineDirectionX) ? legacySpineDirectionX : null;
}

function renderedHeadIntentPitch(debug) {
  const bonePitch = debug.avatarHead?.bonePitch;
  return Number.isFinite(bonePitch) ? -bonePitch : null;
}

function renderedPoseDifference(leftDebug, rightDebug) {
  let largest = 0;
  const leftSegments = leftDebug?.avatarVisual?.segments ?? {};
  const rightSegments = rightDebug?.avatarVisual?.segments ?? {};
  for (const segment of new Set([...Object.keys(leftSegments), ...Object.keys(rightSegments)])) {
    largest = Math.max(
      largest,
      angle(leftSegments[segment]?.direction, rightSegments[segment]?.direction),
    );
  }

  for (const bone of ["chest", "upperChest"]) {
    for (const axis of ["x", "y", "z"]) {
      const left = leftDebug?.avatarSpine?.[bone]?.[axis];
      const right = rightDebug?.avatarSpine?.[bone]?.[axis];
      if (Number.isFinite(left) && Number.isFinite(right)) {
        largest = Math.max(largest, Math.abs(left - right));
      }
    }
  }
  return largest;
}

function renderedOwnerFlickerEvidence(previousDebug, currentDebug, nextDebug) {
  const enteringStep = renderedPoseDifference(previousDebug, currentDebug);
  const leavingStep = renderedPoseDifference(currentDebug, nextDebug);
  const returnStep = renderedPoseDifference(previousDebug, nextDebug);
  return {
    enteringStep,
    isVisibleFlicker: enteringStep >= OWNER_FLICKER_RENDERED_STEP &&
      leavingStep >= OWNER_FLICKER_RENDERED_STEP &&
      returnStep <= OWNER_FLICKER_RETURN_STEP,
    leavingStep,
    returnStep,
  };
}

function replayPose(session, frameIndex) {
  return session.samples?.[frameIndex]?.tracking?.pose ?? [];
}

function replayRetargetPose(session, frameIndex) {
  const tracking = session.samples?.[frameIndex]?.tracking;
  return tracking?.worldPose?.length === 33
    ? tracking.worldPose
    : tracking?.pose ?? [];
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

export function analyzeFullSequence({
  session,
  telemetry,
  expectedMotionPipelineFingerprint = null,
  requireIdentity = false,
}) {
  const isDeterministicFrameStep = telemetry.playbackMode === "deterministic-rendered-frame-step";
  const frameInspection = inspectReplayTelemetryFrames({
    frameCount: telemetry.frameCount,
    frames: telemetry.frames,
  });
  const frames = frameInspection.uniqueExpectedFrames;
  const sourceHash = sourceHashForReplaySession(session);
  const declaredMissingFrames = Array.isArray(telemetry.missingFrames)
    ? [...new Set(telemetry.missingFrames.filter(Number.isInteger))].sort((left, right) => left - right)
    : null;
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
  const ownerFlickers = [];
  const ownerTransitions = [];
  const transientOwnerTransitions = [];
  const mirrorOwnership = Object.fromEntries(MIRROR_LIMB_PAIRS.map((pair) => [
    pair.type,
    {
      ambiguousFrames: [],
      excludedFrames: [],
      failedFrames: [],
      hardFailedFrames: [],
      passedFrames: [],
      samples: 0,
    },
  ]));
  let previousFrame = null;

  frames.forEach((frame, frameArrayIndex) => {
    const debug = frame.debug;
    if (!debug) return;
    const pose = replayPose(session, frame.frameIndex);
    const retargetPose = replayRetargetPose(session, frame.frameIndex);
    const sourceQuality = debug.retarget?.sourceQuality ?? 0;
    const visualSegments = debug.avatarVisual?.segments ?? {};

    const renderedHeadPitch = renderedHeadIntentPitch(debug);
    if (Math.abs(debug.headRaw?.pitch ?? 0) >= 0.06 && renderedHeadPitch !== null) {
      headRaw.push(debug.headRaw.pitch);
      headRendered.push(renderedHeadPitch);
    }
    const finalRenderedSideBend = renderedSideBend(debug, visualSegments);
    if (Math.abs(debug.spineDrive?.sideBend ?? 0) >= 0.08 && finalRenderedSideBend !== null) {
      sideBendRaw.push(debug.spineDrive.sideBend);
      sideBendRendered.push(finalRenderedSideBend);
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
      const previousRetargetPose = replayRetargetPose(session, previousFrame.frameIndex);
      const targetRootYawStep = wrappedAngleStep(
        previousFrame.debug.avatarRoot?.targetYaw,
        debug.avatarRoot?.targetYaw,
      );
      const intendedSpineStep = spineDriveStep(previousFrame.debug, debug);
      MIRRORED_SEGMENTS.forEach((segment) => {
        const currentSource = vector(retargetPose[segment.source[0]], retargetPose[segment.source[1]]);
        const previousSource = vector(
          previousRetargetPose[segment.source[0]],
          previousRetargetPose[segment.source[1]],
        );
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
        const minimumApplicationConfidence = segment.type === "leg" ? 0.25 : 0.3;
        const currentConfidence = visualSegments[segment.avatar]?.confidence ?? 0;
        const previousConfidence = previousFrame.debug.avatarVisual?.segments?.[segment.avatar]?.confidence ?? 0;
        if (
          currentConfidence < minimumApplicationConfidence ||
          previousConfidence < minimumApplicationConfidence
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
          pair.type === "lower-arm"
            ? "raw-display-anatomical-joint"
            : pair.type === "upper-arm"
              ? "raw-display-anatomical"
              : "retarget",
        );
        const sourceRightStep = accumulatedSourceSegmentStep(
          session,
          frames,
          frameArrayIndex,
          pair.sourceRight,
          pair.type === "lower-arm"
            ? "raw-display-anatomical-joint"
            : pair.type === "upper-arm"
              ? "raw-display-anatomical"
              : "retarget",
        );
        if (Math.max(sourceLeftStep, sourceRightStep) < pair.minimumSourceStep) return;
        if (Math.abs(sourceLeftStep - sourceRightStep) < 0.015) return;
        const dominantSourceStep = Math.max(sourceLeftStep, sourceRightStep);
        const secondarySourceStep = Math.min(sourceLeftStep, sourceRightStep);
        if (
          secondarySourceStep > 0.0001 &&
          dominantSourceStep / secondarySourceStep < MIRROR_OWNERSHIP_MINIMUM_DOMINANCE_RATIO
        ) return;
        const sourceSide = sourceLeftStep > sourceRightStep ? "left" : "right";
        const expectedAvatar = sourceSide === "left" ? pair.avatarRight : pair.avatarLeft;
        const wrongAvatar = sourceSide === "left" ? pair.avatarLeft : pair.avatarRight;
        const result = mirrorOwnership[pair.type];
        if (pair.type === "upper-arm") {
          const jointAngle = sourceUpperArmJointAngle(
            session,
            frame.frameIndex,
            sourceSide === "left" ? pair.sourceLeft : pair.sourceRight,
          );
          // A scalar torso/upper-arm angle loses side information when the arm
          // is almost exactly collinear with the spine. Treat that geometry as
          // non-decisive instead of turning tiny cross-axis changes into a
          // three-frame wrong-side verdict.
          if (
            jointAngle <= UPPER_ARM_JOINT_SINGULARITY_MARGIN ||
            Math.PI - jointAngle <= UPPER_ARM_JOINT_SINGULARITY_MARGIN
          ) {
            result.excludedFrames.push({ frameIndex: frame.frameIndex, sourceSide });
            return;
          }
        }
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
          pair.type === "lower-arm",
        );
        const wrongStep = accumulatedAvatarSegmentStep(
          frames,
          frameArrayIndex,
          wrongAvatar,
          pair.type === "lower-arm",
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
        if (expectedStep > wrongStep) {
          result.passedFrames.push(detail);
        } else {
          result.failedFrames.push(detail);
          if (
            wrongStep >= HARD_MIRROR_WRONG_SIDE_STEP &&
            wrongStep - expectedStep >= HARD_MIRROR_WRONG_SIDE_MARGIN &&
            expectedStep <= wrongStep * 0.6
          ) {
            result.hardFailedFrames.push(detail);
          }
        }
      });

      const previousOwner = previousFrame.debug.fallbacks?.owners ?? "";
      const owner = debug.fallbacks?.owners ?? "";
      if (owner !== previousOwner) ownerTransitions.push({ frameIndex: frame.frameIndex, from: previousOwner, to: owner });
      const nextOwner = frames[frameArrayIndex + 1]?.debug?.fallbacks?.owners ?? "";
      if (previousOwner && owner && nextOwner && owner !== previousOwner && nextOwner === previousOwner) {
        const evidence = renderedOwnerFlickerEvidence(previousFrame.debug, debug, frames[frameArrayIndex + 1]?.debug);
        const transition = {
          ...evidence,
          frameIndex: frame.frameIndex,
          from: previousOwner,
          to: owner,
        };
        transientOwnerTransitions.push(transition);
        if (evidence.isVisibleFlicker) ownerFlickers.push(transition);
      }
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
    const persistentStaticRuns = persistentFrameRuns(series.staticFrames);
    return [key, {
      mirrorCorrelation: round(correlation(series.source, series.avatar)),
      mirrorResponseRatio: round(avatarTotal / Math.max(sourceTotal, 0.0001)),
      sameSideCorrelation: round(correlation(series.source, series.same)),
      sameSideResponseRatio: round(sameTotal / Math.max(sourceTotal, 0.0001)),
      staticFrameCount: series.staticFrames.length,
      persistentStaticFrameCount: persistentStaticRuns.reduce((sum, run) => sum + run.length, 0),
      persistentStaticRuns: persistentStaticRuns.slice(0, 10).map((run) => ({
        frameEnd: run.at(-1),
        frameStart: run[0],
        length: run.length,
      })),
      worstStaticFrames: series.staticFrames.slice(0, 20),
    }];
  }));

  const headResponseRatio = headRendered.reduce((sum, value) => sum + Math.abs(value), 0) /
    Math.max(headRaw.reduce((sum, value) => sum + Math.abs(value), 0), 0.0001);
  const sideBendResponseRatio = sideBendRendered.reduce((sum, value) => sum + Math.abs(value), 0) /
    Math.max(sideBendRaw.reduce((sum, value) => sum + Math.abs(value), 0), 0.0001);
  const sideBendSourceRange = range(sideBendRaw);
  const eligibleFrameCount = frames.filter((frame) => (frame.debug?.retarget?.sourceQuality ?? 0) >= 0.45).length;
  const failures = [];
  if (frameInspection.frameCount === 0) {
    failures.push({ code: "rendered-frame-count-invalid", count: 1 });
  }
  if (frameInspection.missingFrameIndexes.length > 0) {
    failures.push({ code: "rendered-frames-missing", count: frameInspection.missingFrameIndexes.length });
  }
  if (frameInspection.duplicateFrameIndexes.length > 0) {
    failures.push({ code: "rendered-frame-index-duplicate", count: frameInspection.duplicateFrameIndexes.length });
  }
  if (frameInspection.unexpectedFrameIndexes.length > 0 || frameInspection.invalidFrameEntries.length > 0) {
    failures.push({
      code: "rendered-frame-index-invalid",
      count: frameInspection.unexpectedFrameIndexes.length + frameInspection.invalidFrameEntries.length,
    });
  }
  if (frameInspection.missingDebugFrameIndexes.length > 0) {
    failures.push({ code: "rendered-debug-missing", count: frameInspection.missingDebugFrameIndexes.length });
  }
  if (frameInspection.missingRenderedFrameIndexes.length > 0) {
    failures.push({ code: "rendered-avatar-telemetry-missing", count: frameInspection.missingRenderedFrameIndexes.length });
  }
  if (
    declaredMissingFrames &&
    JSON.stringify(declaredMissingFrames) !== JSON.stringify(frameInspection.missingFrameIndexes)
  ) {
    failures.push({ code: "rendered-frame-accounting-mismatch", count: 1 });
  }
  if (requireIdentity && telemetry.sessionId !== session?.id) {
    failures.push({ code: "rendered-session-identity-mismatch", count: 1 });
  }
  if (requireIdentity && telemetry.recordingId !== session?.id) {
    failures.push({ code: "rendered-recording-identity-mismatch", count: 1 });
  }
  if (requireIdentity && telemetry.sourceHash !== sourceHash) {
    failures.push({ code: "rendered-source-hash-mismatch", count: 1 });
  }
  if (
    expectedMotionPipelineFingerprint &&
    telemetry.motionPipelineFingerprint !== expectedMotionPipelineFingerprint
  ) {
    failures.push({ code: "rendered-pipeline-fingerprint-mismatch", count: 1 });
  }
  const suppressedLegRuns = persistentFrameRuns(suppressedLegFrames);
  if (
    suppressedLegFrames.length / Math.max(eligibleFrameCount, 1) > 0.02 ||
    suppressedLegRuns.length > 0
  ) {
    failures.push({ code: "rendered-leg-motion-suppressed", count: suppressedLegFrames.length });
  }
  Object.entries(segmentMetrics).forEach(([segment, metrics]) => {
    if (metrics.persistentStaticFrameCount > 0) {
      failures.push({
        code: "rendered-segment-held-static",
        count: metrics.persistentStaticFrameCount,
        segment,
      });
    }
  });
  if (headRaw.length >= 5 && (correlation(headRaw, headRendered) < 0.7 || headResponseRatio < 0.55)) {
    failures.push({ code: "rendered-head-pitch-under-response", count: headRaw.length });
  }
  if (
    sideBendRaw.length >= 5 &&
    sideBendSourceRange >= MINIMUM_SIDE_BEND_SOURCE_RANGE &&
    (correlation(sideBendRaw, sideBendRendered) < 0.55 || sideBendResponseRatio < 0.35)
  ) {
    failures.push({ code: "rendered-side-bend-under-response", count: sideBendRaw.length });
  }
  if (!isDeterministicFrameStep && jerkFrames.length / Math.max(eligibleFrameCount, 1) > 0.01) {
    failures.push({ code: "rendered-motion-jerk", count: jerkFrames.length });
  }
  if (ownerFlickers.length > 0) {
    failures.push({ code: "rendered-owner-flicker", count: ownerFlickers.length });
  }
  const mirrorOwnershipSummary = Object.fromEntries(Object.entries(mirrorOwnership).map(([key, value]) => [
    key,
    (() => {
      const persistentHardMismatchRuns = persistentFrameRuns(
        value.hardFailedFrames,
        (frame) => frame.frameIndex,
      );
      return {
      ambiguousFrameCount: value.ambiguousFrames.length,
      excludedFrameCount: value.excludedFrames.length,
      failedFrameCount: value.failedFrames.length,
      hardFailedFrameCount: value.hardFailedFrames.length,
      passRate: round(value.passedFrames.length / Math.max(value.samples, 1)),
      passedFrameCount: value.passedFrames.length,
      persistentHardMismatchRuns: persistentHardMismatchRuns.slice(0, 10).map((run) => ({
        frameEnd: run.at(-1).frameIndex,
        frameStart: run[0].frameIndex,
        length: run.length,
      })),
      sampleCount: value.samples,
      worstFrames: value.failedFrames.slice(0, 20).map((frame) => ({
        ...frame,
        expectedStep: round(frame.expectedStep),
        sourceStep: round(frame.sourceStep),
        wrongStep: round(frame.wrongStep),
      })),
      };
    })(),
  ]));
  Object.entries(mirrorOwnershipSummary).forEach(([segment, summary]) => {
    if (summary.sampleCount >= 10 && summary.passRate < 0.6) {
      failures.push({ code: "rendered-mirror-side-mismatch", count: summary.failedFrameCount, segment });
    }
    if (summary.persistentHardMismatchRuns.length > 0) {
      failures.push({
        code: "rendered-mirror-side-persistent-mismatch",
        count: summary.hardFailedFrameCount,
        segment,
      });
    }
  });

  return {
    eligibleFrameCount,
    failures,
    frameAccounting: {
      compared: frameInspection.compared,
      complete: frameInspection.complete,
      expected: frameInspection.frameCount,
      missing: frameInspection.missingFrameIndexes.length,
      rendered: frameInspection.rendered,
    },
    frameCount: frameInspection.frameCount,
    frameIntegrity: {
      duplicateFrameIndexes: frameInspection.duplicateFrameIndexes,
      invalidFrameEntries: frameInspection.invalidFrameEntries,
      missingDebugFrameIndexes: frameInspection.missingDebugFrameIndexes,
      missingFrameIndexes: frameInspection.missingFrameIndexes,
      missingRenderedFrameIndexes: frameInspection.missingRenderedFrameIndexes,
      unexpectedFrameIndexes: frameInspection.unexpectedFrameIndexes,
    },
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
    missingFrameCount: frameInspection.missingFrameIndexes.length,
    ownerFlickers: {
      count: ownerFlickers.length,
      worstFrames: ownerFlickers.slice(0, 30),
    },
    ownerTransitions: {
      count: ownerTransitions.length,
      worstFrames: ownerTransitions.slice(0, 30),
    },
    transientOwnerTransitions: {
      count: transientOwnerTransitions.length,
      worstFrames: transientOwnerTransitions.slice(0, 30).map((entry) => ({
        ...entry,
        enteringStep: round(entry.enteringStep),
        leavingStep: round(entry.leavingStep),
        returnStep: round(entry.returnStep),
      })),
    },
    sessionId: telemetry.sessionId,
    sourceHash,
    sideBend: {
      correlation: round(correlation(sideBendRaw, sideBendRendered)),
      responseRatio: round(sideBendResponseRatio),
      sampleCount: sideBendRaw.length,
      sourceRange: round(sideBendSourceRange),
    },
    status: failures.length === 0 ? "passed" : "blocked",
    suppressedLegMotion: {
      frameCount: suppressedLegFrames.length,
      persistentRuns: suppressedLegRuns.slice(0, 10).map((run) => ({
        frameEnd: run.at(-1),
        frameStart: run[0],
        length: run.length,
      })),
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
  const report = analyzeFullSequence({
    expectedMotionPipelineFingerprint: movementPipelineFingerprint(),
    requireIdentity: true,
    session,
    telemetry,
  });
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
