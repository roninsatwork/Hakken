import type { MovementBodyOrientationDecision } from "./movementBodyOrientation";

export type MovementAvatarRootOrientationDecision = {
  heightLerp: number;
  owner: string;
  reason: string;
  shouldApply: boolean;
  shouldApplyHeight: boolean;
  slerp: number;
  targetHeightDrop: number;
  targetPitch: number;
  targetRoll: number;
};

export function resolveMovementAvatarRootOrientation({
  bodyOrientation,
}: {
  bodyOrientation: MovementBodyOrientationDecision;
}): MovementAvatarRootOrientationDecision {
  if (
    bodyOrientation.orientation === "upright" &&
    (bodyOrientation.status === "supported" || bodyOrientation.status === "approximate")
  ) {
    return {
      heightLerp: 0.16,
      owner: "upright-root",
      reason: bodyOrientation.summary,
      shouldApply: false,
      shouldApplyHeight: false,
      slerp: 0.16,
      targetHeightDrop: 0,
      targetPitch: 0,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "seated") {
    return {
      heightLerp: 0.18,
      owner: "body-orientation-seated",
      reason: bodyOrientation.summary,
      shouldApply: false,
      shouldApplyHeight: true,
      slerp: 0.16,
      targetHeightDrop: 0.72,
      targetPitch: 0,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "kneeling") {
    return {
      heightLerp: 0.18,
      owner: "body-orientation-kneeling",
      reason: bodyOrientation.summary,
      shouldApply: false,
      shouldApplyHeight: true,
      slerp: 0.16,
      targetHeightDrop: 0.52,
      targetPitch: 0,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "quadruped") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-quadruped",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.12,
      targetHeightDrop: 0.82,
      targetPitch: -Math.PI / 2,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "sideLyingLeft") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-side-lying-left",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.12,
      targetHeightDrop: 0.9,
      targetPitch: 0,
      targetRoll: Math.PI / 2,
    };
  }

  if (bodyOrientation.orientation === "sideLyingRight") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-side-lying-right",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.12,
      targetHeightDrop: 0.9,
      targetPitch: 0,
      targetRoll: -Math.PI / 2,
    };
  }

  if (bodyOrientation.orientation === "supine") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-supine",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.1,
      targetHeightDrop: 0.9,
      targetPitch: Math.PI / 2,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "prone") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-prone",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.1,
      targetHeightDrop: 0.9,
      targetPitch: -Math.PI / 2,
      targetRoll: 0,
    };
  }

  return {
    heightLerp: 0.16,
    owner: "upright-root-held",
    reason: bodyOrientation.summary,
    shouldApply: false,
    shouldApplyHeight: false,
    slerp: 0.16,
    targetHeightDrop: 0,
    targetPitch: 0,
    targetRoll: 0,
  };
}
