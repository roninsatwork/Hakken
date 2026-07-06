import * as THREE from "three";
import type {
  MovementAvatarBoneRotationSpec,
  MovementAvatarLegacyLowerBodyAimOptionsDecision,
  MovementAvatarLegacyLowerBodyAimSpec,
} from "./movementAvatarPipeline";
import {
  resolveMovementAvatarLegacyLowerBodyAimPose,
  resolveMovementAvatarPlantedFootOwner,
} from "./movementAvatarPipeline";
import type {
  MovementAvatarInstructorFootPlantBone,
  MovementAvatarInstructorFootPlantContacts,
  MovementAvatarInstructorFootPlantPoseResult,
  MovementAvatarInstructorFootPlantSide,
  MovementAvatarLegacyLowerBodyAimRequest,
  MovementAvatarLegacyLowerBodyAimRequestApplicationResult,
  MovementAvatarLegacyLowerBodyAimTargets,
  MovementAvatarLowerBodyAimLandmark,
} from "./movementAvatarLowerBodyApplicationTypes";
import type { MovementAvatarLowerBodyRetargetApplicationPlan } from "./movementAvatarLowerBodyApplicationPlan";
import { applyMovementAvatarAimVectorToObjects } from "./movementAvatarAimApplication";

export function applyMovementAvatarInstructorFootPlantRequests({
  apply,
  contacts,
  sides,
}: {
  apply: (side: MovementAvatarInstructorFootPlantSide) => boolean;
  contacts?: MovementAvatarInstructorFootPlantContacts;
  sides: MovementAvatarInstructorFootPlantSide[];
}) {
  let applied = 0;

  sides.forEach((side) => {
    if (contacts && !contacts[side === "left" ? "leftFoot" : "rightFoot"]) return;
    if (apply(side)) {
      applied += 1;
    }
  });

  return {
    applied,
  };
}

export function applyMovementAvatarInstructorFootPlantPose({
  applyRotation,
  currentFeetOwner,
  isPlayer,
  side,
  slerp = 0.62,
}: {
  applyRotation: (spec: {
    bone: MovementAvatarInstructorFootPlantBone;
    rotation: MovementAvatarBoneRotationSpec["rotation"];
    slerp: number;
  }) => boolean | void;
  currentFeetOwner: string;
  isPlayer: boolean;
  side: MovementAvatarInstructorFootPlantSide;
  slerp?: number;
}): MovementAvatarInstructorFootPlantPoseResult {
  if (isPlayer) {
    return {
      applied: false,
      appliedRotations: 0,
      feetOwner: currentFeetOwner,
    };
  }

  const rotation = { x: 0, y: 0, z: 0 };
  const specs = [
    { bone: `${side}Foot` as const, rotation, slerp },
    { bone: `${side}Toes` as const, rotation, slerp },
  ];
  let appliedRotations = 0;
  specs.forEach((spec) => {
    if (applyRotation(spec) !== false) {
      appliedRotations += 1;
    }
  });

  return {
    applied: true,
    appliedRotations,
    feetOwner: resolveMovementAvatarPlantedFootOwner(currentFeetOwner),
  };
}

export function resolveMovementAvatarLegacyLowerBodyAimRequests({
  options,
  pose = resolveMovementAvatarLegacyLowerBodyAimPose(),
  targets,
  targetSolverLandmarks,
}: {
  options: MovementAvatarLegacyLowerBodyAimOptionsDecision;
  pose?: MovementAvatarLegacyLowerBodyAimSpec[];
  targets: MovementAvatarLegacyLowerBodyAimTargets;
  targetSolverLandmarks: Array<MovementAvatarLowerBodyAimLandmark | null | undefined>;
}): MovementAvatarLegacyLowerBodyAimRequest[] {
  return pose.map((spec) => ({
    bone: spec.bone,
    child: spec.child,
    options: options[spec.options],
    source: spec.source.type === "landmark"
      ? targetSolverLandmarks[spec.source.index]
      : targets[spec.source.target],
    target: targets[spec.target],
  }));
}

export function resolveMovementAvatarLowerBodyRetargetAimRequests({
  options,
  retargetApplicationPlan,
  targets,
  targetSolverLandmarks,
}: {
  options: MovementAvatarLegacyLowerBodyAimOptionsDecision;
  retargetApplicationPlan: Pick<MovementAvatarLowerBodyRetargetApplicationPlan, "shouldApplyLegacyAim">;
  targets: MovementAvatarLegacyLowerBodyAimTargets;
  targetSolverLandmarks: Array<MovementAvatarLowerBodyAimLandmark | null | undefined>;
}): MovementAvatarLegacyLowerBodyAimRequest[] {
  if (!retargetApplicationPlan.shouldApplyLegacyAim) return [];

  return resolveMovementAvatarLegacyLowerBodyAimRequests({
    options,
    targets,
    targetSolverLandmarks,
  });
}

export function applyMovementAvatarLegacyLowerBodyAimRequests({
  apply,
  requests,
}: {
  apply: (request: MovementAvatarLegacyLowerBodyAimRequest) => void;
  requests: MovementAvatarLegacyLowerBodyAimRequest[];
}) {
  requests.forEach((request) => {
    apply(request);
  });

  return {
    applied: requests.length,
  };
}

export function applyMovementAvatarLegacyLowerBodyAimRequestsToVrmBones({
  fallbackSlerp,
  getLastGoodQuaternion,
  lookupBone,
  requests,
  storeLastGoodQuaternion,
  zScale,
}: {
  fallbackSlerp: number;
  getLastGoodQuaternion?: (boneName: string) => THREE.Quaternion | null | undefined;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  requests: MovementAvatarLegacyLowerBodyAimRequest[];
  storeLastGoodQuaternion?: (boneName: string, quaternion: THREE.Quaternion) => void;
  zScale: number;
}): MovementAvatarLegacyLowerBodyAimRequestApplicationResult {
  let applied = 0;

  requests.forEach((request) => {
    const result = applyMovementAvatarAimVectorToObjects({
      boneName: request.bone,
      childName: request.child,
      frontBias: request.options.frontBias,
      getLastGoodQuaternion,
      lookupBone,
      minVectorLengthSq: request.options.minVectorLengthSq,
      slerp: request.options.slerpOverride ?? fallbackSlerp,
      start: request.source,
      storeLastGoodQuaternion,
      storeVisibilityThreshold: request.options.storeVisibilityThreshold,
      target: request.target,
      visibilityThreshold: request.options.visibilityThreshold,
      zScale,
    });

    if (result.applied) applied += 1;
  });

  return {
    applied,
  };
}
