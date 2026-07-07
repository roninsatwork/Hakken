import * as THREE from "three";
import type {
  MovementAvatarBasisDirection,
  MovementAvatarLowerBodyBoneName,
  MovementAvatarPlantedSquatIkPoseDecision,
} from "./movementAvatarPipeline";
import type {
  MovementAvatarRetargetBoneName,
  MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import { applyMovementAvatarRestMappedWorldDirectionWithLookup } from "./movementAvatarRestMappedSegmentApplication";

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

export type MovementAvatarPlantedSquatIkApplicationResult = {
  applied: number;
  appliedDepth: number;
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
