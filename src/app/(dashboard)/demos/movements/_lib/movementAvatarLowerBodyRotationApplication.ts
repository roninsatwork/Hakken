import type {
  MovementAvatarBoneRotationSpec,
  MovementAvatarLowerBodyRigSourceBoneName,
  MovementAvatarRigRotationSpec,
  MovementAvatarSpineBoneRotationSpec,
  MovementAvatarSupportPresentationArmRotationSpec,
} from "./movementAvatarPipeline";
import {
  resolveMovementAvatarLowerBodyNeutralPose,
  resolveMovementAvatarSingleLegRaisePose,
  resolveMovementAvatarSolvedLowerBodyPose,
  resolveMovementAvatarSquatFlexionPose,
} from "./movementAvatarPipeline";
import type { VrmRigRotation } from "./vrmRigging";

export type MovementAvatarSupportPresentationRotationSpec =
  | MovementAvatarBoneRotationSpec
  | MovementAvatarSpineBoneRotationSpec
  | MovementAvatarSupportPresentationArmRotationSpec;

export type MovementAvatarLowerBodyRigRotationSources = Partial<
  Record<MovementAvatarLowerBodyRigSourceBoneName, VrmRigRotation | null | undefined>
>;

export type MovementAvatarNamedBoneRotationSpec = {
  bone: string;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  slerp: number;
};

export function applyMovementAvatarLowerBodyRotationSpecs({
  apply,
  specs,
}: {
  apply: (spec: MovementAvatarBoneRotationSpec) => void;
  specs: MovementAvatarBoneRotationSpec[];
}) {
  specs.forEach((spec) => {
    apply(spec);
  });

  return {
    applied: specs.length,
  };
}

export function applyMovementAvatarSolvedLowerBodyRotationSpecs({
  apply,
  specs,
}: {
  apply: (spec: MovementAvatarRigRotationSpec) => void;
  specs: MovementAvatarRigRotationSpec[];
}) {
  specs.forEach((spec) => {
    apply(spec);
  });

  return {
    applied: specs.length,
  };
}

export function applyMovementAvatarSupportPresentationRotationSpecs({
  apply,
  specs,
}: {
  apply: (spec: MovementAvatarSupportPresentationRotationSpec) => void;
  specs: MovementAvatarSupportPresentationRotationSpec[];
}) {
  specs.forEach((spec) => {
    apply(spec);
  });

  return {
    applied: specs.length,
  };
}

export function applyMovementAvatarLowerBodyNeutralPoseApplication({
  applyRotation,
  slerp,
}: {
  applyRotation: (spec: MovementAvatarBoneRotationSpec) => void;
  slerp: number;
}) {
  return applyMovementAvatarLowerBodyRotationSpecs({
    apply: applyRotation,
    specs: resolveMovementAvatarLowerBodyNeutralPose({ slerp }),
  });
}

export function applyMovementAvatarSquatFlexionPoseApplication({
  applyRotation,
  bendBoost,
  depth,
  slerp,
}: {
  applyRotation: (spec: MovementAvatarBoneRotationSpec) => void;
  bendBoost?: number;
  depth: number;
  slerp: number;
}) {
  return applyMovementAvatarLowerBodyRotationSpecs({
    apply: applyRotation,
    specs: resolveMovementAvatarSquatFlexionPose({
      bendBoost,
      depth,
      slerp,
    }),
  });
}

export function applyMovementAvatarSingleLegRaisePoseApplication({
  applyRotation,
  depth,
  side,
  slerp,
}: {
  applyRotation: (spec: MovementAvatarBoneRotationSpec) => void;
  depth: number;
  side: "left" | "right";
  slerp: number;
}) {
  return applyMovementAvatarLowerBodyRotationSpecs({
    apply: applyRotation,
    specs: resolveMovementAvatarSingleLegRaisePose({
      depth,
      side,
      slerp,
    }),
  });
}

export function applyMovementAvatarSolvedLowerBodyPoseApplication({
  applyRotation,
  depth,
  slerp,
}: {
  applyRotation: (spec: MovementAvatarRigRotationSpec) => void;
  depth: number;
  slerp: number;
}) {
  return applyMovementAvatarSolvedLowerBodyRotationSpecs({
    apply: applyRotation,
    specs: resolveMovementAvatarSolvedLowerBodyPose({
      depth,
      slerp,
    }),
  });
}
