import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";
import {
  resolveMovementAvatarFrameTargetRuntime,
  type MovementAvatarFrameTargetRuntimeDecision,
} from "./movementAvatarFrameTargetRuntime";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  createMovementAvatarRetargetFrameRuntimeAdapters,
  type MovementAvatarRetargetFrameRuntimeAdapters,
} from "./movementAvatarRetargetFrameRuntime";
import type {
  MovementAvatarRetargetBoneName,
  MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";
import type {
  VrmHandsPayload,
  VrmSolverLandmark,
} from "./vrmRigging";

export type MovementAvatarFrameTargetRetargetOrchestrationRuntime = {
  frameTargetRuntime: MovementAvatarFrameTargetRuntimeDecision;
  retargetFrameRuntimeAdapters: MovementAvatarRetargetFrameRuntimeAdapters;
};

export function resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime({
  armAvatarRole,
  avatarRole,
  avatarRoot,
  currentRestMap,
  imageLandmarks,
  instructorSquatPresentationDepth,
  lastGood,
  lookupBone,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  profile,
  retargetFrame,
  rigHands,
  shouldUseRetargetedUpperBody,
  solverLandmarks,
  targetSolverLandmarks,
  vrm,
}: {
  armAvatarRole?: "instructor" | "player";
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  currentRestMap: MovementAvatarRetargetRestMap;
  imageLandmarks: VrmSolverLandmark[];
  instructorSquatPresentationDepth: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodySegmentMotion: number;
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  rigHands: VrmHandsPayload | undefined;
  shouldUseRetargetedUpperBody: boolean;
  solverLandmarks: VrmSolverLandmark[];
  targetSolverLandmarks: VrmSolverLandmark[];
  vrm: VRM | null | undefined;
}): MovementAvatarFrameTargetRetargetOrchestrationRuntime {
  const frameTargetRuntime = resolveMovementAvatarFrameTargetRuntime({
    armAvatarRole,
    avatarRole,
    imageLandmarks,
    lowerBodyDrive,
    rigHands,
    solverLandmarks,
    targetSolverLandmarks,
  });

  return {
    frameTargetRuntime,
    retargetFrameRuntimeAdapters: createMovementAvatarRetargetFrameRuntimeAdapters({
      avatarRole,
      avatarRoot,
      currentRestMap,
      instructorSquatPresentationDepth,
      lastGood,
      lookupBone,
      lowerBodySegmentMotion,
      profile,
      retargetFrame,
      shouldUseRetargetedUpperBody,
      vrm,
    }),
  };
}
