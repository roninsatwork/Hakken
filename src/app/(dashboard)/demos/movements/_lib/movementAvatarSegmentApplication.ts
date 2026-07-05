import * as THREE from "three";
import type {
  MovementAvatarBasisDirection,
  MovementAvatarLowerBodyBoneName,
  MovementAvatarPlantedSquatIkPoseDecision,
  MovementAvatarRetargetSegmentApplicationDecision,
} from "./movementAvatarPipeline";
import type { MovementRetargetFrame } from "./movementRetargeting";
import {
  movementSourceSegmentToAvatarWorldDirection,
  type MovementAvatarRetargetBoneMapping,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestBone,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";

export type MovementAvatarRestMappedQuaternionTarget = {
  targetLocalQuaternion: THREE.Quaternion;
  targetWorldQuaternion: THREE.Quaternion;
};

export type MovementAvatarRestMappedWorldDirectionApplicationResult = {
  target: MovementAvatarRestMappedQuaternionTarget;
  finalLocalQuaternion: THREE.Quaternion;
};

export type MovementAvatarRestMappedWorldDirectionRestMapApplicationResult = {
  applied: boolean;
  finalLocalQuaternion: THREE.Quaternion | null;
  refreshedRestMap: boolean;
  restMap: MovementAvatarRetargetRestMap;
};

export type MovementAvatarRestMappedWorldDirectionLookupApplicationResult =
  MovementAvatarRestMappedWorldDirectionRestMapApplicationResult;

export function resolveMovementAvatarRestMappedQuaternionTarget({
  desiredWorldDirection,
  parentWorldQuaternion,
  restPose,
}: {
  desiredWorldDirection: THREE.Vector3;
  parentWorldQuaternion: THREE.Quaternion;
  restPose: MovementAvatarRetargetRestBone;
}): MovementAvatarRestMappedQuaternionTarget | null {
  if (desiredWorldDirection.lengthSq() < 0.000001) return null;

  const targetWorldOffset = new THREE.Quaternion().setFromUnitVectors(
    restPose.worldDirection,
    desiredWorldDirection.clone().normalize(),
  );
  const targetWorldQuaternion = targetWorldOffset.multiply(
    restPose.worldQuaternion.clone(),
  );
  const targetLocalQuaternion = parentWorldQuaternion
    .clone()
    .invert()
    .multiply(targetWorldQuaternion);

  return {
    targetLocalQuaternion,
    targetWorldQuaternion,
  };
}

export function applyMovementAvatarRestMappedWorldDirection({
  bone,
  desiredWorldDirection,
  restPose,
  slerp,
}: {
  bone: THREE.Object3D | null | undefined;
  desiredWorldDirection: THREE.Vector3;
  restPose: MovementAvatarRetargetRestBone | null | undefined;
  slerp: number;
}): MovementAvatarRestMappedWorldDirectionApplicationResult | null {
  if (!bone?.parent || !restPose) return null;

  const parentWorldQuaternion = new THREE.Quaternion();
  bone.parent.getWorldQuaternion(parentWorldQuaternion);
  const target = resolveMovementAvatarRestMappedQuaternionTarget({
    desiredWorldDirection,
    parentWorldQuaternion,
    restPose,
  });
  if (!target) return null;

  bone.quaternion.slerp(target.targetLocalQuaternion, slerp);
  bone.updateMatrixWorld(true);

  return {
    finalLocalQuaternion: bone.quaternion.clone(),
    target,
  };
}

export function applyMovementAvatarRestMappedWorldDirectionWithRestMap({
  bone,
  boneName,
  currentRestMap,
  desiredWorldDirection,
  refreshRestMap,
  rememberLastGood = false,
  slerp,
  storeLastGood,
}: {
  bone: THREE.Object3D | null | undefined;
  boneName: MovementAvatarRetargetBoneName;
  currentRestMap: MovementAvatarRetargetRestMap;
  desiredWorldDirection: THREE.Vector3;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  rememberLastGood?: boolean;
  slerp: number;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRestMappedWorldDirectionRestMapApplicationResult {
  let restMap = currentRestMap;
  let restPose = restMap[boneName];
  let refreshedRestMap = false;

  if (!restPose) {
    restMap = refreshRestMap();
    restPose = restMap[boneName];
    refreshedRestMap = true;
  }

  const application = applyMovementAvatarRestMappedWorldDirection({
    bone,
    desiredWorldDirection,
    restPose,
    slerp,
  });

  if (!application) {
    return {
      applied: false,
      finalLocalQuaternion: null,
      refreshedRestMap,
      restMap,
    };
  }

  if (rememberLastGood) {
    storeLastGood?.(boneName, application.finalLocalQuaternion);
  }

  return {
    applied: true,
    finalLocalQuaternion: application.finalLocalQuaternion,
    refreshedRestMap,
    restMap,
  };
}

export function applyMovementAvatarRestMappedWorldDirectionWithLookup({
  boneName,
  canApply = true,
  currentRestMap,
  desiredWorldDirection,
  lookupBone,
  refreshRestMap,
  rememberLastGood = false,
  slerp,
  storeLastGood,
}: {
  boneName: MovementAvatarRetargetBoneName;
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  desiredWorldDirection: THREE.Vector3;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  rememberLastGood?: boolean;
  slerp: number;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRestMappedWorldDirectionLookupApplicationResult {
  if (!canApply || desiredWorldDirection.lengthSq() < 0.000001) {
    return {
      applied: false,
      finalLocalQuaternion: null,
      refreshedRestMap: false,
      restMap: currentRestMap,
    };
  }

  return applyMovementAvatarRestMappedWorldDirectionWithRestMap({
    bone: lookupBone(boneName),
    boneName,
    currentRestMap,
    desiredWorldDirection,
    refreshRestMap,
    rememberLastGood,
    slerp,
    storeLastGood,
  });
}

export function resolveMovementAvatarBasisWorldDirection({
  basis,
  forward,
}: {
  basis: MovementAvatarBasisDirection;
  forward: THREE.Vector3;
}) {
  const down = new THREE.Vector3(0, -1, 0);
  const side = new THREE.Vector3(1, 0, 0);
  const direction = down
    .multiplyScalar(basis.down)
    .add(side.multiplyScalar(basis.side))
    .add(forward.clone().normalize().multiplyScalar(basis.forward));

  return direction.lengthSq() > 0.000001 ? direction.normalize() : null;
}

export type MovementAvatarPlantedSquatIkWorldDirectionSpec = {
  bone: MovementAvatarLowerBodyBoneName;
  desiredWorldDirection: THREE.Vector3;
  slerp: number;
};

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

export type MovementAvatarPlantedSquatIkApplicationResult = {
  applied: number;
  appliedDepth: number;
};

export type MovementAvatarRestMappedWorldDirectionBatchApplicationResult = {
  applied: number;
  restMap: MovementAvatarRetargetRestMap;
};

export type MovementAvatarRetargetSegmentMappingApplicationResult = {
  applied: boolean;
  restMap: MovementAvatarRetargetRestMap;
};

export function applyMovementAvatarPlantedSquatIkWorldDirectionSpecs({
  apply,
  ikDepth,
  specs,
}: {
  apply: (spec: MovementAvatarPlantedSquatIkWorldDirectionSpec) => boolean;
  ikDepth: number;
  specs: MovementAvatarPlantedSquatIkWorldDirectionSpec[];
}): MovementAvatarPlantedSquatIkApplicationResult {
  let applied = 0;

  specs.forEach((spec) => {
    if (apply(spec)) {
      applied += 1;
    }
  });

  return {
    applied,
    appliedDepth: applied > 0 ? ikDepth : 0,
  };
}

export function applyMovementAvatarPlantedSquatIkWorldDirectionSpecsToVrmBones({
  canApply = true,
  currentRestMap,
  ikDepth,
  lookupBone,
  refreshRestMap,
  specs,
  storeLastGood,
}: {
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  ikDepth: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  specs: MovementAvatarPlantedSquatIkWorldDirectionSpec[];
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarPlantedSquatIkApplicationResult & {
  restMap: MovementAvatarRetargetRestMap;
} {
  let restMap = currentRestMap;

  const application = applyMovementAvatarPlantedSquatIkWorldDirectionSpecs({
    apply: (spec) => {
      const result = applyMovementAvatarRestMappedWorldDirectionWithLookup({
        boneName: spec.bone,
        canApply,
        currentRestMap: restMap,
        desiredWorldDirection: spec.desiredWorldDirection,
        lookupBone,
        refreshRestMap,
        slerp: spec.slerp,
        storeLastGood,
      });
      restMap = result.restMap;
      return result.applied;
    },
    ikDepth,
    specs,
  });

  return {
    ...application,
    restMap,
  };
}

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

export function resolveMovementAvatarPlantedSquatIkWorldDirections({
  forward,
  plantedSquatIk,
}: {
  forward: THREE.Vector3;
  plantedSquatIk: MovementAvatarPlantedSquatIkPoseDecision;
}): MovementAvatarPlantedSquatIkWorldDirectionSpec[] {
  if (plantedSquatIk.ikDepth <= 0.001) return [];

  return plantedSquatIk.specs.flatMap((spec) => {
    const desiredWorldDirection = resolveMovementAvatarBasisWorldDirection({
      basis: spec.direction,
      forward,
    });
    if (!desiredWorldDirection) return [];

    return [{
      bone: spec.bone,
      desiredWorldDirection,
      slerp: spec.slerp,
    }];
  });
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
