import * as THREE from "three";
import { applyMovementAvatarAimVectorToObjects } from "./movementAvatarAimApplication";
import {
  resolveMovementAvatarArmAimOptions,
  type MovementAvatarAimOptionsDecision,
  type MovementAvatarArmDecision,
} from "./movementAvatarPipeline";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";
import {
  applyVrmArmLastGoodPoseToBones,
  applyVrmArmRelaxedPoseToBones,
  applyVrmHandNeutralPoseToBones,
  type VrmSolverLandmark,
} from "./vrmRigging";

export type MovementAvatarArmApplicationMode =
  | "retarget-skipped"
  | "tracked-aim"
  | "hold-last-good"
  | "relax";

export type MovementAvatarArmAimRequest = {
  child: "leftLowerArm" | "rightLowerArm" | "leftHand" | "rightHand";
  options: MovementAvatarAimOptionsDecision;
  source: VrmSolverLandmark | undefined;
  target: VrmSolverLandmark | undefined;
  bone: "leftUpperArm" | "rightUpperArm" | "leftLowerArm" | "rightLowerArm";
};

export type MovementAvatarArmApplicationResult = {
  appliedAimRequests: number;
  handled: boolean;
  mode: MovementAvatarArmApplicationMode;
};

export type MovementAvatarArmAimRequestApplicationResult = {
  applied: boolean;
};

function armBones(side: "left" | "right") {
  return {
    elbowIndex: side === "left" ? 13 : 14,
    hand: `${side}Hand` as "leftHand" | "rightHand",
    lowerArm: `${side}LowerArm` as "leftLowerArm" | "rightLowerArm",
    shoulderIndex: side === "left" ? 11 : 12,
    upperArm: `${side}UpperArm` as "leftUpperArm" | "rightUpperArm",
  };
}

export function applyMovementAvatarArmApplication({
  applyAim,
  applyHandNeutral,
  armDecision,
  avatarRole,
  elbowTarget,
  frontBias,
  holdLastGood,
  playerArmLandmarks,
  profile,
  relax,
  safeZScale,
  shouldUseRetargetedUpperBody,
  side,
  wristTarget,
}: {
  applyAim: (request: MovementAvatarArmAimRequest) => void;
  applyHandNeutral: (side: "left" | "right") => void;
  armDecision: MovementAvatarArmDecision;
  avatarRole: "instructor" | "player";
  elbowTarget: VrmSolverLandmark | undefined;
  frontBias: number;
  holdLastGood: (side: "left" | "right") => void;
  playerArmLandmarks: VrmSolverLandmark[];
  profile?: MovementAvatarTrackingProfile;
  relax: (side: "left" | "right") => void;
  safeZScale?: number;
  shouldUseRetargetedUpperBody: boolean;
  side: "left" | "right";
  wristTarget: VrmSolverLandmark | undefined;
}): MovementAvatarArmApplicationResult {
  if (shouldUseRetargetedUpperBody) {
    return {
      appliedAimRequests: 0,
      handled: false,
      mode: "retarget-skipped",
    };
  }

  if (!armDecision.isTrackingReady) {
    if (armDecision.unreadyFallback === "hold-last-good") {
      holdLastGood(side);
      return {
        appliedAimRequests: 0,
        handled: true,
        mode: "hold-last-good",
      };
    }

    relax(side);
    return {
      appliedAimRequests: 0,
      handled: true,
      mode: "relax",
    };
  }

  const bones = armBones(side);
  const armAimOptions = resolveMovementAvatarArmAimOptions({
    avatarRole,
    frontBias,
    profile,
    safeZScale,
  });

  applyAim({
    bone: bones.upperArm,
    child: bones.lowerArm,
    options: armAimOptions.upperArm,
    source: playerArmLandmarks[bones.shoulderIndex],
    target: elbowTarget,
  });
  applyAim({
    bone: bones.lowerArm,
    child: bones.hand,
    options: armAimOptions.lowerArm,
    source: elbowTarget,
    target: wristTarget,
  });
  applyHandNeutral(side);

  return {
    appliedAimRequests: 2,
    handled: true,
    mode: "tracked-aim",
  };
}

export function applyMovementAvatarArmAimRequestToVrmBones({
  fallbackZScale,
  getLastGoodQuaternion,
  lookupBone,
  request,
  storeLastGoodQuaternion,
}: {
  fallbackZScale: number;
  getLastGoodQuaternion?: (boneName: string) => THREE.Quaternion | null | undefined;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  request: MovementAvatarArmAimRequest;
  storeLastGoodQuaternion?: (boneName: string, quaternion: THREE.Quaternion) => void;
}): MovementAvatarArmAimRequestApplicationResult {
  const fallbackEuler = request.bone === "rightUpperArm"
    ? new THREE.Euler(0, 0, -1.2)
    : request.bone === "leftUpperArm"
      ? new THREE.Euler(0, 0, 1.2)
      : null;
  const result = applyMovementAvatarAimVectorToObjects({
    boneName: request.bone,
    childName: request.child,
    fallbackEuler,
    frontBias: request.options.frontBias,
    getLastGoodQuaternion,
    lookupBone,
    minVectorLengthSq: request.options.minVectorLengthSq,
    slerp: request.options.slerpOverride,
    start: request.source,
    storeLastGoodQuaternion,
    storeVisibilityThreshold: request.options.storeVisibilityThreshold,
    target: request.target,
    visibilityThreshold: request.options.visibilityThreshold,
    zScale: request.options.zScale ?? fallbackZScale,
  });

  return {
    applied: result.applied,
  };
}

export function applyMovementAvatarArmApplicationToVrmBones({
  armDecision,
  armRelaxedSlerp,
  avatarRole,
  elbowTarget,
  fallbackZScale,
  frontBias,
  handNeutralSlerp,
  lastGood,
  lookupBone,
  playerArmLandmarks,
  profile,
  safeZScale,
  shouldUseRetargetedUpperBody,
  side,
  wristTarget,
}: {
  armDecision: MovementAvatarArmDecision;
  armRelaxedSlerp: number;
  avatarRole: "instructor" | "player";
  elbowTarget: VrmSolverLandmark | undefined;
  fallbackZScale: number;
  frontBias: number;
  handNeutralSlerp: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  playerArmLandmarks: VrmSolverLandmark[];
  profile?: MovementAvatarTrackingProfile;
  safeZScale?: number;
  shouldUseRetargetedUpperBody: boolean;
  side: "left" | "right";
  wristTarget: VrmSolverLandmark | undefined;
}): MovementAvatarArmApplicationResult {
  return applyMovementAvatarArmApplication({
    applyAim: (request) => {
      applyMovementAvatarArmAimRequestToVrmBones({
        fallbackZScale,
        getLastGoodQuaternion: (bone) => lastGood[bone] ?? null,
        lookupBone,
        request,
        storeLastGoodQuaternion: (bone, quaternion) => {
          lastGood[bone] = quaternion;
        },
      });
    },
    applyHandNeutral: (targetSide) => {
      applyVrmHandNeutralPoseToBones({
        lookupBone,
        side: targetSide,
        slerp: handNeutralSlerp,
      });
    },
    armDecision,
    avatarRole,
    elbowTarget,
    frontBias,
    holdLastGood: (targetSide) => {
      applyVrmArmLastGoodPoseToBones({
        lastGood,
        lookupBone,
        side: targetSide,
      });
    },
    playerArmLandmarks,
    profile,
    relax: (targetSide) => {
      applyVrmArmRelaxedPoseToBones({
        lookupBone,
        side: targetSide,
        slerp: armRelaxedSlerp,
      });
    },
    safeZScale,
    shouldUseRetargetedUpperBody,
    side,
    wristTarget,
  });
}
