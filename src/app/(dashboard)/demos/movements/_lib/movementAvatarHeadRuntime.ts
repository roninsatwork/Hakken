import type * as THREE from "three";
import type { MovementAvatarTrackingProfile, MovementCalibration, MovementHeadMotionIntent, TrackingLandmark } from "./movementTrackingCalibration";
import {
  applyMovementAvatarHeadApplicationToVrmBones,
  type MovementAvatarHeadApplicationResult,
} from "./movementAvatarHeadApplication";
import {
  resolveMovementAvatarHeadTarget,
  type MovementAvatarHeadTargetDecision,
} from "./movementAvatarHeadTarget";

export type MovementAvatarHeadRuntimeApplication =
  | {
    applied: false;
    reason: "missing-head-bone" | "missing-head-landmarks";
  }
  | {
    applied: true;
    headApplication: MovementAvatarHeadApplicationResult;
    headNode: THREE.Object3D;
    headTarget: MovementAvatarHeadTargetDecision;
  };

export function applyMovementAvatarHeadRuntimeToVrmBones({
  avatarRole,
  avatarRootYaw,
  baseHeadPosition,
  calibration,
  faceLandmarks,
  headMotionIntent,
  lookupBone,
  neckSlerp,
  poseLandmarks,
  profile,
  shouldApplyLowerBody,
  shouldApplySpine,
}: {
  avatarRole: "instructor" | "player";
  avatarRootYaw: number;
  baseHeadPosition: THREE.Vector3 | null | undefined;
  calibration: MovementCalibration | null;
  faceLandmarks?: TrackingLandmark[] | null;
  headMotionIntent?: MovementHeadMotionIntent;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  neckSlerp: number;
  poseLandmarks: TrackingLandmark[];
  profile?: MovementAvatarTrackingProfile;
  shouldApplyLowerBody: boolean;
  shouldApplySpine: boolean;
}): MovementAvatarHeadRuntimeApplication {
  const leftEar = poseLandmarks[7];
  const rightEar = poseLandmarks[8];
  const nose = poseLandmarks[0];
  if (!leftEar || !rightEar || !nose) {
    return {
      applied: false,
      reason: "missing-head-landmarks",
    };
  }

  const headNode = lookupBone("head");
  if (!headNode) {
    return {
      applied: false,
      reason: "missing-head-bone",
    };
  }

  const headTarget = resolveMovementAvatarHeadTarget({
    avatarRole,
    avatarRootYaw,
    calibration,
    faceLandmarks,
    headMotionIntent,
    poseLandmarks,
    profile,
    shouldApplyLowerBody,
    shouldApplySpine,
  });
  const headApplication = applyMovementAvatarHeadApplicationToVrmBones({
    baseHeadPosition,
    headApplicationPose: headTarget.applicationPose,
    headBonePitch: headTarget.headBonePitch,
    headPositionSlerp: headTarget.applyOptions.headPositionSlerp,
    headRoll: headTarget.headDecision.headRoll,
    headSlerp: headTarget.applyOptions.headSlerp,
    headWorldYaw: headTarget.headWorldYaw,
    lookupBone,
    neckSlerp,
    shouldApplyHeadMotion: headTarget.headDecision.shouldApplyHeadMotion,
    upperChestCompensationSlerp: headTarget.applyOptions.upperChestCompensationSlerp,
  });

  return {
    applied: true,
    headApplication,
    headNode,
    headTarget,
  };
}
