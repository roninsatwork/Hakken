import * as THREE from "three";
import {
  resolveMovementAvatarLowerBodyNeutralPose,
  resolveMovementAvatarSingleLegRaisePose,
  resolveMovementAvatarSolvedLowerBodyPose,
  resolveMovementAvatarSquatFlexionPose,
} from "./movementAvatarPipeline";
import type {
  MovementAvatarLowerBodyRigRotationSources,
  MovementAvatarNamedBoneRotationSpec,
  MovementAvatarSupportPresentationRotationSpec,
} from "./movementAvatarLowerBodyRotationApplication";
import {
  applyVrmNamedRotationTargets,
  applyVrmRigRotationApplicationTarget,
  resolveVrmRigRotationApplicationTarget,
} from "./vrmRigging";

export function applyMovementAvatarSupportPresentationRotationSpecsToVrmBones({
  lookupBone,
  specs,
}: {
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  specs: MovementAvatarSupportPresentationRotationSpec[];
}) {
  return applyVrmNamedRotationTargets({
    apply: (target) => {
      const bone = lookupBone(target.bone);
      if (!bone) return false;

      bone.quaternion.slerp(target.targetQuaternion, target.slerp);
      return bone.quaternion.clone();
    },
    targets: specs.map((spec) => ({
      bone: spec.bone,
      rotation: spec.rotation,
      slerp: spec.slerp,
    })),
  });
}

export function applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
  lookupBone,
  specs,
}: {
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  specs: MovementAvatarNamedBoneRotationSpec[];
}) {
  return applyVrmNamedRotationTargets({
    apply: (target) => {
      const bone = lookupBone(target.bone);
      if (!bone) return false;

      bone.quaternion.slerp(target.targetQuaternion, target.slerp);
      return bone.quaternion.clone();
    },
    targets: specs.map((spec) => ({
      bone: spec.bone,
      rotation: spec.rotation,
      slerp: spec.slerp,
    })),
  });
}

export function applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones({
  lookupBone,
  slerp,
}: {
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  slerp: number;
}) {
  return applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
    lookupBone,
    specs: resolveMovementAvatarLowerBodyNeutralPose({ slerp }),
  });
}

export function applyMovementAvatarSquatFlexionPoseApplicationToVrmBones({
  bendBoost,
  depth,
  lookupBone,
  slerp,
}: {
  bendBoost?: number;
  depth: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  slerp: number;
}) {
  return applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
    lookupBone,
    specs: resolveMovementAvatarSquatFlexionPose({
      bendBoost,
      depth,
      slerp,
    }),
  });
}

export function applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
  depth,
  lowerLegBoost,
  lookupBone,
  side,
  slerp,
  upperLegBoost,
}: {
  depth: number;
  lowerLegBoost?: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  side: "left" | "right";
  slerp: number;
  upperLegBoost?: number;
}) {
  return applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
    lookupBone,
    specs: resolveMovementAvatarSingleLegRaisePose({
      depth,
      lowerLegBoost,
      side,
      slerp,
      upperLegBoost,
    }),
  });
}

export function applyMovementAvatarSolvedLowerBodyPoseApplicationToVrmBones({
  depth,
  lookupBone,
  slerp,
  sources,
  storeLastGood,
}: {
  depth: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  slerp: number;
  sources: MovementAvatarLowerBodyRigRotationSources;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
}) {
  let applied = 0;

  resolveMovementAvatarSolvedLowerBodyPose({
    depth,
    slerp,
  }).forEach((spec) => {
    const result = applyVrmRigRotationApplicationTarget({
      apply: (target) => {
        const bone = lookupBone(target.bone);
        if (!bone) return false;

        bone.quaternion.slerp(target.targetQuaternion, target.slerp);
        return bone.quaternion.clone();
      },
      storeLastGood,
      target: resolveVrmRigRotationApplicationTarget({
        bone: spec.bone,
        limits: spec.limits,
        remember: spec.remember,
        rotation: sources[spec.source] ?? undefined,
        scale: spec.scale,
        slerp: spec.slerp,
      }),
    });

    if (result.applied) applied += 1;
  });

  return {
    applied,
  };
}
