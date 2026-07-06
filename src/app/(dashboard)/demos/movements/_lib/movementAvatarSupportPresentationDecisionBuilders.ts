import type {
  MovementAvatarBoneRotationSpec,
  MovementAvatarLowerBodyBoneName,
  MovementAvatarSpineBoneName,
  MovementAvatarSpineBoneRotationSpec,
  MovementAvatarSupportPresentationArmBoneName,
  MovementAvatarSupportPresentationArmRotationSpec,
  MovementAvatarSupportPresentationDecision,
  MovementAvatarSupportPresentationFloorPoseDecision,
  MovementAvatarSupportPresentationStandingPoseDecision,
} from "./movementAvatarPipeline";

export function emptyMovementAvatarFloorPose(): MovementAvatarSupportPresentationFloorPoseDecision {
  return {
    bearCrawlDepth: 0,
    bridgeLiftDepth: 0,
    catDepth: 0,
    childFoldDepth: 0,
    cowDepth: 0,
    downDogPikeDepth: 0,
    key: "none",
    pilatesClamDepth: 0,
    pilatesDeadBugDepth: 0,
    pilatesDoubleLegStretchDepth: 0,
    pilatesHollowHoldDepth: 0,
    pilatesHundredDepth: 0,
    pilatesSingleLegStretchDepth: 0,
    pilatesSwimmingDepth: 0,
    plankLineDepth: 0,
    proneExtensionDepth: 0,
    sideLegLiftDepth: 0,
  };
}

export function movementAvatarFloorPose(
  overrides: Partial<MovementAvatarSupportPresentationFloorPoseDecision>,
): MovementAvatarSupportPresentationFloorPoseDecision {
  return {
    ...emptyMovementAvatarFloorPose(),
    ...overrides,
  };
}

export function emptyMovementAvatarStandingPose(): MovementAvatarSupportPresentationStandingPoseDecision {
  return {
    armRaiseDepth: 0,
    chairDepth: 0,
    foldDepth: 0,
    forwardLungeDepth: 0,
    halfLiftDepth: 0,
    jumpingJackDepth: 0,
    key: "none",
    sideLungeDepth: 0,
    treeDepth: 0,
    triangleDepth: 0,
    twistDepth: 0,
    warriorOneDepth: 0,
    warriorDepth: 0,
  };
}

export function movementAvatarStandingPose(
  overrides: Partial<MovementAvatarSupportPresentationStandingPoseDecision>,
): MovementAvatarSupportPresentationStandingPoseDecision {
  return {
    ...emptyMovementAvatarStandingPose(),
    ...overrides,
  };
}

export const movementAvatarSupportPresentationSpec = (
  bone: MovementAvatarLowerBodyBoneName,
  rotation: MovementAvatarBoneRotationSpec["rotation"],
  slerp = 0.18,
): MovementAvatarBoneRotationSpec => ({ bone, rotation, slerp });

export const movementAvatarSupportPresentationSpineSpec = (
  bone: MovementAvatarSpineBoneName,
  rotation: MovementAvatarSpineBoneRotationSpec["rotation"],
  slerp = 0.16,
): MovementAvatarSpineBoneRotationSpec => ({ bone, rotation, slerp });

export const movementAvatarSupportPresentationArmSpec = (
  bone: MovementAvatarSupportPresentationArmBoneName,
  rotation: MovementAvatarSupportPresentationArmRotationSpec["rotation"],
  slerp = 0.16,
): MovementAvatarSupportPresentationArmRotationSpec => ({ bone, rotation, slerp });

export function movementAvatarSupportPresentationDecision({
  armSpecs = [],
  floorPose = emptyMovementAvatarFloorPose(),
  owner,
  specs,
  standingPose = emptyMovementAvatarStandingPose(),
  spineSpecs = [],
}: {
  armSpecs?: MovementAvatarSupportPresentationArmRotationSpec[];
  floorPose?: MovementAvatarSupportPresentationFloorPoseDecision;
  owner: string;
  specs: MovementAvatarBoneRotationSpec[];
  standingPose?: MovementAvatarSupportPresentationStandingPoseDecision;
  spineSpecs?: MovementAvatarSpineBoneRotationSpec[];
}): MovementAvatarSupportPresentationDecision {
  return {
    armSpecs,
    floorPose,
    owner,
    shouldApply: true,
    specs,
    standingPose,
    spineSpecs,
  };
}

export function movementAvatarSupportPresentationNoneDecision(
  owner = "support-presentation-none",
): MovementAvatarSupportPresentationDecision {
  return {
    armSpecs: [],
    floorPose: emptyMovementAvatarFloorPose(),
    owner,
    shouldApply: false,
    specs: [],
    standingPose: emptyMovementAvatarStandingPose(),
    spineSpecs: [],
  };
}
