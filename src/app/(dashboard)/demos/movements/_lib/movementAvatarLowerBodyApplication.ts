import * as THREE from "three";
import type {
  MovementAvatarAppliedLowerBodyDecision,
  MovementAvatarAimOptionsDecision,
  MovementAvatarBoneRotationSpec,
  MovementAvatarLowerBodyApplicationStageDecision,
  MovementAvatarLegacyLowerBodyAimOptionsDecision,
  MovementAvatarLegacyLowerBodyAimSpec,
  MovementAvatarLegacyLowerBodyAimTargetName,
  MovementAvatarLowerBodyRigSourceBoneName,
  MovementAvatarRigRotationSpec,
  MovementAvatarSpineBoneRotationSpec,
  MovementAvatarSupportPresentationArmRotationSpec,
} from "./movementAvatarPipeline";
import {
  resolveMovementAvatarAppliedLowerBodyDecision,
  resolveMovementAvatarLegacyLowerBodyAimPose,
  resolveMovementAvatarLowerBodyNeutralPose,
  resolveMovementAvatarPlantedFootOwner,
  resolveMovementAvatarSingleLegRaisePose,
  resolveMovementAvatarSolvedLowerBodyPose,
  resolveMovementAvatarSquatFlexionPose,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type { MovementAvatarLowerBodyTargetDecision } from "./movementAvatarTarget";
import type { MovementRetargetFrame } from "./movementRetargeting";
import { applyMovementAvatarAimVectorToObjects } from "./movementAvatarAimApplication";
import {
  applyVrmNamedRotationTargets,
  applyVrmRigRotationApplicationTarget,
  resolveVrmRigRotationApplicationTarget,
  type VrmRigRotation,
} from "./vrmRigging";

export type MovementAvatarLowerBodyAimLandmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
};

export type MovementAvatarLegacyLowerBodyAimTargets = Record<
  MovementAvatarLegacyLowerBodyAimTargetName,
  MovementAvatarLowerBodyAimLandmark | null | undefined
>;

export type MovementAvatarLegacyLowerBodyAimRequest = Pick<
  MovementAvatarLegacyLowerBodyAimSpec,
  "bone" | "child"
> & {
  options: MovementAvatarAimOptionsDecision;
  source: MovementAvatarLowerBodyAimLandmark | null | undefined;
  target: MovementAvatarLowerBodyAimLandmark | null | undefined;
};

export type MovementAvatarSupportPresentationRotationSpec =
  | MovementAvatarBoneRotationSpec
  | MovementAvatarSpineBoneRotationSpec
  | MovementAvatarSupportPresentationArmRotationSpec;

export type MovementAvatarLowerBodyApplicationPlan =
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "inactive-neutral";
      shouldEaseLowerBodyToNeutral: true;
      stageDecision: null;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "player-neutral";
      shouldEaseLowerBodyToNeutral: true;
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "player-leg-raise";
      side: "left" | "right";
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
      depth: number;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "player-squat";
      shouldEaseLowerBodyToNeutral: boolean;
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
      depth: number;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "recorded-neutral";
      plantInstructorFeet: Array<"left" | "right">;
      shouldEaseLowerBodyToNeutral: true;
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
    }
  | {
      feetOwner: string;
      lowerBodyOwner: string;
      mode: "retarget";
      stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
    };

export type MovementAvatarLowerBodyRetargetApplicationPlan = {
  legRaiseOverlay: {
    depth: number;
    side: "left" | "right";
  } | null;
  plantedSquatIkDepth: number;
  plantInstructorFeet: Array<"left" | "right">;
  shouldApplyLegacyAim: boolean;
  solvedLowerBodyDepth: number | null;
  squatFlexionDepth: number | null;
};

export type MovementAvatarLowerBodyNonRetargetApplicationResult = {
  feetOwner: string | null;
  handled: boolean;
  lowerBodyOwner: string | null;
  plantedSquatIkDepth: number | null;
};

export type MovementAvatarLowerBodyRetargetPostPlanApplicationResult = {
  appliedLegRaiseOverlay: boolean;
  appliedSolvedLowerBody: boolean;
  appliedSquatFlexion: boolean;
  plantedSquatIkDepth: number;
};

export type MovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBonesResult =
  MovementAvatarLowerBodyRetargetPostPlanApplicationResult & {
    feetOwner: string;
  };

export type MovementAvatarLowerBodySquatPoseApplicationResult = {
  appliedSquatFlexion: boolean;
  plantedSquatIkDepth: number;
};

export type MovementAvatarLowerBodyRetargetAppliedCounts = {
  feet: number;
  legs: number;
  lowerBody: number;
};

export type MovementAvatarLowerBodyRetargetSegmentCounts = {
  applied: number;
  feet: number;
  legs: number;
};

export type MovementAvatarLowerBodyRetargetSegmentCountApplicationResult =
  MovementAvatarLowerBodyRetargetAppliedCounts & {
    footOwnerOverride: "recorded-retarget" | null;
  };

export type MovementAvatarLowerBodyRetargetDecisionApplication = {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  lowerBodyOwner: string;
  feetOwner: string;
  retargetApplicationPlan: MovementAvatarLowerBodyRetargetApplicationPlan;
};

export type MovementAvatarLowerBodyRetargetDecisionApplicationInput = {
  appliedFootSegments: number;
  appliedLegSegments: number;
  appliedLowerBodySegments: number;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodySegmentMotion: number;
  lowerBodyTrackingReady: boolean;
  playerRetargetLowerBodyMotion: number;
  playerSquatPresentationDepth: number;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
};

export type MovementAvatarInstructorFootPlantSide = "left" | "right";

export type MovementAvatarInstructorFootPlantBone =
  `${MovementAvatarInstructorFootPlantSide}${"Foot" | "Toes"}`;

export type MovementAvatarInstructorFootPlantContacts = Partial<
  Record<`${MovementAvatarInstructorFootPlantSide}Foot`, boolean>
>;

export type MovementAvatarInstructorFootPlantPoseResult = {
  applied: boolean;
  appliedRotations: number;
  feetOwner: string;
};

export type MovementAvatarInstructorFootPlantRequestsToVrmBonesResult = {
  applied: number;
  feetOwner: string;
};

export type MovementAvatarLegacyLowerBodyAimRequestApplicationResult = {
  applied: number;
};

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

export function applyMovementAvatarInstructorFootPlantRequests({
  apply,
  contacts,
  sides,
}: {
  apply: (side: MovementAvatarInstructorFootPlantSide) => boolean;
  contacts?: MovementAvatarInstructorFootPlantContacts;
  sides: MovementAvatarInstructorFootPlantSide[];
}) {
  let applied = 0;

  sides.forEach((side) => {
    if (contacts && !contacts[side === "left" ? "leftFoot" : "rightFoot"]) return;
    if (apply(side)) {
      applied += 1;
    }
  });

  return {
    applied,
  };
}

export function applyMovementAvatarInstructorFootPlantPose({
  applyRotation,
  currentFeetOwner,
  isPlayer,
  side,
  slerp = 0.62,
}: {
  applyRotation: (spec: {
    bone: MovementAvatarInstructorFootPlantBone;
    rotation: MovementAvatarBoneRotationSpec["rotation"];
    slerp: number;
  }) => boolean | void;
  currentFeetOwner: string;
  isPlayer: boolean;
  side: MovementAvatarInstructorFootPlantSide;
  slerp?: number;
}): MovementAvatarInstructorFootPlantPoseResult {
  if (isPlayer) {
    return {
      applied: false,
      appliedRotations: 0,
      feetOwner: currentFeetOwner,
    };
  }

  const rotation = { x: 0, y: 0, z: 0 };
  const specs = [
    { bone: `${side}Foot` as const, rotation, slerp },
    { bone: `${side}Toes` as const, rotation, slerp },
  ];
  let appliedRotations = 0;
  specs.forEach((spec) => {
    if (applyRotation(spec) !== false) {
      appliedRotations += 1;
    }
  });

  return {
    applied: true,
    appliedRotations,
    feetOwner: resolveMovementAvatarPlantedFootOwner(currentFeetOwner),
  };
}

export function resolveMovementAvatarLegacyLowerBodyAimRequests({
  options,
  pose = resolveMovementAvatarLegacyLowerBodyAimPose(),
  targets,
  targetSolverLandmarks,
}: {
  options: MovementAvatarLegacyLowerBodyAimOptionsDecision;
  pose?: MovementAvatarLegacyLowerBodyAimSpec[];
  targets: MovementAvatarLegacyLowerBodyAimTargets;
  targetSolverLandmarks: Array<MovementAvatarLowerBodyAimLandmark | null | undefined>;
}): MovementAvatarLegacyLowerBodyAimRequest[] {
  return pose.map((spec) => ({
    bone: spec.bone,
    child: spec.child,
    options: options[spec.options],
    source: spec.source.type === "landmark"
      ? targetSolverLandmarks[spec.source.index]
      : targets[spec.source.target],
    target: targets[spec.target],
  }));
}

export function resolveMovementAvatarLowerBodyRetargetAimRequests({
  options,
  retargetApplicationPlan,
  targets,
  targetSolverLandmarks,
}: {
  options: MovementAvatarLegacyLowerBodyAimOptionsDecision;
  retargetApplicationPlan: Pick<MovementAvatarLowerBodyRetargetApplicationPlan, "shouldApplyLegacyAim">;
  targets: MovementAvatarLegacyLowerBodyAimTargets;
  targetSolverLandmarks: Array<MovementAvatarLowerBodyAimLandmark | null | undefined>;
}): MovementAvatarLegacyLowerBodyAimRequest[] {
  if (!retargetApplicationPlan.shouldApplyLegacyAim) return [];

  return resolveMovementAvatarLegacyLowerBodyAimRequests({
    options,
    targets,
    targetSolverLandmarks,
  });
}

export function applyMovementAvatarLegacyLowerBodyAimRequests({
  apply,
  requests,
}: {
  apply: (request: MovementAvatarLegacyLowerBodyAimRequest) => void;
  requests: MovementAvatarLegacyLowerBodyAimRequest[];
}) {
  requests.forEach((request) => {
    apply(request);
  });

  return {
    applied: requests.length,
  };
}

export function applyMovementAvatarLegacyLowerBodyAimRequestsToVrmBones({
  fallbackSlerp,
  getLastGoodQuaternion,
  lookupBone,
  requests,
  storeLastGoodQuaternion,
  zScale,
}: {
  fallbackSlerp: number;
  getLastGoodQuaternion?: (boneName: string) => THREE.Quaternion | null | undefined;
  lookupBone: (boneName: string) => THREE.Object3D | null | undefined;
  requests: MovementAvatarLegacyLowerBodyAimRequest[];
  storeLastGoodQuaternion?: (boneName: string, quaternion: THREE.Quaternion) => void;
  zScale: number;
}): MovementAvatarLegacyLowerBodyAimRequestApplicationResult {
  let applied = 0;

  requests.forEach((request) => {
    const result = applyMovementAvatarAimVectorToObjects({
      boneName: request.bone,
      childName: request.child,
      frontBias: request.options.frontBias,
      getLastGoodQuaternion,
      lookupBone,
      minVectorLengthSq: request.options.minVectorLengthSq,
      slerp: request.options.slerpOverride ?? fallbackSlerp,
      start: request.source,
      storeLastGoodQuaternion,
      storeVisibilityThreshold: request.options.storeVisibilityThreshold,
      target: request.target,
      visibilityThreshold: request.options.visibilityThreshold,
      zScale,
    });

    if (result.applied) applied += 1;
  });

  return {
    applied,
  };
}

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

export function applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
  depth,
  lookupBone,
  side,
  slerp,
}: {
  depth: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  side: "left" | "right";
  slerp: number;
}) {
  return applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
    lookupBone,
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

export function applyMovementAvatarInstructorFootPlantPoseToVrmBones({
  currentFeetOwner,
  isPlayer,
  lookupBone,
  side,
  slerp,
}: {
  currentFeetOwner: string;
  isPlayer: boolean;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  side: MovementAvatarInstructorFootPlantSide;
  slerp?: number;
}) {
  return applyMovementAvatarInstructorFootPlantPose({
    applyRotation: (spec) => {
      const result = applyMovementAvatarLowerBodyRotationSpecsToVrmBones({
        lookupBone,
        specs: [spec],
      });

      return result.applied > 0;
    },
    currentFeetOwner,
    isPlayer,
    side,
    slerp,
  });
}

export function applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
  contacts,
  currentFeetOwner,
  isPlayer,
  lookupBone,
  sides,
  slerp,
}: {
  contacts?: MovementAvatarInstructorFootPlantContacts;
  currentFeetOwner: string;
  isPlayer: boolean;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  sides: MovementAvatarInstructorFootPlantSide[];
  slerp?: number;
}): MovementAvatarInstructorFootPlantRequestsToVrmBonesResult {
  let feetOwner = currentFeetOwner;
  const result = applyMovementAvatarInstructorFootPlantRequests({
    apply: (side) => {
      const poseResult = applyMovementAvatarInstructorFootPlantPoseToVrmBones({
        currentFeetOwner: feetOwner,
        isPlayer,
        lookupBone,
        side,
        slerp,
      });
      feetOwner = poseResult.feetOwner;
      return poseResult.applied;
    },
    contacts,
    sides,
  });

  return {
    applied: result.applied,
    feetOwner,
  };
}

export function applyMovementAvatarLowerBodySquatPoseApplication({
  applyPlantedSquatIk,
  applySquatFlexion,
  depth,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  applySquatFlexion: (depth: number) => void;
  depth: number;
}): MovementAvatarLowerBodySquatPoseApplicationResult {
  const plantedSquatIkDepth = applyPlantedSquatIk(depth);
  applySquatFlexion(depth);

  return {
    appliedSquatFlexion: true,
    plantedSquatIkDepth,
  };
}

export function applyMovementAvatarLowerBodyNonRetargetApplicationPlan({
  applyLegRaise,
  applyNeutral,
  applySquat,
  plan,
  plantInstructorFeet,
}: {
  applyLegRaise: (side: "left" | "right", depth: number) => void;
  applyNeutral: () => void;
  applySquat: (depth: number) => number;
  plan: MovementAvatarLowerBodyApplicationPlan;
  plantInstructorFeet: (sides: MovementAvatarInstructorFootPlantSide[]) => void;
}): MovementAvatarLowerBodyNonRetargetApplicationResult {
  if (plan.mode === "retarget") {
    return {
      feetOwner: null,
      handled: false,
      lowerBodyOwner: null,
      plantedSquatIkDepth: null,
    };
  }

  let plantedSquatIkDepth: number | null = null;

  if (plan.mode === "inactive-neutral" || plan.mode === "player-neutral") {
    applyNeutral();
  } else if (plan.mode === "player-leg-raise") {
    applyLegRaise(plan.side, plan.depth);
  } else if (plan.mode === "player-squat") {
    plantedSquatIkDepth = applySquat(plan.depth);
    if (plan.shouldEaseLowerBodyToNeutral) {
      applyNeutral();
    }
  } else if (plan.mode === "recorded-neutral") {
    applyNeutral();
    plantInstructorFeet(plan.plantInstructorFeet);
  }

  return {
    feetOwner: plan.feetOwner,
    handled: true,
    lowerBodyOwner: plan.lowerBodyOwner,
    plantedSquatIkDepth,
  };
}

export function applyMovementAvatarLowerBodyNonRetargetApplicationPlanToVrmBones({
  applyPlantedSquatIk,
  currentFeetOwner,
  isPlayer,
  lookupBone,
  plan,
  singleLegRaiseSlerp,
  squatFlexionBendBoost,
  squatFlexionSlerp,
  lowerBodyNeutralSlerp,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  currentFeetOwner: string;
  isPlayer: boolean;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  plan: MovementAvatarLowerBodyApplicationPlan;
  singleLegRaiseSlerp: number;
  squatFlexionBendBoost?: number;
  squatFlexionSlerp: number;
  lowerBodyNeutralSlerp: number;
}): MovementAvatarLowerBodyNonRetargetApplicationResult {
  return applyMovementAvatarLowerBodyNonRetargetApplicationPlan({
    applyLegRaise: (side, depth) => {
      applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
        depth,
        lookupBone,
        side,
        slerp: singleLegRaiseSlerp,
      });
    },
    applyNeutral: () => {
      applyMovementAvatarLowerBodyNeutralPoseApplicationToVrmBones({
        lookupBone,
        slerp: lowerBodyNeutralSlerp,
      });
    },
    applySquat: (depth) => applyMovementAvatarLowerBodySquatPoseApplication({
      applyPlantedSquatIk,
      applySquatFlexion: (squatDepth) => {
        applyMovementAvatarSquatFlexionPoseApplicationToVrmBones({
          bendBoost: squatFlexionBendBoost,
          depth: squatDepth,
          lookupBone,
          slerp: squatFlexionSlerp,
        });
      },
      depth,
    }).plantedSquatIkDepth,
    plan,
    plantInstructorFeet: (sides) => {
      applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
        currentFeetOwner,
        isPlayer,
        lookupBone,
        sides,
      });
    },
  });
}

export function applyMovementAvatarLowerBodyRetargetPostPlanApplication({
  applyLegRaise,
  applyPlantedSquatIk,
  applySolvedLowerBody,
  applySquatFlexion,
  plan,
  plantInstructorFeet,
}: {
  applyLegRaise: (side: "left" | "right", depth: number) => void;
  applyPlantedSquatIk: (depth: number) => number;
  applySolvedLowerBody: (depth: number) => void;
  applySquatFlexion: (depth: number) => void;
  plan: MovementAvatarLowerBodyRetargetApplicationPlan;
  plantInstructorFeet: (sides: MovementAvatarInstructorFootPlantSide[]) => void;
}): MovementAvatarLowerBodyRetargetPostPlanApplicationResult {
  let appliedSolvedLowerBody = false;
  let appliedSquatFlexion = false;
  let appliedLegRaiseOverlay = false;

  if (plan.solvedLowerBodyDepth !== null) {
    applySolvedLowerBody(plan.solvedLowerBodyDepth);
    appliedSolvedLowerBody = true;
  }

  const plantedSquatIkDepth = applyPlantedSquatIk(plan.plantedSquatIkDepth);

  if (plan.squatFlexionDepth !== null) {
    applySquatFlexion(plan.squatFlexionDepth);
    appliedSquatFlexion = true;
  }

  if (plan.legRaiseOverlay) {
    applyLegRaise(plan.legRaiseOverlay.side, plan.legRaiseOverlay.depth);
    appliedLegRaiseOverlay = true;
  }

  plantInstructorFeet(plan.plantInstructorFeet);

  return {
    appliedLegRaiseOverlay,
    appliedSolvedLowerBody,
    appliedSquatFlexion,
    plantedSquatIkDepth,
  };
}

export function applyMovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBones({
  applyPlantedSquatIk,
  contacts,
  currentFeetOwner,
  isPlayer,
  lookupBone,
  plan,
  singleLegRaiseSlerp,
  solvedLowerBodySlerp,
  solvedLowerBodySources,
  squatFlexionBendBoost,
  squatFlexionSlerp,
  storeLastGood,
}: {
  applyPlantedSquatIk: (depth: number) => number;
  contacts?: MovementAvatarInstructorFootPlantContacts;
  currentFeetOwner: string;
  isPlayer: boolean;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  plan: MovementAvatarLowerBodyRetargetApplicationPlan;
  singleLegRaiseSlerp: number;
  solvedLowerBodySlerp: number;
  solvedLowerBodySources: MovementAvatarLowerBodyRigRotationSources;
  squatFlexionBendBoost?: number;
  squatFlexionSlerp: number;
  storeLastGood?: (bone: string, quaternion: THREE.Quaternion) => void;
}): MovementAvatarLowerBodyRetargetPostPlanApplicationToVrmBonesResult {
  let feetOwner = currentFeetOwner;
  const result = applyMovementAvatarLowerBodyRetargetPostPlanApplication({
    applyLegRaise: (side, depth) => {
      applyMovementAvatarSingleLegRaisePoseApplicationToVrmBones({
        depth,
        lookupBone,
        side,
        slerp: singleLegRaiseSlerp,
      });
    },
    applyPlantedSquatIk,
    applySolvedLowerBody: (depth) => {
      applyMovementAvatarSolvedLowerBodyPoseApplicationToVrmBones({
        depth,
        lookupBone,
        slerp: solvedLowerBodySlerp,
        sources: solvedLowerBodySources,
        storeLastGood,
      });
    },
    applySquatFlexion: (depth) => {
      applyMovementAvatarSquatFlexionPoseApplicationToVrmBones({
        bendBoost: squatFlexionBendBoost,
        depth,
        lookupBone,
        slerp: squatFlexionSlerp,
      });
    },
    plan,
    plantInstructorFeet: (sides) => {
      const plantResult = applyMovementAvatarInstructorFootPlantRequestsToVrmBones({
        contacts,
        currentFeetOwner: feetOwner,
        isPlayer,
        lookupBone,
        sides,
      });
      feetOwner = plantResult.feetOwner;
    },
  });

  return {
    ...result,
    feetOwner,
  };
}

export function applyMovementAvatarLowerBodyRetargetSegmentCounts({
  current,
  segmentCounts,
}: {
  current: MovementAvatarLowerBodyRetargetAppliedCounts;
  segmentCounts: MovementAvatarLowerBodyRetargetSegmentCounts;
}): MovementAvatarLowerBodyRetargetSegmentCountApplicationResult {
  const feet = current.feet + segmentCounts.feet;
  const legs = current.legs + segmentCounts.legs;
  const lowerBody = current.lowerBody + segmentCounts.applied;

  return {
    feet,
    footOwnerOverride: segmentCounts.feet > 0 ? "recorded-retarget" : null,
    legs,
    lowerBody,
  };
}

export function resolveMovementAvatarLowerBodyApplicationPlan({
  lowerBodyDrive,
  lowerBodyTarget,
}: {
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTarget: MovementAvatarLowerBodyTargetDecision;
}): MovementAvatarLowerBodyApplicationPlan {
  const stageDecision = lowerBodyTarget.stageDecision;

  if (!stageDecision) {
    return {
      feetOwner: lowerBodyTarget.feetOwner,
      lowerBodyOwner: lowerBodyTarget.lowerBodyOwner,
      mode: "inactive-neutral",
      shouldEaseLowerBodyToNeutral: true,
      stageDecision: null,
    };
  }

  if (stageDecision.stage === "player-leg-raise" && stageDecision.anchoredPlayerLegRaiseSide) {
    return {
      depth: lowerBodyDrive.playerLegRaiseDepth,
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "player-leg-raise",
      side: stageDecision.anchoredPlayerLegRaiseSide,
      stageDecision,
    };
  }

  if (stageDecision.stage === "player-squat") {
    return {
      depth: lowerBodyTarget.playerSquatPresentationDepth,
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "player-squat",
      shouldEaseLowerBodyToNeutral: lowerBodyTarget.playerSquatPresentationDepth <= 0.16,
      stageDecision,
    };
  }

  if (stageDecision.stage === "player-neutral") {
    return {
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "player-neutral",
      shouldEaseLowerBodyToNeutral: true,
      stageDecision,
    };
  }

  if (stageDecision.stage === "recorded-neutral") {
    return {
      feetOwner: stageDecision.feetOwner,
      lowerBodyOwner: stageDecision.lowerBodyOwner,
      mode: "recorded-neutral",
      plantInstructorFeet: ["right", "left"],
      shouldEaseLowerBodyToNeutral: true,
      stageDecision,
    };
  }

  return {
    feetOwner: lowerBodyTarget.feetOwner,
    lowerBodyOwner: lowerBodyTarget.lowerBodyOwner,
    mode: "retarget",
    stageDecision,
  };
}

export function resolveMovementAvatarLowerBodyRetargetApplicationPlan({
  appliedDecision,
  avatarRole,
  balancedPlantedSquatDepth,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  playerSquatPresentationDepth,
  retargetAppliedLowerBody,
  stageDecision,
}: {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerSquatPresentationDepth: number;
  retargetAppliedLowerBody: number;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
}): MovementAvatarLowerBodyRetargetApplicationPlan {
  const isPlayer = avatarRole === "player";
  const solvedLowerBodyDepth = appliedDecision.shouldUseLegacyLowerBody
    ? isPlayer ? lowerBodyDrive.liveSquatDepth : instructorSquatPresentationDepth
    : null;
  const plantedSquatIkDepth = isPlayer
    ? playerSquatPresentationDepth
    : appliedDecision.shouldUseLegacyLowerBody && balancedPlantedSquatDepth > 0
      ? instructorSquatPresentationDepth
      : 0;
  const squatFlexionDepth =
    appliedDecision.shouldUseLegacyLowerBody || appliedDecision.shouldUseRecordedSquatPresentation
      ? playerSquatPresentationDepth
      : null;
  const legRaiseOverlay = stageDecision.anchoredPlayerLegRaiseSide
    ? {
        depth: lowerBodyDrive.playerLegRaiseDepth,
        side: stageDecision.anchoredPlayerLegRaiseSide,
      }
    : null;
  const plantInstructorFeet: Array<"left" | "right"> = [];
  if (!isPlayer) {
    plantInstructorFeet.push("right", "left");
  }

  return {
    legRaiseOverlay,
    plantedSquatIkDepth,
    plantInstructorFeet,
    shouldApplyLegacyAim: retargetAppliedLowerBody < 4 || appliedDecision.shouldUsePlayerFootFallback,
    solvedLowerBodyDepth,
    squatFlexionDepth,
  };
}

export function resolveMovementAvatarLowerBodyRetargetDecisionApplication({
  appliedDecision,
  avatarRole,
  balancedPlantedSquatDepth,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  playerSquatPresentationDepth,
  retargetAppliedLowerBody,
  stageDecision,
}: {
  appliedDecision: MovementAvatarAppliedLowerBodyDecision;
  avatarRole: "instructor" | "player";
  balancedPlantedSquatDepth: number;
  instructorSquatPresentationDepth: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerSquatPresentationDepth: number;
  retargetAppliedLowerBody: number;
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision;
}): MovementAvatarLowerBodyRetargetDecisionApplication {
  return {
    appliedDecision,
    feetOwner: appliedDecision.feetOwner,
    lowerBodyOwner: appliedDecision.lowerBodyOwner,
    retargetApplicationPlan: resolveMovementAvatarLowerBodyRetargetApplicationPlan({
      appliedDecision,
      avatarRole,
      balancedPlantedSquatDepth,
      instructorSquatPresentationDepth,
      lowerBodyDrive,
      playerSquatPresentationDepth,
      retargetAppliedLowerBody,
      stageDecision,
    }),
  };
}

export function resolveMovementAvatarLowerBodyRetargetDecisionApplicationFromInput({
  appliedFootSegments,
  appliedLegSegments,
  appliedLowerBodySegments,
  avatarRole,
  balancedPlantedSquatDepth,
  instructorSquatPresentationDepth,
  lowerBodyDrive,
  lowerBodySegmentMotion,
  lowerBodyTrackingReady,
  playerRetargetLowerBodyMotion,
  playerSquatPresentationDepth,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose,
  stageDecision,
}: MovementAvatarLowerBodyRetargetDecisionApplicationInput): MovementAvatarLowerBodyRetargetDecisionApplication {
  const appliedDecision = resolveMovementAvatarAppliedLowerBodyDecision({
    appliedFootSegments,
    appliedLegSegments,
    appliedLowerBodySegments,
    avatarRole,
    balancedPlantedSquatDepth,
    instructorSquatPresentationDepth,
    lowerBodyDrive,
    lowerBodySegmentMotion,
    lowerBodyTrackingReady,
    playerRetargetLowerBodyMotion,
    retargetFrame,
    shouldApplyLowerBody,
    shouldHoldPlayerSquatPose,
  });

  return resolveMovementAvatarLowerBodyRetargetDecisionApplication({
    appliedDecision,
    avatarRole,
    balancedPlantedSquatDepth,
    instructorSquatPresentationDepth,
    lowerBodyDrive,
    playerSquatPresentationDepth,
    retargetAppliedLowerBody: appliedLowerBodySegments,
    stageDecision,
  });
}
