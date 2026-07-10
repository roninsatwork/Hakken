import type * as THREE from "three";
import type { MovementAvatarSupportPresentationRotationSpec } from "./movementAvatarLowerBodyApplication";
import { applyMovementAvatarSupportPresentationRotationSpecsToVrmBones } from "./movementAvatarLowerBodyRotationVrmAdapters";
import type { MovementAvatarSupportContactLockDecision, MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import { applyMovementAvatarSupportContactLocksToObjects, type MovementAvatarSupportContactObjectApplicationResult } from "./movementAvatarSupportContactApplication";

// --- movementAvatarSupportContactRuntime ---

function emptySupportContactRuntimeResult(): MovementAvatarSupportContactObjectApplicationResult {
  return {
    applied: false,
    appliedAnchors: 0,
    appliedBoneCorrection: 0,
    appliedRootCorrection: 0,
    supportContactCorrection: 0,
  };
}

export type MovementAvatarSupportContactRuntimeTelemetry = {
  anchorCount: number;
  correction: number;
  owner: string;
};

export type MovementAvatarSupportContactRuntimeFrameApplication = {
  application: MovementAvatarSupportContactObjectApplicationResult;
  telemetry: MovementAvatarSupportContactRuntimeTelemetry;
};

export function applyMovementAvatarSupportContactRuntimeLocks({
  avatarRoot,
  contactLocks,
  floorY,
  lookupBone,
  scene,
}: {
  avatarRoot: THREE.Object3D | null | undefined;
  contactLocks: MovementAvatarSupportContactLockDecision;
  floorY: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
}): MovementAvatarSupportContactObjectApplicationResult {
  if (!avatarRoot || !scene || !contactLocks.shouldApply) {
    return emptySupportContactRuntimeResult();
  }

  return applyMovementAvatarSupportContactLocksToObjects({
    avatarRoot,
    contactLocks,
    floorY,
    lookupBone,
    scene,
  });
}

export function applyMovementAvatarSupportContactRuntimeFrame({
  avatarRoot,
  contactLocks,
  floorY,
  lookupBone,
  scene,
}: {
  avatarRoot: THREE.Object3D | null | undefined;
  contactLocks: MovementAvatarSupportContactLockDecision;
  floorY: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
}): MovementAvatarSupportContactRuntimeFrameApplication {
  const application = applyMovementAvatarSupportContactRuntimeLocks({
    avatarRoot,
    contactLocks,
    floorY,
    lookupBone,
    scene,
  });

  return {
    application,
    telemetry: {
      anchorCount: application.applied ? application.appliedAnchors : 0,
      correction: application.applied ? application.supportContactCorrection : 0,
      owner: contactLocks.owner,
    },
  };
}

// --- movementAvatarSupportPresentationRuntime ---

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

// --- movementAvatarSupportFrameRuntime ---

type MovementAvatarSupportPresentationFrameInput = Pick<
  MovementAvatarSupportPresentationDecision,
  "armSpecs" | "owner" | "shouldApply" | "specs" | "spineSpecs"
>;

export type MovementAvatarSupportFrameRuntimeResult = {
  nextLowerBodyOwner: string | null;
  supportContactRuntimeApplication: MovementAvatarSupportContactRuntimeFrameApplication;
  supportContactTelemetry: MovementAvatarSupportContactRuntimeTelemetry;
  supportPresentationApplication: MovementAvatarSupportPresentationRuntimeApplicationResult;
};

export function applyMovementAvatarSupportFrameRuntime({
  avatarRoot,
  contactLocks,
  currentLowerBodyOwner,
  floorY,
  lookupBone,
  scene,
  supportPresentation,
}: {
  avatarRoot: THREE.Object3D | null | undefined;
  contactLocks: MovementAvatarSupportContactLockDecision;
  currentLowerBodyOwner: string | null;
  floorY: number;
  lookupBone: (bone: string) => THREE.Object3D | null | undefined;
  scene: THREE.Object3D | null | undefined;
  supportPresentation: MovementAvatarSupportPresentationFrameInput;
}): MovementAvatarSupportFrameRuntimeResult {
  const supportPresentationApplication = applyMovementAvatarSupportPresentationRuntimeToVrmBones({
    lookupBone,
    supportPresentation,
  });
  const supportContactRuntimeApplication = applyMovementAvatarSupportContactRuntimeFrame({
    avatarRoot,
    contactLocks,
    floorY,
    lookupBone,
    scene,
  });

  return {
    nextLowerBodyOwner: supportPresentationApplication.owner ?? currentLowerBodyOwner,
    supportContactRuntimeApplication,
    supportContactTelemetry: supportContactRuntimeApplication.telemetry,
    supportPresentationApplication,
  };
}

// --- movementAvatarSupportFrameOrchestrationRuntime ---

type MovementAvatarSupportFrameRuntimeInput = Parameters<typeof applyMovementAvatarSupportFrameRuntime>[0];

export type MovementAvatarSupportFrameOrchestrationRuntimeResult = {
  lowerBodyOwner: string;
  supportContactTelemetry: MovementAvatarSupportContactRuntimeTelemetry;
  supportFrameRuntime: MovementAvatarSupportFrameRuntimeResult;
};

export function applyMovementAvatarSupportFrameOrchestrationRuntime({
  currentLowerBodyOwner,
  ...input
}: MovementAvatarSupportFrameRuntimeInput): MovementAvatarSupportFrameOrchestrationRuntimeResult {
  const supportFrameRuntime = applyMovementAvatarSupportFrameRuntime({
    ...input,
    currentLowerBodyOwner,
  });

  return {
    lowerBodyOwner: supportFrameRuntime.nextLowerBodyOwner ?? currentLowerBodyOwner ?? "neutral",
    supportContactTelemetry: supportFrameRuntime.supportContactTelemetry,
    supportFrameRuntime,
  };
}

