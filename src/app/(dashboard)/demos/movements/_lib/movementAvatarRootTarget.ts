import type { MovementAvatarRootOrientationDecision } from "./movementAvatarPipeline";
import {
  resolveMovementRootMotionJumpResponse,
  resolveMovementRootMotionStepResponse,
  type MovementRootMotionFrame,
  type MovementRootMotionJumpResponseDecision,
  type MovementRootMotionStepResponseDecision,
} from "./movementRootMotion";

const ROOT_MOTION_HEADING_CONFIDENCE = 0.45;
const ROOT_MOTION_POSITION_CONFIDENCE = 0.45;
const ROOT_MOTION_MAX_OFFSET_METERS = 2.4;
const ROOT_MOTION_POSITION_SCALE = 1;
const ROOT_MOTION_BACKWARD_POSITION_SCALE = 0.35;
const ROOT_ORIENTATION_NEUTRAL_LERP = 0.16;

const unavailableJumpResponse: MovementRootMotionJumpResponseDecision = {
  heightOffset: 0,
  landingCompression: 0,
  lift: 0,
  owner: "jump-response-unavailable",
  shouldApply: false,
  slerp: 0,
  summary: "Root-motion frame is unavailable.",
};

const unavailableStepResponse: MovementRootMotionStepResponseDecision = {
  footLiftOffset: 0,
  landingCompression: 0,
  owner: "step-response-unavailable",
  shouldApply: false,
  side: null,
  slerp: 0,
  summary: "Root-motion frame is unavailable.",
};

export type MovementAvatarRootTargetDecision = {
  jumpResponse: MovementRootMotionJumpResponseDecision;
  rootHeightLerp: number;
  rootHeadingYaw: number;
  rootOrientationSlerp: number;
  source: MovementRootMotionFrame["debug"]["source"] | "unavailable";
  stepResponse: MovementRootMotionStepResponseDecision;
  targetHeightDrop: number;
  targetJumpHeightOffset: number;
  targetPitch: number;
  targetRoll: number;
  targetX: number;
  targetY: number;
  targetYaw: number;
  targetZ: number;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function clampRootMotionOffset(value: number) {
  return clamp(value, -ROOT_MOTION_MAX_OFFSET_METERS, ROOT_MOTION_MAX_OFFSET_METERS);
}

function scaleRootMotionZOffset(z: number) {
  return z * ROOT_MOTION_POSITION_SCALE * (z < 0 ? ROOT_MOTION_BACKWARD_POSITION_SCALE : 1);
}

function shouldApplyMovementAvatarRootHeading(rootMotion: MovementRootMotionFrame | null) {
  if (!rootMotion || rootMotion.debug.source !== "world-landmarks") return false;
  if (rootMotion.headingConfidence < ROOT_MOTION_HEADING_CONFIDENCE) return false;

  return rootMotion.intent.key === "root-travel"
    || rootMotion.intent.key === "turn-and-travel"
    || rootMotion.intent.key === "turn-on-spot"
    || rootMotion.intent.key === "left-foot-pivot"
    || rootMotion.intent.key === "right-foot-pivot";
}

export function resolveMovementAvatarRootTarget({
  avatarBaseY,
  avatarRootVisualLerp,
  positionOffset,
  rootMotion,
  rootOrientation,
  visualRootDrop,
}: {
  avatarBaseY: number;
  avatarRootVisualLerp: number;
  positionOffset: readonly [number, number, number];
  rootMotion: MovementRootMotionFrame | null;
  rootOrientation: MovementAvatarRootOrientationDecision;
  visualRootDrop: number;
}): MovementAvatarRootTargetDecision {
  const shouldApplyRootMotion = rootMotion?.debug.source === "world-landmarks";
  const rootHeadingYaw = shouldApplyMovementAvatarRootHeading(rootMotion) ? rootMotion!.headingYaw : 0;
  const targetYaw = Math.PI + rootHeadingYaw;
  const rootPosition =
    shouldApplyRootMotion && rootMotion.rootPositionConfidence >= ROOT_MOTION_POSITION_CONFIDENCE
      ? rootMotion.rootPosition
      : null;
  const targetX = positionOffset[0] + (rootPosition ? clampRootMotionOffset(rootPosition.x * ROOT_MOTION_POSITION_SCALE) : 0);
  const targetZ = positionOffset[2] + (rootPosition ? clampRootMotionOffset(scaleRootMotionZOffset(rootPosition.z)) : 0);
  const jumpResponse = rootMotion
    ? resolveMovementRootMotionJumpResponse(rootMotion.intent)
    : unavailableJumpResponse;
  const stepResponse = rootMotion
    ? resolveMovementRootMotionStepResponse(rootMotion.intent)
    : unavailableStepResponse;
  const targetJumpHeightOffset = jumpResponse.shouldApply ? jumpResponse.heightOffset : 0;
  const targetPitch = rootOrientation.shouldApply ? rootOrientation.targetPitch : 0;
  const targetRoll = rootOrientation.shouldApply ? rootOrientation.targetRoll : 0;
  const rootOrientationSlerp = rootOrientation.shouldApply
    ? rootOrientation.slerp
    : ROOT_ORIENTATION_NEUTRAL_LERP;
  const rootPostureDrop = rootOrientation.shouldApplyHeight
    ? rootOrientation.targetHeightDrop
    : 0;
  const targetHeightDrop = Math.max(visualRootDrop, rootPostureDrop);
  const rootHeightLerp = jumpResponse.shouldApply
    ? jumpResponse.slerp
    : rootOrientation.shouldApplyHeight
      ? rootOrientation.heightLerp
      : avatarRootVisualLerp;

  return {
    jumpResponse,
    rootHeightLerp,
    rootHeadingYaw,
    rootOrientationSlerp,
    source: rootMotion?.debug.source ?? "unavailable",
    stepResponse,
    targetHeightDrop,
    targetJumpHeightOffset,
    targetPitch,
    targetRoll,
    targetX,
    targetY: avatarBaseY - targetHeightDrop + targetJumpHeightOffset,
    targetYaw,
    targetZ,
  };
}
