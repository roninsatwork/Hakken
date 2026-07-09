import type * as THREE from "three";
import type { MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  type MovementAvatarSupportPresentationRotationSpec,
} from "./movementAvatarLowerBodyApplication";
import { applyMovementAvatarSupportPresentationRotationSpecsToVrmBones } from "./movementAvatarLowerBodyRotationVrmAdapters";

type MovementAvatarSupportPresentationRuntimeInput = Pick<
  MovementAvatarSupportPresentationDecision,
  "armSpecs" | "owner" | "shouldApply" | "specs" | "spineSpecs"
>;

export type MovementAvatarSupportPresentationRuntimeApplicationResult = {
  applied: number;
  owner: string | null;
};

export function resolveMovementAvatarSupportPresentationRuntimeSpecs(
  supportPresentation: MovementAvatarSupportPresentationRuntimeInput,
): MovementAvatarSupportPresentationRotationSpec[] {
  if (!supportPresentation.shouldApply) return [];

  return [
    ...supportPresentation.specs,
    ...supportPresentation.spineSpecs,
    ...supportPresentation.armSpecs,
  ];
}

export function applyMovementAvatarSupportPresentationRuntimeToVrmBones({
  lookupBone,
  supportPresentation,
}: {
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  supportPresentation: MovementAvatarSupportPresentationRuntimeInput;
}): MovementAvatarSupportPresentationRuntimeApplicationResult {
  if (!supportPresentation.shouldApply) {
    return {
      applied: 0,
      owner: null,
    };
  }

  const result = applyMovementAvatarSupportPresentationRotationSpecsToVrmBones({
    lookupBone,
    specs: resolveMovementAvatarSupportPresentationRuntimeSpecs(supportPresentation),
  });

  return {
    applied: result.applied,
    owner: result.applied > 0 ? supportPresentation.owner : null,
  };
}
