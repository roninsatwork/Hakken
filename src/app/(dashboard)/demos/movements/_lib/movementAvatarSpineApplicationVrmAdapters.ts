import * as THREE from "three";
import type {
  MovementAvatarSpineApplyOptionsDecision,
  MovementAvatarSpineBoneRotationSpec,
} from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import {
  applyMovementAvatarActiveSpinePoseApplication,
  applyMovementAvatarSpineNeutralPoseApplication,
  applyMovementAvatarSpineSolverPoseApplication,
  type MovementAvatarSpineSolverRotationRequest,
  type MovementAvatarSpineSolverSources,
} from "./movementAvatarSpineApplicationSpecs";
import {
  applyVrmNamedRotationTargets,
  applyVrmRigRotationApplicationTarget,
  resolveVrmRigRotationApplicationTarget,
} from "./vrmRigging";

function applyMovementAvatarSpineNamedRotationToVrmBone({
  lookupBone,
  spec,
}: {
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  spec: MovementAvatarSpineBoneRotationSpec;
}) {
  return applyVrmNamedRotationTargets({
    apply: (target) => {
      const bone = lookupBone(target.bone);
      if (!bone) return false;

      bone.quaternion.slerp(target.targetQuaternion, target.slerp);
      return bone.quaternion.clone();
    },
    targets: [{
      bone: spec.bone,
      rotation: spec.rotation,
      slerp: spec.slerp,
    }],
  });
}

function applyMovementAvatarSpineSolverRotationToVrmBone({
  lookupBone,
  request,
  storeLastGood,
}: {
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  request: MovementAvatarSpineSolverRotationRequest;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
}) {
  return applyVrmRigRotationApplicationTarget({
    apply: (target) => {
      const bone = lookupBone(target.bone);
      if (!bone) return false;

      bone.quaternion.slerp(target.targetQuaternion, target.slerp);
      return bone.quaternion.clone();
    },
    storeLastGood,
    target: resolveVrmRigRotationApplicationTarget({
      bone: request.bone,
      limits: request.limits,
      rotation: request.rotation,
      scale: request.scale,
      slerp: request.slerp,
    }),
  });
}

export function applyMovementAvatarSpinePoseApplicationToVrmBones({
  activeSpineDrive,
  avatarRole,
  lookupBone,
  shouldApplySolverTorso,
  sources,
  spineApplyOptions,
  storeLastGood,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  avatarRole: "instructor" | "player";
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  shouldApplySolverTorso: boolean;
  sources: MovementAvatarSpineSolverSources;
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
  torsoTrackingReady: boolean;
}) {
  let applied = 0;

  if (activeSpineDrive.shouldApplySpine) {
    applyMovementAvatarActiveSpinePoseApplication({
      applyRotation: (spec) => {
        applied += applyMovementAvatarSpineNamedRotationToVrmBone({
          lookupBone,
          spec,
        }).applied;
      },
      spineApplyOptions,
      spineDrive: activeSpineDrive,
    });

    return {
      applied,
      mode: "active" as const,
    };
  }

  if (torsoTrackingReady && shouldApplySolverTorso) {
    applyMovementAvatarSpineSolverPoseApplication({
      applyRotation: (request) => {
        if (applyMovementAvatarSpineSolverRotationToVrmBone({
          lookupBone,
          request,
          storeLastGood,
        }).applied) {
          applied += 1;
        }
      },
      avatarRole,
      sources,
      spineApplyOptions,
    });

    return {
      applied,
      mode: "solver" as const,
    };
  }

  applyMovementAvatarSpineNeutralPoseApplication({
    applyRotation: (spec) => {
      applied += applyMovementAvatarSpineNamedRotationToVrmBone({
        lookupBone,
        spec,
      }).applied;
    },
  });

  return {
    applied,
    mode: "neutral" as const,
  };
}
