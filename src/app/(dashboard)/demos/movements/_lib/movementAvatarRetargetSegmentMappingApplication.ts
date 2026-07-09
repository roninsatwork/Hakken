import * as THREE from "three";
import type {
  MovementAvatarRetargetSegmentApplicationDecision,
} from "./movementAvatarPipeline";
import {
  movementSourceSegmentToAvatarWorldDirection,
  type MovementAvatarRetargetBoneMapping,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";
import { applyMovementAvatarRestMappedWorldDirectionWithLookup } from "./movementAvatarRestMappedSegmentApplication";

export type MovementAvatarRetargetSegmentWorldDirectionSpec = {
  bone: MovementAvatarRetargetBoneName;
  desiredWorldDirection: THREE.Vector3;
  slerp: number;
};

export type MovementAvatarRetargetSegmentApplicationCounts = {
  applied: number;
  arms: number;
  feet: number;
  legs: number;
  spine: number;
};

export type MovementAvatarRestMappedWorldDirectionBatchApplicationResult = {
  applied: number;
  restMap: MovementAvatarRetargetRestMap;
};

export type MovementAvatarRetargetSegmentMappingApplicationResult = {
  applied: boolean;
  restMap: MovementAvatarRetargetRestMap;
};

export function applyMovementAvatarRetargetSegmentMappings({
  apply,
  mappings,
}: {
  apply: (mapping: MovementAvatarRetargetBoneMapping) => boolean;
  mappings: MovementAvatarRetargetBoneMapping[];
}): MovementAvatarRetargetSegmentApplicationCounts {
  const counts: MovementAvatarRetargetSegmentApplicationCounts = {
    applied: 0,
    arms: 0,
    feet: 0,
    legs: 0,
    spine: 0,
  };

  mappings.forEach((mapping) => {
    if (!apply(mapping)) return;

    counts.applied += 1;
    if (mapping.type === "arm") counts.arms += 1;
    if (mapping.type === "foot") counts.feet += 1;
    if (mapping.type === "leg") counts.legs += 1;
    if (mapping.type === "spine") counts.spine += 1;
  });

  return counts;
}

export function applyMovementAvatarRetargetSegmentMappingToVrmBones({
  canApply = true,
  currentRestMap,
  lookupBone,
  mapping,
  refreshRestMap,
  rememberLastGood = true,
  retargetFrame,
  segmentApplicationDecision,
  storeLastGood,
}: {
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  mapping: MovementAvatarRetargetBoneMapping;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  rememberLastGood?: boolean;
  retargetFrame: MovementRetargetFrame;
  segmentApplicationDecision: MovementAvatarRetargetSegmentApplicationDecision;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRetargetSegmentMappingApplicationResult {
  const segmentApplicationSpec = resolveMovementAvatarRetargetSegmentWorldDirection({
    mapping,
    retargetFrame,
    segmentApplicationDecision,
  });
  if (!segmentApplicationSpec) {
    return {
      applied: false,
      restMap: currentRestMap,
    };
  }

  const result = applyMovementAvatarRestMappedWorldDirectionWithLookup({
    boneName: segmentApplicationSpec.bone,
    canApply,
    currentRestMap,
    desiredWorldDirection: segmentApplicationSpec.desiredWorldDirection,
    lookupBone,
    refreshRestMap,
    rememberLastGood,
    slerp: segmentApplicationSpec.slerp,
    storeLastGood,
  });

  return {
    applied: result.applied,
    restMap: result.restMap,
  };
}

const AVATAR_WORLD_UP = new THREE.Vector3(0, 1, 0);

/**
 * Source landmark axes follow the camera, not gravity. The calibrated neutral
 * spine is the vertical reference: rotating every desired direction by the
 * quaternion that maps that neutral onto world-up cancels camera tilt.
 */
function resolveMovementAvatarCameraTiltCorrection({
  retargetFrame,
  zScale,
}: {
  retargetFrame: MovementRetargetFrame;
  zScale: number;
}): THREE.Quaternion | null {
  if (!retargetFrame.neutralSpineDirection) return null;

  const neutralSpine = movementSourceSegmentToAvatarWorldDirection(
    retargetFrame.neutralSpineDirection,
    zScale,
  );
  if (!neutralSpine) return null;

  return new THREE.Quaternion().setFromUnitVectors(neutralSpine, AVATAR_WORLD_UP);
}

export function resolveMovementAvatarRetargetSegmentWorldDirection({
  mapping,
  retargetFrame,
  segmentApplicationDecision,
}: {
  mapping: MovementAvatarRetargetBoneMapping;
  retargetFrame: MovementRetargetFrame;
  segmentApplicationDecision: MovementAvatarRetargetSegmentApplicationDecision;
}): MovementAvatarRetargetSegmentWorldDirectionSpec | null {
  if (!segmentApplicationDecision.shouldApply) return null;

  const segment = retargetFrame.segments[mapping.segment];
  if (!segment) return null;

  // Legs and feet are co-driven by squat/leg-raise/planted-IK appliers that
  // operate in the raw camera frame, so only the upper body is tilt-corrected.
  const cameraTiltCorrection = mapping.type === "spine" || mapping.type === "arm"
    ? resolveMovementAvatarCameraTiltCorrection({
        retargetFrame,
        zScale: segmentApplicationDecision.zScale,
      })
    : null;

  // The spine has no meaning without a vertical reference: applying it raw
  // bakes the webcam's tilt into the avatar's torso and head.
  if (mapping.type === "spine" && !cameraTiltCorrection) return null;

  const desiredWorldDirection = movementSourceSegmentToAvatarWorldDirection(
    segment.direction,
    segmentApplicationDecision.zScale,
  );
  if (!desiredWorldDirection) return null;

  if (cameraTiltCorrection) {
    desiredWorldDirection.applyQuaternion(cameraTiltCorrection);
  }

  return {
    bone: mapping.bone,
    desiredWorldDirection,
    slerp: segmentApplicationDecision.slerp,
  };
}
