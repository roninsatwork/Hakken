import type * as THREE from "three";
import {
  applyVrmBlendshapeExpressionTargetsToManager,
  applyVrmHandsRotationTargetsToBones,
  type VrmBlendshapeCategory,
  type VrmExpressionTargetWriter,
  type VrmHandsPayload,
} from "./vrmRigging";

export type MovementAvatarEndFrameRuntimeResult = {
  appliedExpressions: number;
  appliedHandRotations: number;
};

export function applyMovementAvatarEndFrameRuntime({
  blendshapes,
  expressionManager,
  hands,
  isPlayer,
  lookupBone,
  mirrorForDisplay,
}: {
  blendshapes?: VrmBlendshapeCategory[] | null;
  expressionManager: VrmExpressionTargetWriter | null | undefined;
  hands?: VrmHandsPayload | null;
  isPlayer: boolean;
  lookupBone: (vrmName: string) => THREE.Object3D | null | undefined;
  mirrorForDisplay: boolean;
}): MovementAvatarEndFrameRuntimeResult {
  const expressionApplication = applyVrmBlendshapeExpressionTargetsToManager({
    blendshapes,
    expressionManager,
  });
  const handApplication = applyVrmHandsRotationTargetsToBones({
    hands,
    isPlayer,
    lookupBone,
    mirrorForDisplay,
  });

  return {
    appliedExpressions: expressionApplication.applied,
    appliedHandRotations: handApplication.applied,
  };
}
