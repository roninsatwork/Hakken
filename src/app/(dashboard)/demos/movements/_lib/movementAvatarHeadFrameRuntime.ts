import type * as THREE from "three";
import {
  buildMovementAvatarFrameTrackingDebugState,
  type MovementAvatarFrameTrackingDebugInput,
} from "./movementAvatarDebugTelemetry";
import {
  applyMovementAvatarHeadRuntimeToVrmBones,
  type MovementAvatarHeadRuntimeApplication,
} from "./movementAvatarHeadRuntime";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

export type MovementAvatarHeadFrameDebugInput = Omit<
  MovementAvatarFrameTrackingDebugInput,
  "appliedHead" | "avatarHead" | "headMotionIntent" | "headOwner" | "rawHead" | "updatedAt"
>;

export type MovementAvatarHeadFrameRuntimeResult = {
  headRuntimeApplication: MovementAvatarHeadRuntimeApplication;
  nextBaseHeadPosition: THREE.Vector3 | null;
  trackingDebugState: MovementTrackingDebugState | null;
};

export function applyMovementAvatarHeadFrameRuntime({
  debugInput,
  debugUpdatedAt,
  headInput,
}: {
  debugInput?: MovementAvatarHeadFrameDebugInput | null;
  debugUpdatedAt: number;
  headInput: Parameters<typeof applyMovementAvatarHeadRuntimeToVrmBones>[0];
}): MovementAvatarHeadFrameRuntimeResult {
  const headRuntimeApplication = applyMovementAvatarHeadRuntimeToVrmBones(headInput);
  if (!headRuntimeApplication.applied) {
    return {
      headRuntimeApplication,
      nextBaseHeadPosition: null,
      trackingDebugState: null,
    };
  }

  const { headApplication, headNode, headTarget } = headRuntimeApplication;
  const { appliedHead, headOwner } = headTarget.headDecision;
  const { headMotionIntent } = headTarget;
  const { rawHead } = headTarget.rawHeadDecision;

  return {
    headRuntimeApplication,
    nextBaseHeadPosition: headApplication.baseHeadPosition ?? null,
    trackingDebugState: debugInput
      ? buildMovementAvatarFrameTrackingDebugState({
          ...debugInput,
          updatedAt: debugUpdatedAt,
          appliedHead,
          avatarHead: { headNode, headTarget },
          headMotionIntent,
          headOwner,
          rawHead,
        })
      : null,
  };
}
