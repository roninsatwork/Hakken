import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";
import { applyMovementAvatarPlantedSquatIkRuntimeVrmFrame } from "./movementAvatarPlantedSquatIkRuntime";
import {
  applyMovementAvatarRetargetSegmentRuntimeFrame,
  type MovementAvatarRetargetSegmentRuntimeApplication,
} from "./movementAvatarRetargetSegmentRuntime";
import type {
  MovementAvatarRetargetBoneMapping,
  MovementAvatarRetargetBoneName,
  MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";

export type MovementAvatarRetargetFrameRuntimeAdapters = {
  applyPlantedSquatIk: (depth: number) => number;
  applyRetargetMappings: (mappings: MovementAvatarRetargetBoneMapping[]) => MovementAvatarRetargetSegmentRuntimeApplication;
  getRestMap: () => MovementAvatarRetargetRestMap;
};

export function createMovementAvatarRetargetFrameRuntimeAdapters({
  avatarRole,
  avatarRoot,
  currentRestMap,
  instructorSquatPresentationDepth,
  lastGood,
  lookupBone,
  lowerBodySegmentMotion,
  profile,
  retargetFrame,
  vrm,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  currentRestMap: MovementAvatarRetargetRestMap;
  instructorSquatPresentationDepth: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodySegmentMotion: number;
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  vrm: VRM | null | undefined;
}): MovementAvatarRetargetFrameRuntimeAdapters {
  let restMap = currentRestMap;

  return {
    applyPlantedSquatIk: (depth) => {
      const application = applyMovementAvatarPlantedSquatIkRuntimeVrmFrame({
        avatarRoot,
        avatarRole,
        currentRestMap: restMap,
        depth,
        lookupBone,
        vrm,
      });
      restMap = application.restMap;

      return application.appliedDepth;
    },
    applyRetargetMappings: (mappings) => {
      const application = applyMovementAvatarRetargetSegmentRuntimeFrame({
        avatarRole,
        currentRestMap: restMap,
        instructorSquatPresentationDepth,
        lastGood,
        lookupBone,
        lowerBodySegmentMotion,
        mappings,
        profile,
        retargetFrame,
              vrm,
      });
      restMap = application.restMap;

      return application;
    },
    getRestMap: () => restMap,
  };
}
