import type * as THREE from "three";
import type {
  MovementAvatarSupportContactLockDecision,
  MovementAvatarSupportPresentationDecision,
} from "./movementAvatarPipeline";
import {
  applyMovementAvatarSupportContactRuntimeFrame,
  type MovementAvatarSupportContactRuntimeFrameApplication,
  type MovementAvatarSupportContactRuntimeTelemetry,
} from "./movementAvatarSupportContactRuntime";
import {
  applyMovementAvatarSupportPresentationRuntimeToVrmBones,
  type MovementAvatarSupportPresentationRuntimeApplicationResult,
} from "./movementAvatarSupportPresentationRuntime";

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
