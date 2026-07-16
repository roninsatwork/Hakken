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
import {
  movementAvatarFrameRateAdjustedAngleStep,
  movementAvatarFrameRateAdjustedSlerp,
} from "./movementAvatarFrameTiming";

// The motion-frame target is limited to 2.4 rad/s. A 3.84 rad/s final writer
// preserves the smooth 60 fps response while retaining enough headroom for a
// held-to-active ownership handoff to remain inside the 0.10 rendered-fidelity
// contract. The per-bone cap still bounds the visible reacquisition step.
const ACTIVE_SPINE_MAX_LOCAL_ANGLE_STEP = 0.064;

function applyMovementAvatarSpineNamedRotationToVrmBone({
  lookupBone,
  frameDeltaSeconds,
  maxLocalAngleStep,
  spec,
}: {
  frameDeltaSeconds?: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  maxLocalAngleStep?: number;
  spec: MovementAvatarSpineBoneRotationSpec;
}) {
  return applyVrmNamedRotationTargets({
    apply: (target) => {
      const bone = lookupBone(target.bone);
      if (!bone) return false;

      const previous = bone.quaternion.clone();
      bone.quaternion.slerp(target.targetQuaternion, target.slerp);
      const step = previous.angleTo(bone.quaternion);
      if (maxLocalAngleStep && step > maxLocalAngleStep) {
        const proposed = bone.quaternion.clone();
        bone.quaternion.copy(previous).slerp(proposed, maxLocalAngleStep / step);
      }
      return bone.quaternion.clone();
    },
    targets: [{
      bone: spec.bone,
      rotation: spec.rotation,
      slerp: movementAvatarFrameRateAdjustedSlerp(spec.slerp, frameDeltaSeconds),
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
  frameDeltaSeconds,
  lookupBone,
  shouldApplySolverTorso,
  sources,
  spineApplyOptions,
  storeLastGood,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  avatarRole: "instructor" | "player";
  frameDeltaSeconds?: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  shouldApplySolverTorso: boolean;
  sources: MovementAvatarSpineSolverSources;
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
  torsoTrackingReady: boolean;
}) {
  let applied = 0;

  if (
    activeSpineDrive.owner === "player-spine-held" ||
    activeSpineDrive.owner === "recorded-spine-held"
  ) {
    return { applied, mode: "held" as const };
  }

  if (activeSpineDrive.shouldApplySpine) {
    applyMovementAvatarActiveSpinePoseApplication({
      applyRotation: (spec) => {
        applied += applyMovementAvatarSpineNamedRotationToVrmBone({
          frameDeltaSeconds,
          lookupBone,
          maxLocalAngleStep: movementAvatarFrameRateAdjustedAngleStep(
            ACTIVE_SPINE_MAX_LOCAL_ANGLE_STEP,
            frameDeltaSeconds,
          ),
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
