import * as THREE from "three";
import type { MovementAvatarRetargetSegmentApplicationDecision } from "./movementAvatarPipeline";
import {
  movementSourceSegmentToAvatarWorldDirection,
  type MovementAvatarRetargetBoneMapping,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";
import { applyMovementAvatarRestMappedWorldDirectionWithLookup } from "./movementAvatarRestMappedSegmentApplication";
import {
  resolveMovementAvatarRetargetCameraTiltCorrection,
  resolveMovementAvatarRetargetLimbAngleStep,
} from "./movementAvatarRetargetSegmentWorldDirectionDecision";
import {
  movementAvatarFrameRateAdjustedAngleStep,
  movementAvatarFrameRateAdjustedSlerp,
} from "./movementAvatarFrameTiming";

export type MovementAvatarRetargetSegmentWorldDirectionSpec = {
  bone: MovementAvatarRetargetBoneName;
  desiredWorldDirection: THREE.Vector3;
  maxLocalAngleStep?: number;
  slerp: number;
};

export type MovementAvatarRetargetSegmentApplicationCounts = {
  applied: number;
  arms: number;
  feet: number;
  legs: number;
  spine: number;
};

export type MovementAvatarRestMappedWorldDirectionBatchApplicationResult = { applied: number; restMap: MovementAvatarRetargetRestMap };

export type MovementAvatarRetargetSegmentMappingApplicationResult = { applied: boolean; restMap: MovementAvatarRetargetRestMap };

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
  avatarRole = "instructor",
  canApply = true,
  currentRestMap,
  frameDeltaSeconds,
  lookupBone,
  mapping,
  refreshRestMap,
  rememberLastGood = true,
  retargetFrame,
  segmentApplicationDecision,
  storeLastGood,
}: {
  avatarRole?: "instructor" | "player";
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  frameDeltaSeconds?: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  mapping: MovementAvatarRetargetBoneMapping;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  rememberLastGood?: boolean;
  retargetFrame: MovementRetargetFrame;
  segmentApplicationDecision: MovementAvatarRetargetSegmentApplicationDecision;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRetargetSegmentMappingApplicationResult {
  const segmentApplicationSpec = resolveMovementAvatarRetargetSegmentWorldDirection({
    avatarRole,
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

  const timedSegmentApplicationSpec = mapping.type === "arm"
    ? {
        ...segmentApplicationSpec,
        maxLocalAngleStep: movementAvatarFrameRateAdjustedAngleStep(
          segmentApplicationSpec.maxLocalAngleStep,
          frameDeltaSeconds,
        ),
        slerp: movementAvatarFrameRateAdjustedSlerp(
          segmentApplicationSpec.slerp,
          frameDeltaSeconds,
        ),
      }
    : segmentApplicationSpec;

  const result = applyMovementAvatarRestMappedWorldDirectionWithLookup({
    boneName: timedSegmentApplicationSpec.bone,
    canApply,
    currentRestMap,
    desiredWorldDirection: timedSegmentApplicationSpec.desiredWorldDirection,
    lookupBone,
    maxLocalAngleStep: timedSegmentApplicationSpec.maxLocalAngleStep,
    refreshRestMap,
    rememberLastGood,
    slerp: timedSegmentApplicationSpec.slerp,
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
  avatarRole?: "instructor" | "player";
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
    ? resolveMovementAvatarRetargetCameraTiltCorrection({
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

  // Player-side anatomical ownership is resolved before this layer by the
  // display landmark mapping. Do not add another horizontal reflection here:
  // this function only converts the already-mapped segment into VRM world
  // coordinates.

  const limbAngleStep = resolveMovementAvatarRetargetLimbAngleStep({
    confidence: segment.confidence,
    type: mapping.type,
  });

  return {
    bone: mapping.bone,
    desiredWorldDirection,
    // Arm continuity is bounded in world-target space before this application;
    // a local cap would fight the compensation required when the parent arm
    // moves. Legs use a shorter linear ramp and reach the generous
    // clear-tracking cap by 0.6 confidence.
    maxLocalAngleStep: limbAngleStep,
    slerp: segmentApplicationDecision.slerp,
  };
}
