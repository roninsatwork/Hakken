import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { resolveMovementAvatarRetargetSegmentApplication } from "./movementAvatarPipeline";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";
import type { MovementRetargetFrame } from "./movementRetargeting";
import {
  buildMovementAvatarRetargetRestMap,
  type MovementAvatarRetargetBoneMapping,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import {
  applyMovementAvatarRetargetSegmentMappingToVrmBones,
  applyMovementAvatarRetargetSegmentMappings,
  type MovementAvatarRetargetSegmentApplicationCounts,
} from "./movementAvatarSegmentApplication";

export type MovementAvatarRetargetSegmentRuntimeApplication = MovementAvatarRetargetSegmentApplicationCounts & {
  restMap: MovementAvatarRetargetRestMap;
};

export function applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
  avatarRole,
  canApply = true,
  currentRestMap,
  hasWorldLandmarks,
  instructorSquatPresentationDepth,
  lookupBone,
  lowerBodySegmentMotion,
  mappings,
  profile,
  refreshRestMap,
  retargetFrame,
  shouldUseRetargetedUpperBody,
  storeLastGood,
}: {
  avatarRole: "instructor" | "player";
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  hasWorldLandmarks: boolean;
  instructorSquatPresentationDepth: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodySegmentMotion: number;
  mappings: MovementAvatarRetargetBoneMapping[];
  profile?: MovementAvatarTrackingProfile;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  retargetFrame: MovementRetargetFrame;
  shouldUseRetargetedUpperBody: boolean;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRetargetSegmentRuntimeApplication {
  let restMap = currentRestMap;
  const counts = applyMovementAvatarRetargetSegmentMappings({
    apply: (mapping) => {
      const segmentApplicationDecision = resolveMovementAvatarRetargetSegmentApplication({
        avatarRole,
        hasWorldLandmarks,
        instructorSquatPresentationDepth,
        lowerBodySegmentMotion,
        profile,
        retargetFrame,
        segmentName: mapping.segment,
        segmentType: mapping.type,
        shouldUseRetargetedUpperBody,
      });
      const application = applyMovementAvatarRetargetSegmentMappingToVrmBones({
        canApply,
        currentRestMap: restMap,
        lookupBone,
        mapping,
        refreshRestMap,
        retargetFrame,
        segmentApplicationDecision,
        storeLastGood,
      });
      restMap = application.restMap;

      return application.applied;
    },
    mappings,
  });

  return {
    ...counts,
    restMap,
  };
}

export function applyMovementAvatarRetargetSegmentRuntimeFrame({
  avatarRole,
  currentRestMap,
  hasWorldLandmarks,
  instructorSquatPresentationDepth,
  lastGood,
  lookupBone,
  lowerBodySegmentMotion,
  mappings,
  profile,
  retargetFrame,
  shouldUseRetargetedUpperBody,
  vrm,
}: {
  avatarRole: "instructor" | "player";
  currentRestMap: MovementAvatarRetargetRestMap;
  hasWorldLandmarks: boolean;
  instructorSquatPresentationDepth: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodySegmentMotion: number;
  mappings: MovementAvatarRetargetBoneMapping[];
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  shouldUseRetargetedUpperBody: boolean;
  vrm: VRM | null | undefined;
}): MovementAvatarRetargetSegmentRuntimeApplication {
  return applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
    avatarRole,
    canApply: Boolean(vrm),
    currentRestMap,
    hasWorldLandmarks,
    instructorSquatPresentationDepth,
    lookupBone,
    lowerBodySegmentMotion,
    mappings,
    profile,
    refreshRestMap: () => vrm ? buildMovementAvatarRetargetRestMap(vrm) : currentRestMap,
    retargetFrame,
    shouldUseRetargetedUpperBody,
    storeLastGood: (lastGoodBoneName, quaternion) => {
      lastGood[lastGoodBoneName] = quaternion;
    },
  });
}
