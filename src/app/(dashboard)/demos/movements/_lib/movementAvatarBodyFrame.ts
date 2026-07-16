import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { applyMovementAvatarArmApplicationToVrmBones, type MovementAvatarArmApplicationResult } from "./movementAvatarArmApplication";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import {
  applyMovementAvatarInstructorFootPlantRequestsToVrmBones,
  applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones,
  applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones,
  applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones,
  applyMovementAvatarLowerBodyRetargetSegmentCounts,
  type MovementAvatarLowerBodyRetargetSegmentCounts,
  resolveMovementAvatarLowerBodyApplicationPlan,
  resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput,
} from "./movementAvatarLowerBodyApplication";
import { type MovementAvatarLowerBodyTargetSelectionCompositionDecision, resolveMovementAvatarLowerBodyTargetSelectionComposition } from "./movementAvatarLowerBodyTargetSelection";
import {
  type MovementAvatarArmDecision,
  type MovementAvatarBoneEaseOptionsDecision,
  type MovementAvatarSpineApplyOptionsDecision,
  resolveMovementAvatarInactiveLowerBodyDecision,
  resolveMovementAvatarPlantedSquatIkPose,
  resolveMovementAvatarRetargetSegmentApplication,
  resolveMovementAvatarSpineApplyOptions,
} from "./movementAvatarPipeline";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import {
  buildMovementAvatarRetargetRestMap,
  MOVEMENT_AVATAR_LEFT_ARM_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS,
  MOVEMENT_AVATAR_RIGHT_ARM_RETARGET_MAPPINGS,
  type MovementAvatarRetargetBoneMapping,
  type MovementAvatarRetargetBoneName,
  type MovementAvatarRetargetRestMap,
} from "./movementAvatarRestPose";
import {
  applyMovementAvatarPlantedSquatIkWorldDirectionSpecsToVrmBones,
  applyMovementAvatarRetargetSegmentMappings,
  applyMovementAvatarRetargetSegmentMappingToVrmBones,
  type MovementAvatarPlantedSquatIkApplicationResult,
  type MovementAvatarRetargetSegmentApplicationCounts,
  resolveMovementAvatarPlantedSquatIkWorldDirections,
} from "./movementAvatarSegmentApplication";
import { applyMovementAvatarSpinePoseApplicationToVrmBones } from "./movementAvatarSpineApplication";
import type { MovementAvatarLowerBodyTargetDecision } from "./movementAvatarTarget";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementAvatarTrackingProfile } from "./movementTrackingCalibration";
import type { VrmSolverLandmark } from "./vrmRigging";

type MovementAvatarMutableRef<T> = {
  current: T;
};

// --- movementAvatarRetargetSegmentRuntime ---

export type MovementAvatarRetargetSegmentRuntimeApplication = MovementAvatarRetargetSegmentApplicationCounts & {
  restMap: MovementAvatarRetargetRestMap;
};

export function applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
  avatarRole,
  canApply = true,
  currentRestMap,
  frameDeltaSeconds,
  instructorSquatPresentationDepth,
  lookupBone,
  lowerBodySegmentMotion,
  mappings,
  profile,
  refreshRestMap,
  retargetFrame,
  storeLastGood,
}: {
  avatarRole: "instructor" | "player";
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  frameDeltaSeconds?: number;
  instructorSquatPresentationDepth: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodySegmentMotion: number;
  mappings: MovementAvatarRetargetBoneMapping[];
  profile?: MovementAvatarTrackingProfile;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  retargetFrame: MovementRetargetFrame;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarRetargetSegmentRuntimeApplication {
  let restMap = currentRestMap;
  const counts = applyMovementAvatarRetargetSegmentMappings({
    apply: (mapping) => {
      const segmentApplicationDecision = resolveMovementAvatarRetargetSegmentApplication({
        avatarRole,
        instructorSquatPresentationDepth,
        lowerBodySegmentMotion,
        profile,
        retargetFrame,
        segmentName: mapping.segment,
        segmentType: mapping.type,
            });
      const application = applyMovementAvatarRetargetSegmentMappingToVrmBones({
        avatarRole,
        canApply,
        currentRestMap: restMap,
        frameDeltaSeconds,
        lookupBone,
        mapping,
        refreshRestMap,
        retargetFrame,
        segmentApplicationDecision,
        storeLastGood,
      });
      restMap = application.restMap;

      return application.applied;
    },
    mappings,
  });

  return {
    ...counts,
    restMap,
  };
}

export function applyMovementAvatarRetargetSegmentRuntimeFrame({
  avatarRole,
  currentRestMap,
  frameDeltaSeconds,
  instructorSquatPresentationDepth,
  lastGood,
  lookupBone,
  lowerBodySegmentMotion,
  mappings,
  profile,
  retargetFrame,
  vrm,
}: {
  avatarRole: "instructor" | "player";
  currentRestMap: MovementAvatarRetargetRestMap;
  frameDeltaSeconds?: number;
  instructorSquatPresentationDepth: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodySegmentMotion: number;
  mappings: MovementAvatarRetargetBoneMapping[];
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  vrm: VRM | null | undefined;
}): MovementAvatarRetargetSegmentRuntimeApplication {
  return applyMovementAvatarRetargetSegmentRuntimeMappingsToVrmBones({
    avatarRole,
    canApply: Boolean(vrm),
    currentRestMap,
    frameDeltaSeconds,
    instructorSquatPresentationDepth,
    lookupBone,
    lowerBodySegmentMotion,
    mappings,
    profile,
    refreshRestMap: () => vrm ? buildMovementAvatarRetargetRestMap(vrm) : currentRestMap,
    retargetFrame,
    storeLastGood: (lastGoodBoneName, quaternion) => {
      lastGood[lastGoodBoneName] = quaternion;
    },
  });
}

// --- movementAvatarPlantedSquatIkRuntime ---

export type MovementAvatarPlantedSquatIkRuntimeApplication =
  MovementAvatarPlantedSquatIkApplicationResult & {
    restMap: MovementAvatarRetargetRestMap;
  };

export function applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
  avatarRole,
  canApply = true,
  currentRestMap,
  depth,
  forward,
  lookupBone,
  refreshRestMap,
  storeLastGood,
}: {
  avatarRole: "instructor" | "player";
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  depth: number;
  forward: THREE.Vector3;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarPlantedSquatIkRuntimeApplication {
  const plantedSquatIk = resolveMovementAvatarPlantedSquatIkPose({
    avatarRole,
    depth,
  });
  if (plantedSquatIk.ikDepth <= 0.001) {
    return {
      applied: 0,
      appliedDepth: 0,
      restMap: currentRestMap,
    };
  }

  return applyMovementAvatarPlantedSquatIkWorldDirectionSpecsToVrmBones({
    canApply,
    currentRestMap,
    ikDepth: plantedSquatIk.ikDepth,
    lookupBone,
    refreshRestMap,
    specs: resolveMovementAvatarPlantedSquatIkWorldDirections({
      forward,
      plantedSquatIk,
    }),
    storeLastGood,
  });
}

export function applyMovementAvatarPlantedSquatIkRuntimeFrame({
  avatarRole,
  avatarRoot,
  canApply = true,
  currentRestMap,
  depth,
  lookupBone,
  refreshRestMap,
  storeLastGood,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  canApply?: boolean;
  currentRestMap: MovementAvatarRetargetRestMap;
  depth: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  refreshRestMap: () => MovementAvatarRetargetRestMap;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
}): MovementAvatarPlantedSquatIkRuntimeApplication {
  const forward = new THREE.Vector3(0, 0, 1);
  if (avatarRoot) {
    avatarRoot.getWorldDirection(forward).normalize();
  }

  return applyMovementAvatarPlantedSquatIkRuntimeToVrmBones({
    avatarRole,
    canApply,
    currentRestMap,
    depth,
    forward,
    lookupBone,
    refreshRestMap,
    storeLastGood,
  });
}

export function applyMovementAvatarPlantedSquatIkRuntimeVrmFrame({
  avatarRole,
  avatarRoot,
  currentRestMap,
  depth,
  lookupBone,
  storeLastGood,
  vrm,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  currentRestMap: MovementAvatarRetargetRestMap;
  depth: number;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  storeLastGood?: (boneName: MovementAvatarRetargetBoneName, quaternion: THREE.Quaternion) => void;
  vrm: VRM | null | undefined;
}): MovementAvatarPlantedSquatIkRuntimeApplication {
  return applyMovementAvatarPlantedSquatIkRuntimeFrame({
    avatarRole,
    avatarRoot,
    canApply: Boolean(vrm),
    currentRestMap,
    depth,
    lookupBone,
    refreshRestMap: () => vrm ? buildMovementAvatarRetargetRestMap(vrm) : currentRestMap,
    storeLastGood,
  });
}

// --- movementAvatarRetargetFrameRuntime ---

export type MovementAvatarRetargetFrameRuntimeAdapters = {
  applyPlantedSquatIk: (depth: number) => number;
  applyRetargetMappings: (mappings: MovementAvatarRetargetBoneMapping[]) => MovementAvatarRetargetSegmentRuntimeApplication;
  getRestMap: () => MovementAvatarRetargetRestMap;
};

export function createMovementAvatarRetargetFrameRuntimeAdapters({
  avatarRole,
  avatarRoot,
  currentRestMap,
  frameDeltaSeconds,
  instructorSquatPresentationDepth,
  lastGood,
  lookupBone,
  lowerBodySegmentMotion,
  profile,
  retargetFrame,
  vrm,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  currentRestMap: MovementAvatarRetargetRestMap;
  frameDeltaSeconds?: number;
  instructorSquatPresentationDepth: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodySegmentMotion: number;
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  vrm: VRM | null | undefined;
}): MovementAvatarRetargetFrameRuntimeAdapters {
  let restMap = currentRestMap;

  return {
    applyPlantedSquatIk: (depth) => {
      const application = applyMovementAvatarPlantedSquatIkRuntimeVrmFrame({
        avatarRoot,
        avatarRole,
        currentRestMap: restMap,
        depth,
        lookupBone,
        vrm,
      });
      restMap = application.restMap;

      return application.appliedDepth;
    },
    applyRetargetMappings: (mappings) => {
      const application = applyMovementAvatarRetargetSegmentRuntimeFrame({
        avatarRole,
        currentRestMap: restMap,
        frameDeltaSeconds,
        instructorSquatPresentationDepth,
        lastGood,
        lookupBone,
        lowerBodySegmentMotion,
        mappings,
        profile,
        retargetFrame,
        vrm,
      });
      restMap = application.restMap;

      return application;
    },
    getRestMap: () => restMap,
  };
}

// --- movementAvatarFrameTargetRuntime ---

export type MovementAvatarFrameTargetRuntimeDecision = {
  lowerBodyTargetComposition: MovementAvatarLowerBodyTargetSelectionCompositionDecision;
};

export function resolveMovementAvatarFrameTargetRuntime({
  avatarRole,
  targetSolverLandmarks,
}: {
  avatarRole: "instructor" | "player";
  targetSolverLandmarks: VrmSolverLandmark[];
}): MovementAvatarFrameTargetRuntimeDecision {
  return {
    lowerBodyTargetComposition: resolveMovementAvatarLowerBodyTargetSelectionComposition({
      avatarRole,
      targetSolverLandmarks,
    }),
  };
}

// --- movementAvatarFrameTargetRetargetOrchestrationRuntime ---

export type MovementAvatarFrameTargetRetargetOrchestrationRuntime = {
  frameTargetRuntime: MovementAvatarFrameTargetRuntimeDecision;
  retargetFrameRuntimeAdapters: MovementAvatarRetargetFrameRuntimeAdapters;
};

export function resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime({
  avatarRole,
  avatarRoot,
  currentRestMap,
  frameDeltaSeconds,
  instructorSquatPresentationDepth,
  lastGood,
  lookupBone,
  lowerBodySegmentMotion,
  profile,
  retargetFrame,
  targetSolverLandmarks,
  vrm,
}: {
  avatarRole: "instructor" | "player";
  avatarRoot: THREE.Object3D | null | undefined;
  currentRestMap: MovementAvatarRetargetRestMap;
  frameDeltaSeconds?: number;
  instructorSquatPresentationDepth: number;
  lastGood: Record<string, THREE.Quaternion>;
  lookupBone: (boneName: MovementAvatarRetargetBoneName) => THREE.Object3D | null | undefined;
  lowerBodySegmentMotion: number;
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  targetSolverLandmarks: VrmSolverLandmark[];
  vrm: VRM | null | undefined;
}): MovementAvatarFrameTargetRetargetOrchestrationRuntime {
  const frameTargetRuntime = resolveMovementAvatarFrameTargetRuntime({
    avatarRole,
    targetSolverLandmarks,
  });

  return {
    frameTargetRuntime,
    retargetFrameRuntimeAdapters: createMovementAvatarRetargetFrameRuntimeAdapters({
      avatarRole,
      avatarRoot,
      currentRestMap,
      frameDeltaSeconds,
      instructorSquatPresentationDepth,
      lastGood,
      lookupBone,
      lowerBodySegmentMotion,
      profile,
      retargetFrame,
      vrm,
    }),
  };
}

// --- movementAvatarUpperBodyRuntime ---

export type MovementAvatarUpperBodyRuntimeApplication = {
  leftArm: MovementAvatarArmApplicationResult;
  recordedSpineRetargetCount: number;
  rightArm: MovementAvatarArmApplicationResult;
  spine: ReturnType<typeof applyMovementAvatarSpinePoseApplicationToVrmBones>;
};

export function applyMovementAvatarUpperBodyRuntimeToVrmBones({
  activeSpineDrive,
  armRelaxedSlerp,
  avatarRole,
  frameDeltaSeconds,
  lastGood,
  leftArmDecision,
  leftArmRetargetApplied,
  lookupBone,
  rightArmDecision,
  rightArmRetargetApplied,
  shouldApplySolverTorso,
  spineApplyOptions,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  armRelaxedSlerp: number;
  avatarRole: "instructor" | "player";
  frameDeltaSeconds?: number;
  lastGood: Record<string, THREE.Quaternion>;
  leftArmDecision: MovementAvatarArmDecision;
  leftArmRetargetApplied: boolean;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  rightArmDecision: MovementAvatarArmDecision;
  rightArmRetargetApplied: boolean;
  shouldApplySolverTorso: boolean;
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  torsoTrackingReady: boolean;
}): MovementAvatarUpperBodyRuntimeApplication {
  const spine = applyMovementAvatarSpinePoseApplicationToVrmBones({
    activeSpineDrive,
    avatarRole,
    frameDeltaSeconds,
    lookupBone,
    shouldApplySolverTorso,
    // The Kalidokit solver torso is retired: with no solver sources the solver
    // branch holds the torso and the spine segment retarget refines it after.
    sources: {},
    spineApplyOptions,
    storeLastGood: (bone, quaternion) => {
      lastGood[bone] = quaternion;
    },
    torsoTrackingReady,
  });

  const rightArm = applyMovementAvatarArmApplicationToVrmBones({
    armDecision: rightArmDecision,
    armRelaxedSlerp,
    lastGood,
    lookupBone,
    retargetApplied: rightArmRetargetApplied,
    side: "right",
  });

  const leftArm = applyMovementAvatarArmApplicationToVrmBones({
    armDecision: leftArmDecision,
    armRelaxedSlerp,
    lastGood,
    lookupBone,
    retargetApplied: leftArmRetargetApplied,
    side: "left",
  });

  return {
    leftArm,
    recordedSpineRetargetCount: spineApplyOptions.shouldCountRecordedSpineRetarget ? 1 : 0,
    rightArm,
    spine,
  };
}

// --- movementAvatarUpperBodyFrameRuntime ---

export type MovementAvatarUpperBodyFrameRuntimeResult = {
  retargetAppliedUpperBody: number;
  upperBodyRuntimeApplication: MovementAvatarUpperBodyRuntimeApplication;
};

export function applyMovementAvatarUpperBodyFrameRuntime({
  activeSpineDrive,
  applyRetargetMappings,
  avatarRole,
  boneEaseOptions,
  frameDeltaSeconds,
  lastGood,
  leftArmDecision,
  lookupBone,
  rightArmDecision,
  shouldApplySolverTorso,
  torsoTrackingReady,
}: {
  activeSpineDrive: MovementAvatarPlayerSpineDrive;
  applyRetargetMappings: (mappings: MovementAvatarRetargetBoneMapping[]) => { applied: number };
  avatarRole: "instructor" | "player";
  boneEaseOptions: Pick<MovementAvatarBoneEaseOptionsDecision, "armRelaxedSlerp">;
  frameDeltaSeconds?: number;
  lastGood: Record<string, THREE.Quaternion>;
  leftArmDecision: MovementAvatarArmDecision;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  rightArmDecision: MovementAvatarArmDecision;
  shouldApplySolverTorso: boolean;
  torsoTrackingReady: boolean;
}): MovementAvatarUpperBodyFrameRuntimeResult {
  // The rest-mapped segment retarget owns arms and spine. Per-segment
  // confidence gates application; arms that could not solve fall back to
  // hold-last-good / relax inside the upper-body runtime.
  // Apply every parent torso writer before solving the child arm directions.
  // Otherwise a later chest/upper-chest update invalidates both solved arms
  // inside the same rendered frame and presents as a synchronized arm snap.
  const torsoRuntimeApplication = applyMovementAvatarUpperBodyRuntimeToVrmBones({
    activeSpineDrive,
    armRelaxedSlerp: boneEaseOptions.armRelaxedSlerp,
    avatarRole,
    frameDeltaSeconds,
    lastGood,
    leftArmDecision,
    leftArmRetargetApplied: true,
    lookupBone,
    rightArmDecision,
    rightArmRetargetApplied: true,
    shouldApplySolverTorso,
    spineApplyOptions: resolveMovementAvatarSpineApplyOptions({
      avatarRole,
      shouldApplySpine: activeSpineDrive.shouldApplySpine,
    }),
    torsoTrackingReady,
  });

  // The calibrated spine drive is the single torso owner. A second
  // direction-only spine solve cannot preserve axial twist and can choose a
  // different local rotation branch while the source torso is moving
  // smoothly. Because both arms inherit the spine transform, that branch
  // change presents as a synchronized arm teleport. Arms remain rest-mapped,
  // but the spine is intentionally not written a second time here.
  const leftArmRetarget = applyRetargetMappings(MOVEMENT_AVATAR_LEFT_ARM_RETARGET_MAPPINGS);
  const rightArmRetarget = applyRetargetMappings(MOVEMENT_AVATAR_RIGHT_ARM_RETARGET_MAPPINGS);
  const leftArm = applyMovementAvatarArmApplicationToVrmBones({
    armDecision: leftArmDecision,
    armRelaxedSlerp: boneEaseOptions.armRelaxedSlerp,
    lastGood,
    lookupBone,
    retargetApplied: leftArmRetarget.applied > 0,
    side: "left",
  });
  const rightArm = applyMovementAvatarArmApplicationToVrmBones({
    armDecision: rightArmDecision,
    armRelaxedSlerp: boneEaseOptions.armRelaxedSlerp,
    lastGood,
    lookupBone,
    retargetApplied: rightArmRetarget.applied > 0,
    side: "right",
  });
  const upperBodyRuntimeApplication: MovementAvatarUpperBodyRuntimeApplication = {
    ...torsoRuntimeApplication,
    leftArm,
    rightArm,
  };

  return {
    retargetAppliedUpperBody:
      upperBodyRuntimeApplication.recordedSpineRetargetCount +
      leftArmRetarget.applied +
      rightArmRetarget.applied,
    upperBodyRuntimeApplication,
  };
}

// --- movementAvatarUpperBodyFrameOrchestrationRuntime ---

type MovementAvatarUpperBodyFrameRuntimeInput = Parameters<typeof applyMovementAvatarUpperBodyFrameRuntime>[0];

export type MovementAvatarUpperBodyFrameOrchestrationRuntimeResult = {
  retargetAppliedUpperBody: number;
  upperBodyFrameRuntime: MovementAvatarUpperBodyFrameRuntimeResult;
};

export function applyMovementAvatarUpperBodyFrameOrchestrationRuntime({
  lastGoodQuaternionRef,
  retargetFrameRuntimeAdapters,
  ...input
}: Omit<
  MovementAvatarUpperBodyFrameRuntimeInput,
  "applyRetargetMappings" | "lastGood"
> & {
  lastGoodQuaternionRef: MovementAvatarMutableRef<Record<string, THREE.Quaternion>>;
  retargetFrameRuntimeAdapters: Pick<MovementAvatarRetargetFrameRuntimeAdapters, "applyRetargetMappings">;
}): MovementAvatarUpperBodyFrameOrchestrationRuntimeResult {
  const upperBodyFrameRuntime = applyMovementAvatarUpperBodyFrameRuntime({
    ...input,
    applyRetargetMappings: retargetFrameRuntimeAdapters.applyRetargetMappings,
    lastGood: lastGoodQuaternionRef.current,
  });

  return {
    retargetAppliedUpperBody: upperBodyFrameRuntime.retargetAppliedUpperBody,
    upperBodyFrameRuntime,
  };
}

// --- movementAvatarInactiveLowerBodyRuntime ---

export type MovementAvatarInactiveLowerBodyRuntimeApplication = {
  appliedNeutralRotations: number;
  feetOwner: string | null;
  lowerBodyOwner: string | null;
};

export function applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
  avatarRole,
  lookupBone,
  lowerBodyNeutralSlerp,
  lowerBodySourceReliable,
}: {
  avatarRole: "instructor" | "player";
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  lowerBodyNeutralSlerp: number;
  lowerBodySourceReliable: boolean;
}): MovementAvatarInactiveLowerBodyRuntimeApplication {
  const inactiveLowerBodyDecision = resolveMovementAvatarInactiveLowerBodyDecision({
    avatarRole,
    lowerBodySourceReliable,
  });
  const neutralApplication = applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones({
    lookupBone,
    slerp: lowerBodyNeutralSlerp,
  });
  // Inactive player frames and explicit recorded-neutral frames are two
  // ownership routes to the same rendered neutral pose. Apply the same exact
  // planted-foot target here so mirrored retarget twist cannot leak into a
  // different player-only release arc.
  applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
    currentFeetOwner: "neutral",
    isPlayer: avatarRole === "player",
    lookupBone,
    sides: ["right", "left"],
    slerp: 1,
  });

  return {
    appliedNeutralRotations: neutralApplication.applied,
    feetOwner: inactiveLowerBodyDecision.feetOwner,
    lowerBodyOwner: inactiveLowerBodyDecision.lowerBodyOwner,
  };
}

// --- movementAvatarLowerBodyFrameRuntime ---

const MOVEMENT_AVATAR_FOOT_RETARGET_MAPPINGS = MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS.filter(
  (mapping) => mapping.type === "foot",
);

export type MovementAvatarLowerBodyFrameRuntimeResult = {
  footOwner: string;
  lowerBodyOwner: string;
  plantedSquatIkDepth: number;
  retargetAppliedFeet: number;
  retargetAppliedLegs: number;
  retargetAppliedLowerBody: number;
};

export function applyMovementAvatarLowerBodyFrameRuntime({
  applyPlantedSquatIk,
  applyRetargetMappings,
  avatarRole,
  balancedPlantedSquatDepth,
  boneEaseOptions,
  currentFeetOwner,
  currentLowerBodyOwner,
  instructorSquatPresentationDepth,
  kneeRaiseLowerLegBoost,
  kneeRaiseUpperLegBoost,
  lookupBone,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTarget,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  playerSquatPresentationDepth,
  recordedLowerBodySourceReliable,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose,
  squatFlexionBendBoost,
  updateWorldMatrix,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  applyRetargetMappings: (mappings: MovementAvatarRetargetBoneMapping[]) => MovementAvatarLowerBodyRetargetSegmentCounts;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  boneEaseOptions: Pick<
    MovementAvatarBoneEaseOptionsDecision,
    "lowerBodyNeutralSlerp" | "singleLegRaiseSlerp" | "squatFlexionSlerp"
  >;
  currentFeetOwner: string;
  currentLowerBodyOwner: string;
  instructorSquatPresentationDepth: number;
  kneeRaiseLowerLegBoost?: number;
  kneeRaiseUpperLegBoost?: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodySegmentMotion: number;
  lowerBodyTarget: MovementAvatarLowerBodyTargetDecision;
  lowerBodyTrackingReady: boolean;
  playerRetargetLowerBodyMotion: number;
  playerSquatPresentationDepth: number;
  recordedLowerBodySourceReliable: boolean;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
  squatFlexionBendBoost?: number;
  updateWorldMatrix: () => void;
}): MovementAvatarLowerBodyFrameRuntimeResult {
  let footOwner = currentFeetOwner;
  let lowerBodyOwner = currentLowerBodyOwner;
  let plantedSquatIkDepth = 0;
  let retargetAppliedFeet = 0;
  let retargetAppliedLegs = 0;
  let retargetAppliedLowerBody = 0;
  const isPlayer = avatarRole === "player";
  // This legacy role-smoothed value remains in the frame contract for debug
  // telemetry, but shared partial-retarget application must use
  // lowerBodyTarget.recordedSquatPresentationDepth instead.
  void instructorSquatPresentationDepth;

  // Target resolution owns lower-body eligibility, including a complete leg
  // solve that remains usable during a visibility-confidence dip. Repeating
  // the raw readiness gate here used to turn that approved retarget target
  // into an inactive neutral frame before any VRM leg bones were applied.
  if (lowerBodyTarget.stageDecision && shouldApplyLowerBody) {
    const lowerBodyApplicationPlan = resolveMovementAvatarLowerBodyApplicationPlan({
      lowerBodyDrive,
      lowerBodyTarget,
    });

    const nonRetargetLowerBodyApplication = applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones({
      applyPlantedSquatIk,
      currentFeetOwner: footOwner,
      isPlayer,
      kneeRaiseLowerLegBoost,
      kneeRaiseUpperLegBoost,
      lookupBone,
      lowerBodyNeutralSlerp: boneEaseOptions.lowerBodyNeutralSlerp,
      plan: lowerBodyApplicationPlan,
      singleLegRaiseSlerp: boneEaseOptions.singleLegRaiseSlerp,
      squatFlexionBendBoost,
      squatFlexionSlerp: boneEaseOptions.squatFlexionSlerp,
    });
    if (nonRetargetLowerBodyApplication.handled) {
      lowerBodyOwner = nonRetargetLowerBodyApplication.lowerBodyOwner ?? lowerBodyOwner;
      footOwner = nonRetargetLowerBodyApplication.feetOwner ?? footOwner;
      if (nonRetargetLowerBodyApplication.plantedSquatIkDepth !== null) {
        plantedSquatIkDepth = nonRetargetLowerBodyApplication.plantedSquatIkDepth;
      }

      // A player squat can still use solved foot directions after its
      // presentation fallback rotates the leg chain. Player-neutral must not
      // do that: the matching instructor stage is recorded-neutral, so
      // reapplying low-confidence feet only on the player creates a visible
      // three-party ownership split.
      if (
        isPlayer &&
        lowerBodyApplicationPlan.mode === "player-squat"
      ) {
        updateWorldMatrix();
        const footRetargetCounts = applyRetargetMappings(MOVEMENT_AVATAR_FOOT_RETARGET_MAPPINGS);
        if (footRetargetCounts.feet > 0) {
          retargetAppliedFeet += footRetargetCounts.feet;
          retargetAppliedLowerBody += footRetargetCounts.applied;
          footOwner = "recorded-retarget";
        }
      }
    } else if (lowerBodyApplicationPlan.mode === "retarget") {
      updateWorldMatrix();
      const lowerBodyRetargetCounts = applyRetargetMappings(MOVEMENT_AVATAR_LOWER_BODY_RETARGET_MAPPINGS);
      const retargetCountApplication = applyMovementAvatarLowerBodyRetargetSegmentCounts({
        current: {
          feet: retargetAppliedFeet,
          legs: retargetAppliedLegs,
          lowerBody: retargetAppliedLowerBody,
        },
        segmentCounts: lowerBodyRetargetCounts,
      });
      retargetAppliedLowerBody = retargetCountApplication.lowerBody;
      retargetAppliedLegs = retargetCountApplication.legs;
      retargetAppliedFeet = retargetCountApplication.feet;
      if (retargetCountApplication.footOwnerOverride) {
        footOwner = retargetCountApplication.footOwnerOverride;
      }

      const retargetDecisionApplication = resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput({
        appliedFootSegments: retargetAppliedFeet,
        appliedLegSegments: retargetAppliedLegs,
        appliedLowerBodySegments: retargetAppliedLowerBody,
        avatarRole,
        balancedPlantedSquatDepth,
        // Partial retarget is shared recorded-source fallback. The role-local
        // instructor presentation value is deliberately smoothed at a
        // different rate from the player value, so feeding it into this plan
        // recreates two leg poses from one source frame. Use the raw recorded
        // target carried by the shared lower-body target instead.
        instructorSquatPresentationDepth: lowerBodyTarget.recordedSquatPresentationDepth,
        lowerBodyDrive,
        lowerBodySegmentMotion,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        retargetFrame,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        playerSquatPresentationDepth,
        stageDecision: lowerBodyApplicationPlan.stageDecision,
      });
      lowerBodyOwner = retargetDecisionApplication.lowerBodyOwner;
      const { retargetApplicationPlan } = retargetDecisionApplication;
      if (retargetApplicationPlan.legRaiseOverlay) {
        lowerBodyOwner = `player-${retargetApplicationPlan.legRaiseOverlay.side}-leg-raise`;
      }

      footOwner = retargetDecisionApplication.feetOwner;

      const retargetPostPlanApplication = applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones({
        applyPlantedSquatIk,
        contacts: retargetFrame.contacts,
        currentFeetOwner: footOwner,
        isPlayer,
        kneeRaiseLowerLegBoost,
        kneeRaiseUpperLegBoost,
        lookupBone,
        plan: retargetApplicationPlan,
        singleLegRaiseSlerp: boneEaseOptions.singleLegRaiseSlerp,
        squatFlexionBendBoost,
      });
      plantedSquatIkDepth = retargetPostPlanApplication.plantedSquatIkDepth;
      footOwner = retargetPostPlanApplication.feetOwner;

      // A squat fallback rotates thigh/shin parents after the first retarget
      // pass. Re-apply only the foot world-direction targets afterwards so the
      // final rendered feet keep their source direction instead of inheriting
      // a role-specific parent-chain offset.
      if (retargetApplicationPlan.squatFlexionDepth !== null) {
        updateWorldMatrix();
        const refinedFootCounts = applyRetargetMappings(MOVEMENT_AVATAR_FOOT_RETARGET_MAPPINGS);
        if (refinedFootCounts.feet > 0) {
          footOwner = "recorded-retarget";
        }
      }
    }
  } else {
    const inactiveLowerBodyApplication = applyMovementAvatarInactiveLowerBodyRuntimeToVrmBones({
      avatarRole,
      lookupBone,
      lowerBodyNeutralSlerp: boneEaseOptions.lowerBodyNeutralSlerp,
      lowerBodySourceReliable: recordedLowerBodySourceReliable,
    });
    if (inactiveLowerBodyApplication.lowerBodyOwner) {
      lowerBodyOwner = inactiveLowerBodyApplication.lowerBodyOwner;
    }
    if (inactiveLowerBodyApplication.feetOwner) {
      footOwner = inactiveLowerBodyApplication.feetOwner;
    }
  }

  return {
    footOwner,
    lowerBodyOwner,
    plantedSquatIkDepth,
    retargetAppliedFeet,
    retargetAppliedLegs,
    retargetAppliedLowerBody,
  };
}

// --- movementAvatarLowerBodyFrameCallbacksRuntime ---

type MovementAvatarLastGoodQuaternionRef = {
  current: Record<string, THREE.Quaternion | null | undefined>;
};

export function createMovementAvatarLowerBodyFrameCallbacksRuntime({
  lastGoodQuaternionRef,
  scene,
}: {
  lastGoodQuaternionRef: MovementAvatarLastGoodQuaternionRef;
  scene: Pick<THREE.Object3D, "updateMatrixWorld">;
}) {
  return {
    getLastGoodQuaternion: (boneName: string) => lastGoodQuaternionRef.current[boneName] ?? null,
    storeLastGoodQuaternion: (boneName: string, quaternion: THREE.Quaternion) => {
      lastGoodQuaternionRef.current[boneName] = quaternion;
    },
    updateWorldMatrix: () => {
      scene.updateMatrixWorld(true);
    },
  };
}

// --- movementAvatarLowerBodyFrameOrchestrationRuntime ---

type MovementAvatarLowerBodyFrameRuntimeInput = Parameters<typeof applyMovementAvatarLowerBodyFrameRuntime>[0];

export type MovementAvatarLowerBodyFrameOrchestrationRuntimeResult = {
  footOwner: string;
  lowerBodyFrameRuntime: MovementAvatarLowerBodyFrameRuntimeResult;
  lowerBodyOwner: string;
  plantedSquatIkDepth: number;
  retargetAppliedLowerBody: number;
};

export function applyMovementAvatarLowerBodyFrameOrchestrationRuntime({
  lastGoodQuaternionRef,
  profile,
  retargetAvatarRestRef,
  retargetFrameRuntimeAdapters,
  scene,
  ...input
}: Omit<
  MovementAvatarLowerBodyFrameRuntimeInput,
  | "applyPlantedSquatIk"
  | "applyRetargetMappings"
  | "updateWorldMatrix"
> & {
  lastGoodQuaternionRef: MovementAvatarMutableRef<Record<string, THREE.Quaternion>>;
  profile: MovementAvatarTrackingProfile | undefined;
  retargetAvatarRestRef: MovementAvatarMutableRef<MovementAvatarRetargetRestMap>;
  retargetFrameRuntimeAdapters: MovementAvatarRetargetFrameRuntimeAdapters;
  scene: Pick<THREE.Object3D, "updateMatrixWorld">;
}): MovementAvatarLowerBodyFrameOrchestrationRuntimeResult {
  const lowerBodyFrameCallbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
    lastGoodQuaternionRef,
    scene,
  });
  const lowerBodyFrameRuntime = applyMovementAvatarLowerBodyFrameRuntime({
    ...input,
    applyPlantedSquatIk: retargetFrameRuntimeAdapters.applyPlantedSquatIk,
    applyRetargetMappings: retargetFrameRuntimeAdapters.applyRetargetMappings,
    kneeRaiseLowerLegBoost: profile?.kneeRaiseLowerLegBoost,
    kneeRaiseUpperLegBoost: profile?.kneeRaiseUpperLegBoost,
    updateWorldMatrix: lowerBodyFrameCallbacks.updateWorldMatrix,
  });
  retargetAvatarRestRef.current = retargetFrameRuntimeAdapters.getRestMap();

  return {
    footOwner: lowerBodyFrameRuntime.footOwner,
    lowerBodyFrameRuntime,
    lowerBodyOwner: lowerBodyFrameRuntime.lowerBodyOwner,
    plantedSquatIkDepth: lowerBodyFrameRuntime.plantedSquatIkDepth,
    retargetAppliedLowerBody: lowerBodyFrameRuntime.retargetAppliedLowerBody,
  };
}

// --- movementAvatarBodyFrameOrchestrationRuntime ---

type MovementAvatarFrameTargetRetargetInput =
  Parameters<typeof resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime>[0];
type MovementAvatarUpperBodyFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarUpperBodyFrameOrchestrationRuntime>[0];
type MovementAvatarLowerBodyFrameOrchestrationInput =
  Parameters<typeof applyMovementAvatarLowerBodyFrameOrchestrationRuntime>[0];

export type MovementAvatarBodyFrameOrchestrationRuntimeResult = {
  footOwner: string;
  frameTargetRuntime: MovementAvatarFrameTargetRetargetOrchestrationRuntime["frameTargetRuntime"];
  lowerBodyFrameOrchestrationRuntime: MovementAvatarLowerBodyFrameOrchestrationRuntimeResult;
  lowerBodyOwner: string;
  plantedSquatIkDepth: number;
  retargetAppliedLowerBody: number;
  retargetAppliedUpperBody: number;
  targetRetargetOrchestrationRuntime: MovementAvatarFrameTargetRetargetOrchestrationRuntime;
  upperBodyFrameOrchestrationRuntime: MovementAvatarUpperBodyFrameOrchestrationRuntimeResult;
};

export function applyMovementAvatarBodyFrameOrchestrationRuntime({
  activeSpineDrive,
  avatarRole,
  avatarRoot,
  balancedPlantedSquatDepth,
  boneEaseOptions,
  currentRestMap,
  frameDeltaSeconds,
  instructorSquatPresentationDepth,
  lastGoodQuaternionRef,
  leftArmDecision,
  lookupBone,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTarget,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  playerSquatPresentationDepth,
  profile,
  recordedLowerBodySourceReliable,
  retargetAvatarRestRef,
  retargetFrame,
  rightArmDecision,
  scene,
  shouldApplyLowerBody,
  shouldApplySolverTorso,
  shouldHoldPlayerSquatPose,
  squatFlexionBendBoost,
  targetSolverLandmarks,
  torsoTrackingReady,
  vrm,
}: {
  activeSpineDrive: MovementAvatarUpperBodyFrameOrchestrationInput["activeSpineDrive"];
  avatarRole: MovementAvatarFrameTargetRetargetInput["avatarRole"];
  avatarRoot: MovementAvatarFrameTargetRetargetInput["avatarRoot"];
  balancedPlantedSquatDepth: MovementAvatarLowerBodyFrameOrchestrationInput["balancedPlantedSquatDepth"];
  boneEaseOptions: MovementAvatarUpperBodyFrameOrchestrationInput["boneEaseOptions"] &
    MovementAvatarLowerBodyFrameOrchestrationInput["boneEaseOptions"];
  currentRestMap: MovementAvatarFrameTargetRetargetInput["currentRestMap"];
  frameDeltaSeconds?: number;
  instructorSquatPresentationDepth: number;
  lastGoodQuaternionRef: MovementAvatarUpperBodyFrameOrchestrationInput["lastGoodQuaternionRef"];
  leftArmDecision: MovementAvatarUpperBodyFrameOrchestrationInput["leftArmDecision"];
  lookupBone: MovementAvatarUpperBodyFrameOrchestrationInput["lookupBone"];
  lowerBodyDrive: MovementAvatarLowerBodyFrameOrchestrationInput["lowerBodyDrive"];
  lowerBodySegmentMotion: MovementAvatarFrameTargetRetargetInput["lowerBodySegmentMotion"];
  lowerBodyTarget: MovementAvatarLowerBodyFrameOrchestrationInput["lowerBodyTarget"];
  lowerBodyTrackingReady: MovementAvatarLowerBodyFrameOrchestrationInput["lowerBodyTrackingReady"];
  playerRetargetLowerBodyMotion: MovementAvatarLowerBodyFrameOrchestrationInput["playerRetargetLowerBodyMotion"];
  playerSquatPresentationDepth: MovementAvatarLowerBodyFrameOrchestrationInput["playerSquatPresentationDepth"];
  profile: NonNullable<MovementAvatarFrameTargetRetargetInput["profile"]>;
  recordedLowerBodySourceReliable: MovementAvatarLowerBodyFrameOrchestrationInput["recordedLowerBodySourceReliable"];
  retargetAvatarRestRef: MovementAvatarLowerBodyFrameOrchestrationInput["retargetAvatarRestRef"];
  retargetFrame: MovementAvatarFrameTargetRetargetInput["retargetFrame"];
  rightArmDecision: MovementAvatarUpperBodyFrameOrchestrationInput["rightArmDecision"];
  scene: Pick<THREE.Object3D, "updateMatrixWorld">;
  shouldApplyLowerBody: MovementAvatarLowerBodyFrameOrchestrationInput["shouldApplyLowerBody"];
  shouldApplySolverTorso: MovementAvatarUpperBodyFrameOrchestrationInput["shouldApplySolverTorso"];
  shouldHoldPlayerSquatPose: MovementAvatarLowerBodyFrameOrchestrationInput["shouldHoldPlayerSquatPose"];
  squatFlexionBendBoost: MovementAvatarLowerBodyFrameOrchestrationInput["squatFlexionBendBoost"];
  targetSolverLandmarks: MovementAvatarFrameTargetRetargetInput["targetSolverLandmarks"];
  torsoTrackingReady: MovementAvatarUpperBodyFrameOrchestrationInput["torsoTrackingReady"];
  vrm: MovementAvatarFrameTargetRetargetInput["vrm"];
}): MovementAvatarBodyFrameOrchestrationRuntimeResult {
  const targetRetargetOrchestrationRuntime = resolveMovementAvatarFrameTargetRetargetOrchestrationRuntime({
    avatarRole,
    avatarRoot,
    currentRestMap,
    frameDeltaSeconds,
    instructorSquatPresentationDepth,
    lastGood: lastGoodQuaternionRef.current,
    lookupBone,
    lowerBodySegmentMotion,
    profile,
    retargetFrame,
    targetSolverLandmarks,
    vrm,
  });
  const {
    frameTargetRuntime,
    retargetFrameRuntimeAdapters,
  } = targetRetargetOrchestrationRuntime;

  const upperBodyFrameOrchestrationRuntime = applyMovementAvatarUpperBodyFrameOrchestrationRuntime({
    activeSpineDrive,
    avatarRole,
    boneEaseOptions,
    frameDeltaSeconds,
    lastGoodQuaternionRef,
    leftArmDecision,
    lookupBone,
    retargetFrameRuntimeAdapters,
    rightArmDecision,
    shouldApplySolverTorso,
    torsoTrackingReady,
  });

  const lowerBodyFrameOrchestrationRuntime = applyMovementAvatarLowerBodyFrameOrchestrationRuntime({
    avatarRole,
    balancedPlantedSquatDepth,
    boneEaseOptions,
    currentFeetOwner: "neutral",
    currentLowerBodyOwner: "neutral",
    instructorSquatPresentationDepth,
    lastGoodQuaternionRef,
    lookupBone,
    lowerBodyDrive,
    lowerBodySegmentMotion,
    lowerBodyTarget,
    lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion,
    playerSquatPresentationDepth,
    profile,
    recordedLowerBodySourceReliable,
    retargetAvatarRestRef,
    retargetFrame,
    retargetFrameRuntimeAdapters,
    scene,
    shouldApplyLowerBody,
    shouldHoldPlayerSquatPose,
    squatFlexionBendBoost,
  });

  return {
    footOwner: lowerBodyFrameOrchestrationRuntime.footOwner,
    frameTargetRuntime,
    lowerBodyFrameOrchestrationRuntime,
    lowerBodyOwner: lowerBodyFrameOrchestrationRuntime.lowerBodyOwner,
    plantedSquatIkDepth: lowerBodyFrameOrchestrationRuntime.plantedSquatIkDepth,
    retargetAppliedLowerBody: lowerBodyFrameOrchestrationRuntime.retargetAppliedLowerBody,
    retargetAppliedUpperBody: upperBodyFrameOrchestrationRuntime.retargetAppliedUpperBody,
    targetRetargetOrchestrationRuntime,
    upperBodyFrameOrchestrationRuntime,
  };
}
