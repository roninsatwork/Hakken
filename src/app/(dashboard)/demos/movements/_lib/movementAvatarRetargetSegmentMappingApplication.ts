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

  const desiredWorldDirection = movementSourceSegmentToAvatarWorldDirection(
    segment.direction,
    segmentApplicationDecision.zScale,
  );
  if (!desiredWorldDirection) return null;

  return {
    bone: mapping.bone,
    desiredWorldDirection,
    slerp: segmentApplicationDecision.slerp,
  };
}
