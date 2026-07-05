import {
  isMovementAvatarLowerBodyTrackingReady,
  resolveMovementAvatarLowerBodyDrive,
  resolveMovementAvatarPlayerLowerBodyOwners,
  type MovementAvatarLowerBodyDrive,
  type MovementAvatarPlayerLowerBodyOwnerDecision,
} from "./movementAvatarLowerBody";
import {
  resolveMovementAvatarPlayerSpineDrive,
  resolveMovementAvatarRecordedSpineDrive,
  type MovementAvatarPlayerSpineDrive,
} from "./movementAvatarPlayerDrive";
import {
  classifyMovementBodyOrientation,
  shouldHoldUnsupportedBodyOrientation,
  type MovementBodyOrientationDecision,
} from "./movementBodyOrientation";
import {
  resolveMovementSupportContacts,
  type MovementContactPoint,
  type MovementSupportContactDecision,
} from "./movementSupportContact";
import {
  resolveMovementExercisePose,
  type MovementExercisePoseDecision,
} from "./movementExercisePose";
import {
  resolveMovementSupportIntent,
  type MovementSupportIntentDecision,
} from "./movementSupportIntent";
import {
  resolveMovementSupportConstraint,
  type MovementSupportConstraintDecision,
} from "./movementSupportConstraint";
import {
  getRecordedLowerBodySegmentMotionDepth,
  solveMovementRetargetFrame,
  type MovementRetargetFrame,
  type MovementRetargetSegmentName,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  applyHeadCalibration,
  estimateMovementHeadAngles,
  getMovementBodyConfidence,
  getMovementLowerBodyIntent,
  getNeutralMovementHeadAngles,
  selectMovementKneeTarget,
  selectMovementTrackingEndpoint,
  type MovementAvatarTrackingProfile,
  type MovementCalibration,
  type MovementHandsForConfidence,
  type MovementHeadAngles,
  type MovementHeadMotionIntent,
  type MovementLowerBodyIntent,
  type MovementTrackingEndpointSelection,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementAvatarSourceOrigin = "replay" | "studio";

export type MovementAvatarSource = {
  poseLandmarks: TrackingLandmark[];
  hands?: MovementHandsForConfidence;
};

export type MovementAvatarPipelineInput = {
  avatarTrackingProfile?: MovementAvatarTrackingProfile;
  avatarRole: "instructor" | "player";
  calibration: MovementCalibration | null;
  retargetSourceModel: MovementRetargetSourceModel | null;
  shouldHoldPlayerSquatPose?: boolean;
  source: MovementAvatarSource;
  sourceOrigin: MovementAvatarSourceOrigin;
};

export type MovementAvatarSourceWrapperInput = Omit<MovementAvatarPipelineInput, "sourceOrigin">;

export type MovementAvatarLowerBodySourceBounds = {
  lowerOutOfFrameCount: number;
  maxY: number;
  reliable: boolean;
};

export type MovementAvatarArmSide = "left" | "right";

export type MovementAvatarArmDecision = {
  endpointConfidence: number;
  isTrackingReady: boolean;
  side: MovementAvatarArmSide;
  unreadyFallback: "hold-last-good" | "relax";
};

export type MovementAvatarTargetLandmark = {
  x: number;
  y: number;
  z: number;
  visibility: number;
  isSnapped?: boolean;
};

export type MovementAvatarArmTargetDecision = {
  elbowTarget: MovementAvatarTargetLandmark | null;
  frontBias: number;
  safeZScale?: number;
  wristSource: string;
  wristTarget: MovementAvatarTargetLandmark | null;
};

export type MovementAvatarArmTargetsDecision = {
  left: MovementAvatarArmTargetDecision;
  right: MovementAvatarArmTargetDecision;
};

export type MovementAvatarHeadDecision = {
  appliedHead: MovementHeadAngles;
  headOwner: string;
  headPitch: number;
  headRoll: number;
  headYaw: number;
  shouldApplyHeadMotion: boolean;
  shouldApplyPlayerHeadMotion: boolean;
};

export type MovementAvatarRawHeadDecision = {
  faceLandmarks: TrackingLandmark[] | null;
  rawHead: MovementHeadAngles;
};

export type MovementAvatarAppliedLowerBodyDecision = {
  feetOwner: string;
  lowerBodyOwner: string;
  playerAppliedOwnerDecision: MovementAvatarPlayerLowerBodyOwnerDecision | null;
  retargetOwnsLowerBody: boolean;
  shouldUseLegacyLowerBody: boolean;
  shouldUsePlayerFootFallback: boolean;
  shouldUseRecordedSquatPresentation: boolean;
};

export type MovementAvatarLowerBodyVisualState = {
  squatPresentationDepth: number;
  visualRootDrop: number;
};

export type MovementAvatarPlayerLegRaiseHoldState = {
  depth: number;
  expiresAt: number;
  side: "left" | "right" | null;
};

export type MovementAvatarPlayerLegRaiseHoldDecision = {
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  state: MovementAvatarPlayerLegRaiseHoldState;
  wasHeld: boolean;
};

export type MovementAvatarLowerBodyVisualDecision = {
  instructorSquatPresentationDepth: number;
  playerSquatPresentationDepth: number;
  state: MovementAvatarLowerBodyVisualState;
  visualRootDrop: number;
};

export type MovementAvatarLowerBodyApplicationStage =
  | "player-leg-raise"
  | "player-neutral"
  | "player-squat"
  | "recorded-neutral"
  | "retarget";

export type MovementAvatarLowerBodyApplicationStageDecision = {
  anchoredPlayerLegRaiseSide: "left" | "right" | null;
  canUsePlayerRetargetLegRaise: boolean;
  feetOwner: string;
  lowerBodyOwner: string;
  stage: MovementAvatarLowerBodyApplicationStage;
};

export type MovementAvatarRetargetSegmentType = "arm" | "foot" | "leg" | "spine";

export type MovementAvatarRetargetSegmentApplicationDecision = {
  reason:
    | "active"
    | "low-confidence"
    | "recorded-foot-low-motion"
    | "recorded-foot-planted"
    | "recorded-foot-low-knee-lift";
  shouldApply: boolean;
  slerp: number;
  zScale: number;
};

export type MovementAvatarInactiveLowerBodyDecision = {
  feetOwner: string | null;
  lowerBodyOwner: string | null;
};

export type MovementAvatarPlayerSourceOwnerDecision = {
  lowerBodyOwnerDecision: MovementAvatarPlayerLowerBodyOwnerDecision | null;
  playerRetargetLowerBodyMotion: number;
};

export type MovementAvatarLowerBodyTargetSelectionsDecision = {
  endpointVisibilityThreshold: number;
  leftAnkle: MovementTrackingEndpointSelection;
  leftKnee: MovementTrackingEndpointSelection;
  leftToe: MovementTrackingEndpointSelection;
  rightAnkle: MovementTrackingEndpointSelection;
  rightKnee: MovementTrackingEndpointSelection;
  rightToe: MovementTrackingEndpointSelection;
};

export type MovementAvatarTrackingFallbackLabelsDecision = {
  armDepth: string;
  baseline: string;
  floor: string;
  head: string;
  headMotion: string;
  leftArm: string;
  leftFoot: string;
  leftKnee: string;
  lowerBody: string;
  owners: string;
  rightArm: string;
  rightFoot: string;
  rightKnee: string;
  spine: string;
};

export type MovementAvatarRetargetDebugLabelInput = {
  appliedLowerBody: number;
  appliedUpperBody: number;
  hipDrop: number;
  leftFootContact: boolean;
  leftKneeLift: number;
  lowerBodySegmentMotion: number;
  plantedSquatIkDepth: number;
  rightFootContact: boolean;
  rightKneeLift: number;
  solvedSegments: number;
  sourceQuality: number;
  squatDepth: number;
  totalLowerBody: number;
  totalSegments: number;
  totalUpperBody: number;
  visualRootDrop: number;
};

export type MovementAvatarFootLockDebugLabelInput = {
  correction: number;
  drift: number;
  strength: number;
};

export type MovementAvatarAimOptionsDecision = {
  frontBias?: number;
  minVectorLengthSq: number;
  slerpOverride: number;
  storeVisibilityThreshold?: number;
  visibilityThreshold: number;
  zScale?: number;
};

export type MovementAvatarArmAimOptionsDecision = {
  lowerArm: MovementAvatarAimOptionsDecision;
  upperArm: MovementAvatarAimOptionsDecision;
};

export type MovementAvatarLegacyLowerBodyAimOptionsDecision = {
  foot: MovementAvatarAimOptionsDecision;
  leg: MovementAvatarAimOptionsDecision;
};

export type MovementAvatarPlantedSquatIkOptionsDecision = {
  footSlerp: number;
  legSlerp: number;
};

export type MovementAvatarHipsPositionOptionsDecision = {
  avatarRootVisualLerp: number;
  floorContactCorrectionScale: number;
  rootLerp: number;
  shouldUseCalibratedFloorCorrection: boolean;
  squatHipDropLimit: number;
  squatHipDropScale: number;
};

export type MovementAvatarHipsApplicationDecision = {
  shouldApplyFloorContactCorrection: boolean;
  shouldApplySquatDrop: boolean;
  squatDrop: number;
};

export type MovementAvatarBoneEaseOptionsDecision = {
  armRelaxedSlerp: number;
  demoFallbackSlerp: number;
  handNeutralSlerp: number;
  lowerBodyNeutralSlerp: number;
  singleLegRaiseSlerp: number;
  solvedLowerBodySlerp: number;
  squatFlexionSlerp: number;
};

export type MovementAvatarLowerBodyBoneName =
  | "leftFoot"
  | "leftLowerLeg"
  | "leftUpperLeg"
  | "rightFoot"
  | "rightLowerLeg"
  | "rightUpperLeg";

export type MovementAvatarLowerBodyChildBoneName =
  | "leftFoot"
  | "leftLowerLeg"
  | "leftToes"
  | "rightFoot"
  | "rightLowerLeg"
  | "rightToes";

export type MovementAvatarLowerBodyRigSourceBoneName =
  | "LeftLowerLeg"
  | "LeftUpperLeg"
  | "RightLowerLeg"
  | "RightUpperLeg";

export type MovementAvatarLegacyLowerBodyAimTargetName =
  | "leftAnkle"
  | "leftKnee"
  | "leftToe"
  | "rightAnkle"
  | "rightKnee"
  | "rightToe";

export type MovementAvatarBoneRotationSpec = {
  bone: MovementAvatarLowerBodyBoneName;
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  slerp: number;
};

export type MovementAvatarSupportPresentationArmBoneName =
  | "leftHand"
  | "leftLowerArm"
  | "leftUpperArm"
  | "rightHand"
  | "rightLowerArm"
  | "rightUpperArm";

export type MovementAvatarSupportPresentationArmRotationSpec = {
  bone: MovementAvatarSupportPresentationArmBoneName;
  rotation: { x: number; y: number; z: number };
  slerp: number;
};

export type MovementAvatarSupportPresentationFloorPoseDecision = {
  bearCrawlDepth: number;
  bridgeLiftDepth: number;
  catDepth: number;
  childFoldDepth: number;
  cowDepth: number;
  downDogPikeDepth: number;
  pilatesClamDepth: number;
  pilatesDeadBugDepth: number;
  pilatesDoubleLegStretchDepth: number;
  pilatesHollowHoldDepth: number;
  key:
    | "bearCrawl"
    | "bridge"
    | "cat"
    | "childPose"
    | "cow"
    | "downDog"
    | "none"
    | "pilatesClam"
    | "pilatesDeadBug"
    | "pilatesDoubleLegStretch"
    | "pilatesHollowHold"
    | "pilatesHundred"
    | "pilatesSingleLegStretch"
    | "pilatesSwimming"
    | "plank"
    | "proneExtension"
    | "sideLegLift";
  pilatesHundredDepth: number;
  pilatesSingleLegStretchDepth: number;
  pilatesSwimmingDepth: number;
  plankLineDepth: number;
  proneExtensionDepth: number;
  sideLegLiftDepth: number;
};

export type MovementAvatarSupportPresentationStandingPoseDecision = {
  armRaiseDepth: number;
  chairDepth: number;
  foldDepth: number;
  forwardLungeDepth: number;
  halfLiftDepth: number;
  jumpingJackDepth: number;
  key:
    | "armRaise"
    | "chair"
    | "forwardFold"
    | "forwardLunge"
    | "halfLift"
    | "jumpingJack"
    | "none"
    | "sideLunge"
    | "standingTwist"
    | "tree"
    | "triangle"
    | "warriorOne"
    | "warriorTwo";
  treeDepth: number;
  triangleDepth: number;
  sideLungeDepth: number;
  twistDepth: number;
  warriorOneDepth: number;
  warriorDepth: number;
};

export type MovementAvatarSupportPresentationDecision = {
  armSpecs: MovementAvatarSupportPresentationArmRotationSpec[];
  floorPose: MovementAvatarSupportPresentationFloorPoseDecision;
  owner: string;
  shouldApply: boolean;
  specs: MovementAvatarBoneRotationSpec[];
  standingPose: MovementAvatarSupportPresentationStandingPoseDecision;
  spineSpecs: MovementAvatarSpineBoneRotationSpec[];
};

export type MovementAvatarSupportContactBoneName =
  | MovementAvatarLowerBodyBoneName
  | MovementAvatarSpineBoneName
  | MovementAvatarSupportPresentationArmBoneName;

export type MovementAvatarSupportContactAnchor = {
  bone: MovementAvatarSupportContactBoneName;
  label: string;
  surface: "chair" | "floor";
  targetOffsetFromFloor: number;
  weight: number;
};

export type MovementAvatarSupportContactLockDecision = {
  anchors: MovementAvatarSupportContactAnchor[];
  boneCorrectionScale: number;
  maxCorrection: number;
  maxBoneCorrection: number;
  owner: string;
  rootCorrectionScale: number;
  shouldApply: boolean;
  slerp: number;
  status: "active" | "inactive" | "partial";
};

function emptyMovementAvatarFloorPose(): MovementAvatarSupportPresentationFloorPoseDecision {
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

function movementAvatarFloorPose(
  overrides: Partial<MovementAvatarSupportPresentationFloorPoseDecision>,
): MovementAvatarSupportPresentationFloorPoseDecision {
  return {
    ...emptyMovementAvatarFloorPose(),
    ...overrides,
  };
}

function emptyMovementAvatarStandingPose(): MovementAvatarSupportPresentationStandingPoseDecision {
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

function movementAvatarStandingPose(
  overrides: Partial<MovementAvatarSupportPresentationStandingPoseDecision>,
): MovementAvatarSupportPresentationStandingPoseDecision {
  return {
    ...emptyMovementAvatarStandingPose(),
    ...overrides,
  };
}

export type MovementAvatarRigRotationSpec = {
  bone: MovementAvatarLowerBodyBoneName;
  limits: Partial<Record<"x" | "y" | "z", number>>;
  remember: boolean;
  scale: number;
  slerp: number;
  source: MovementAvatarLowerBodyRigSourceBoneName;
};

export type MovementAvatarLegacyLowerBodyAimSpec = {
  bone: MovementAvatarLowerBodyBoneName;
  child: MovementAvatarLowerBodyChildBoneName;
  options: "foot" | "leg";
  source:
    | {
        index: number;
        type: "landmark";
      }
    | {
        target: MovementAvatarLegacyLowerBodyAimTargetName;
        type: "target";
      };
  target: MovementAvatarLegacyLowerBodyAimTargetName;
};

export type MovementAvatarBasisDirection = {
  down: number;
  forward: number;
  side: number;
};

export type MovementAvatarBoneDirectionSpec = {
  bone: MovementAvatarLowerBodyBoneName;
  direction: MovementAvatarBasisDirection;
  slerp: number;
};

export type MovementAvatarPlantedSquatIkPoseDecision = {
  ikDepth: number;
  specs: MovementAvatarBoneDirectionSpec[];
};

export type MovementAvatarSpineBoneName = "chest" | "hips" | "spine" | "upperChest";

export type MovementAvatarSpineBoneRotationSpec = {
  bone: MovementAvatarSpineBoneName;
  rotation: { x: number; y: number; z: number };
  slerp: number;
};

export type MovementAvatarSpineSolverSourceName = "hips" | "spine";

export type MovementAvatarSpineSolverSpec = {
  bone: MovementAvatarSpineBoneName;
  limits: Partial<Record<"x" | "y" | "z", number>>;
  mirrorZ: boolean;
  scale: number;
  slerp: number;
  source: MovementAvatarSpineSolverSourceName;
};

export type MovementAvatarSpineApplyOptionsDecision = {
  activeDrive: {
    chest: number;
    hips: number;
    spine: number;
    upperChest: number;
  };
  shouldCountRecordedSpineRetarget: boolean;
  solver: {
    chest: number;
    hips: number;
    spine: number;
    upperChest: number;
  };
};

export type MovementAvatarHeadApplyOptionsDecision = {
  headPositionSlerp: number;
  headSlerp: number;
  upperChestCompensationSlerp: number;
};

export type MovementAvatarHeadApplicationPoseDecision = {
  headPositionOffset: { x: number; y: number; z: number } | null;
  neckRotation: { rotationOrder: "YXZ"; x: number; y: number; z: number } | null;
  upperChestCompensation: { x: number; y: number; z: number } | null;
};

export type MovementAvatarFootLockOptionsDecision = {
  correctionScale: number;
  engageSlerp: number;
  initialStrength: number;
  maxDriftBeforeReset: number;
  minStrengthBeforeClear: number;
  releaseSlerp: number;
};

export type MovementAvatarFootLockEngagementDecision = {
  shouldEngage: boolean;
};

export type MovementAvatarRootOrientationDecision = {
  heightLerp: number;
  owner: string;
  reason: string;
  shouldApply: boolean;
  shouldApplyHeight: boolean;
  slerp: number;
  targetHeightDrop: number;
  targetPitch: number;
  targetRoll: number;
};

export type MovementAvatarPipelineDecision = {
  bodyOrientation: MovementBodyOrientationDecision;
  bodySupport: MovementSupportContactDecision;
  exercisePose: MovementExercisePoseDecision;
  supportConstraint: MovementSupportConstraintDecision;
  supportContactLocks: MovementAvatarSupportContactLockDecision;
  supportIntent: MovementSupportIntentDecision;
  supportPresentation: MovementAvatarSupportPresentationDecision;
  bodyConfidence: Record<string, number>;
  feetOwner: string;
  leftArm: MovementAvatarArmDecision;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyIntent: MovementLowerBodyIntent;
  lowerBodyOwnerDecision: MovementAvatarPlayerLowerBodyOwnerDecision | null;
  lowerBodySegmentMotion: number;
  lowerBodySourceBounds: MovementAvatarLowerBodySourceBounds;
  lowerBodySourceReliable: boolean;
  lowerBodyTrackingReady: boolean;
  lowerLabel: string;
  lowerOwner: string;
  playerRetargetLowerBodyMotion: number;
  rawLowerBodyTrackingReady: boolean;
  retargetFrame: MovementRetargetFrame;
  retargetSolvedFeet: number;
  retargetSolvedLegs: number;
  rootOrientation: MovementAvatarRootOrientationDecision;
  rightArm: MovementAvatarArmDecision;
  shouldApplyLowerBody: boolean;
  shouldApplySolverTorso: boolean;
  shouldUseRetargetedUpperBody: boolean;
  spineDrive: MovementAvatarPlayerSpineDrive;
  torsoOwner: string;
  torsoTrackingReady: boolean;
  upperBodyTrackingReady: boolean;
};

const LOWER_BODY_SOURCE_LANDMARKS = [23, 24, 25, 26, 27, 28, 29, 30, 31, 32];
const LOWER_BODY_CORE_SOURCE_LANDMARKS = [23, 24, 25, 26];

const LOWER_BODY_SEGMENTS = new Set<MovementRetargetSegmentName>([
  "leftThigh",
  "leftShin",
  "rightThigh",
  "rightShin",
]);

const FOOT_SEGMENTS = new Set<MovementRetargetSegmentName>(["leftFoot", "rightFoot"]);

const UPPER_BODY_SEGMENTS = new Set<MovementRetargetSegmentName>([
  "spine",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
]);

function buildUnsupportedOrientationSpineDrive(
  bodyOrientation: MovementBodyOrientationDecision,
): MovementAvatarPlayerSpineDrive {
  return {
    confidence: bodyOrientation.confidence,
    forwardLean: 0,
    owner: "player-spine-held",
    rotations: {
      chest: { x: 0, y: 0, z: 0 },
      hips: { x: 0, y: 0, z: 0 },
      spine: { x: 0, y: 0, z: 0 },
      upperChest: { x: 0, y: 0, z: 0 },
    },
    shouldApplySpine: false,
    sideBend: 0,
    twist: 0,
  };
}

export function resolveMovementAvatarRootOrientation({
  bodyOrientation,
}: {
  bodyOrientation: MovementBodyOrientationDecision;
}): MovementAvatarRootOrientationDecision {
  if (
    bodyOrientation.orientation === "upright" &&
    (bodyOrientation.status === "supported" || bodyOrientation.status === "approximate")
  ) {
    return {
      heightLerp: 0.16,
      owner: "upright-root",
      reason: bodyOrientation.summary,
      shouldApply: false,
      shouldApplyHeight: false,
      slerp: 0.16,
      targetHeightDrop: 0,
      targetPitch: 0,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "seated") {
    return {
      heightLerp: 0.18,
      owner: "body-orientation-seated",
      reason: bodyOrientation.summary,
      shouldApply: false,
      shouldApplyHeight: true,
      slerp: 0.16,
      targetHeightDrop: 0.72,
      targetPitch: 0,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "kneeling") {
    return {
      heightLerp: 0.18,
      owner: "body-orientation-kneeling",
      reason: bodyOrientation.summary,
      shouldApply: false,
      shouldApplyHeight: true,
      slerp: 0.16,
      targetHeightDrop: 0.52,
      targetPitch: 0,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "quadruped") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-quadruped",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.12,
      targetHeightDrop: 0.82,
      targetPitch: -Math.PI / 2,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "sideLyingLeft") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-side-lying-left",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.12,
      targetHeightDrop: 0.9,
      targetPitch: 0,
      targetRoll: Math.PI / 2,
    };
  }

  if (bodyOrientation.orientation === "sideLyingRight") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-side-lying-right",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.12,
      targetHeightDrop: 0.9,
      targetPitch: 0,
      targetRoll: -Math.PI / 2,
    };
  }

  if (bodyOrientation.orientation === "supine") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-supine",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.1,
      targetHeightDrop: 0.9,
      targetPitch: Math.PI / 2,
      targetRoll: 0,
    };
  }

  if (bodyOrientation.orientation === "prone") {
    return {
      heightLerp: 0.14,
      owner: "body-orientation-prone",
      reason: bodyOrientation.summary,
      shouldApply: true,
      shouldApplyHeight: true,
      slerp: 0.1,
      targetHeightDrop: 0.9,
      targetPitch: -Math.PI / 2,
      targetRoll: 0,
    };
  }

  return {
    heightLerp: 0.16,
    owner: "upright-root-held",
    reason: bodyOrientation.summary,
    shouldApply: false,
    shouldApplyHeight: false,
    slerp: 0.16,
    targetHeightDrop: 0,
    targetPitch: 0,
    targetRoll: 0,
  };
}

export function getMovementAvatarLowerBodySourceBounds(
  landmarks: Array<{ x: number; y: number } | undefined>,
): MovementAvatarLowerBodySourceBounds {
  let lowerOutOfFrameCount = 0;
  let coreOutOfFrameCount = 0;
  let maxY = 0;

  LOWER_BODY_SOURCE_LANDMARKS.forEach((index) => {
    const landmark = landmarks[index];
    if (!landmark) return;
    maxY = Math.max(maxY, landmark.y);
    if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) {
      lowerOutOfFrameCount += 1;
    }
  });
  LOWER_BODY_CORE_SOURCE_LANDMARKS.forEach((index) => {
    const landmark = landmarks[index];
    if (!landmark) return;
    if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) {
      coreOutOfFrameCount += 1;
    }
  });

  return {
    lowerOutOfFrameCount,
    maxY,
    reliable: coreOutOfFrameCount === 0,
  };
}

export function countMovementRetargetSegments(
  frame: MovementRetargetFrame,
  segments: Set<MovementRetargetSegmentName>,
) {
  return frame.debug.solvedSegments.filter((name) => segments.has(name)).length;
}

export function buildMovementAvatarRetargetDebug({
  appliedLowerBody,
  appliedUpperBody,
  plantedSquatIkDepth = 0,
  retargetSourceModel,
  retargetFrame,
  visualRootDrop,
}: {
  appliedLowerBody?: number;
  appliedUpperBody?: number;
  plantedSquatIkDepth?: number;
  retargetSourceModel: MovementRetargetSourceModel | null;
  retargetFrame: MovementRetargetFrame;
  visualRootDrop: number;
}) {
  const solvedLowerBody = countMovementRetargetSegments(retargetFrame, LOWER_BODY_SEGMENTS) +
    countMovementRetargetSegments(retargetFrame, FOOT_SEGMENTS);
  const solvedUpperBody = countMovementRetargetSegments(retargetFrame, UPPER_BODY_SEGMENTS);

  return {
    appliedLowerBody: appliedLowerBody ?? solvedLowerBody,
    appliedUpperBody: appliedUpperBody ?? solvedUpperBody,
    hipDrop: retargetFrame.hipDrop,
    leftFootContact: retargetFrame.contacts.leftFoot,
    leftKneeLift: retargetFrame.kneeLift.left,
    lowerBodySegmentMotion: getRecordedLowerBodySegmentMotionDepth({
      calibration: retargetSourceModel,
      frame: retargetFrame,
    }),
    plantedSquatIkDepth,
    rightFootContact: retargetFrame.contacts.rightFoot,
    rightKneeLift: retargetFrame.kneeLift.right,
    solvedSegments: retargetFrame.debug.solvedSegments.length,
    sourceQuality: retargetFrame.debug.sourceQuality,
    squatDepth: retargetFrame.squatDepth,
    totalLowerBody: 6,
    totalSegments: retargetFrame.debug.solvedSegments.length + retargetFrame.debug.heldSegments.length,
    totalUpperBody: 5,
    visualRootDrop,
  };
}

export function formatMovementAvatarRetargetDebugLabel(
  retargetDebug: MovementAvatarRetargetDebugLabelInput,
) {
  return `q${retargetDebug.sourceQuality.toFixed(2)} ` +
    `s${retargetDebug.squatDepth.toFixed(2)} ` +
    `hip${retargetDebug.hipDrop.toFixed(2)} ` +
    `seg${retargetDebug.lowerBodySegmentMotion.toFixed(2)} ` +
    `knee ${retargetDebug.leftKneeLift.toFixed(2)}/${retargetDebug.rightKneeLift.toFixed(2)} ` +
    `feet ${retargetDebug.leftFootContact ? "L" : "-"}${retargetDebug.rightFootContact ? "R" : "-"} ` +
    `bones ${retargetDebug.solvedSegments}/${retargetDebug.totalSegments} ` +
    `upper ${retargetDebug.appliedUpperBody}/${retargetDebug.totalUpperBody} ` +
    `lower ${retargetDebug.appliedLowerBody}/${retargetDebug.totalLowerBody} ` +
    `drop ${retargetDebug.visualRootDrop.toFixed(2)} ` +
    `ik ${retargetDebug.plantedSquatIkDepth.toFixed(2)}`;
}

export function appendMovementAvatarFootLockDebugLabel(
  retargetLabel: string,
  footLock: MovementAvatarFootLockDebugLabelInput,
) {
  return `${retargetLabel} ` +
    `lock ${footLock.strength.toFixed(2)} ` +
    `corr ${footLock.correction.toFixed(2)} ` +
    `drift ${footLock.drift.toFixed(2)}`;
}

export function resolveMovementAvatarArmAimOptions({
  avatarRole,
  frontBias,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  safeZScale,
}: {
  avatarRole: "instructor" | "player";
  frontBias: number;
  profile?: MovementAvatarTrackingProfile;
  safeZScale?: number;
}): MovementAvatarArmAimOptionsDecision {
  const isPlayer = avatarRole === "player";
  const baseOptions = {
    minVectorLengthSq: 0.00002,
    storeVisibilityThreshold: isPlayer ? profile.armStoreVisibility : 0.6,
    visibilityThreshold: isPlayer ? profile.armVisibility : 0.2,
    zScale: safeZScale,
  };

  return {
    lowerArm: {
      ...baseOptions,
      frontBias: frontBias * 1.15,
      slerpOverride: isPlayer ? profile.lowerArmSlerp : 0.45,
    },
    upperArm: {
      ...baseOptions,
      frontBias: frontBias * 0.9,
      slerpOverride: isPlayer ? profile.upperArmSlerp : 0.42,
    },
  };
}

export function resolveMovementAvatarLegacyLowerBodyAimOptions({
  avatarRole,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
}: {
  avatarRole: "instructor" | "player";
  profile?: MovementAvatarTrackingProfile;
}): MovementAvatarLegacyLowerBodyAimOptionsDecision {
  const isPlayer = avatarRole === "player";
  const leg = {
    minVectorLengthSq: 0.00002,
    slerpOverride: isPlayer ? profile.legSlerp : 0.36,
    storeVisibilityThreshold: isPlayer ? profile.legStoreVisibility : 0.6,
    visibilityThreshold: isPlayer ? profile.legVisibility : 0.2,
  };

  return {
    foot: {
      ...leg,
      slerpOverride: isPlayer ? profile.footSlerp : 0.32,
      visibilityThreshold: isPlayer ? profile.footVisibility : 0.2,
    },
    leg,
  };
}

export function resolveMovementAvatarPlantedSquatIkOptions({
  avatarRole,
}: {
  avatarRole: "instructor" | "player";
}): MovementAvatarPlantedSquatIkOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    footSlerp: isPlayer ? 0.3 : 0.34,
    legSlerp: isPlayer ? 0.52 : 0.66,
  };
}

export function resolveMovementAvatarHipsPositionOptions({
  avatarRole,
  lowerBodyDrive,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  profile?: MovementAvatarTrackingProfile;
}): MovementAvatarHipsPositionOptionsDecision {
  const isPlayer = avatarRole === "player";
  const shouldUsePlayerSquatDrop = isPlayer && lowerBodyDrive.shouldDrivePlayerSquat;
  const shouldUsePlayerFloorCorrection =
    isPlayer && lowerBodyDrive.shouldDrivePlayerSquat;

  return {
    avatarRootVisualLerp: isPlayer ? 0.28 : 0.34,
    floorContactCorrectionScale: isPlayer
      ? shouldUsePlayerFloorCorrection ? 0.7 : 0
      : 0.86,
    rootLerp: isPlayer ? 0.38 : 0.48,
    shouldUseCalibratedFloorCorrection: isPlayer,
    squatHipDropLimit: shouldUsePlayerSquatDrop
      ? 0.88
      : profile.squatHipDropLimit ?? 0.42,
    squatHipDropScale: shouldUsePlayerSquatDrop
      ? 0.78
      : profile.squatHipDropScale ?? 0.38,
  };
}

export function resolveMovementAvatarHipsApplication({
  hipsPositionOptions,
  lowerBodyTrackingReady,
  playerSquatPresentationDepth,
  shouldApplyLowerBody,
}: {
  hipsPositionOptions: MovementAvatarHipsPositionOptionsDecision;
  lowerBodyTrackingReady: boolean;
  playerSquatPresentationDepth: number;
  shouldApplyLowerBody: boolean;
}): MovementAvatarHipsApplicationDecision {
  const canApplyLowerBodyHips = lowerBodyTrackingReady && shouldApplyLowerBody;
  const squatDrop = canApplyLowerBodyHips
    ? Math.min(
        hipsPositionOptions.squatHipDropLimit,
        playerSquatPresentationDepth * hipsPositionOptions.squatHipDropScale,
      )
    : 0;

  return {
    shouldApplyFloorContactCorrection:
      canApplyLowerBodyHips &&
      hipsPositionOptions.floorContactCorrectionScale > 0,
    shouldApplySquatDrop: squatDrop > 0,
    squatDrop,
  };
}

const PLAYER_LEG_RAISE_HOLD_MS = 1400;
const PLAYER_LEG_RAISE_RISE_SMOOTHING = 0.48;
const PLAYER_LEG_RAISE_FALL_SMOOTHING = 0.18;

function smoothPlayerLegRaiseDepth({
  currentDepth,
  previousState,
  side,
}: {
  currentDepth: number;
  previousState: MovementAvatarPlayerLegRaiseHoldState;
  side: "left" | "right";
}) {
  const clampedCurrentDepth = Math.max(currentDepth, 0.3);
  if (previousState.side !== side || previousState.depth <= 0) {
    return clampedCurrentDepth;
  }

  const smoothing = clampedCurrentDepth >= previousState.depth
    ? PLAYER_LEG_RAISE_RISE_SMOOTHING
    : PLAYER_LEG_RAISE_FALL_SMOOTHING;
  return previousState.depth + (clampedCurrentDepth - previousState.depth) * smoothing;
}

export function resolveMovementAvatarPlayerLegRaiseHold({
  avatarRole,
  holdMs = PLAYER_LEG_RAISE_HOLD_MS,
  lowerBodyDrive,
  now,
  previousState,
}: {
  avatarRole: "instructor" | "player";
  holdMs?: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  now: number;
  previousState: MovementAvatarPlayerLegRaiseHoldState;
}): MovementAvatarPlayerLegRaiseHoldDecision {
  const emptyState = {
    depth: 0,
    expiresAt: 0,
    side: null,
  };

  if (avatarRole !== "player") {
    return {
      lowerBodyDrive,
      state: emptyState,
      wasHeld: false,
    };
  }

  if (lowerBodyDrive.shouldDrivePlayerLegRaise && lowerBodyDrive.playerLegRaiseSide) {
    const smoothedDepth = smoothPlayerLegRaiseDepth({
      currentDepth: lowerBodyDrive.playerLegRaiseDepth,
      previousState,
      side: lowerBodyDrive.playerLegRaiseSide,
    });

    return {
      lowerBodyDrive: {
        ...lowerBodyDrive,
        playerLegRaiseDepth: smoothedDepth,
      },
      state: {
        depth: smoothedDepth,
        expiresAt: now + holdMs,
        side: lowerBodyDrive.playerLegRaiseSide,
      },
      wasHeld: false,
    };
  }

  if (
    !lowerBodyDrive.shouldDrivePlayerSquat &&
    previousState.side &&
    previousState.expiresAt > now
  ) {
    const heldSide = previousState.side;
    return {
      lowerBodyDrive: {
        ...lowerBodyDrive,
        playerLegRaiseDepth: Math.max(previousState.depth, 0.3),
        playerLegRaiseSide: heldSide,
        playerLowerBodyState: heldSide === "left" ? "left-leg-raise" : "right-leg-raise",
        playerSquatPresentationDepth: 0,
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
        shouldDrivePlayerSquat: false,
        visualRootDrop: 0,
      },
      state: previousState,
      wasHeld: true,
    };
  }

  return {
    lowerBodyDrive,
    state: emptyState,
    wasHeld: false,
  };
}

export function resolveMovementAvatarBoneEaseOptions({
  avatarRole,
}: {
  avatarRole: "instructor" | "player";
}): MovementAvatarBoneEaseOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    armRelaxedSlerp: isPlayer ? 0.16 : 0.1,
    demoFallbackSlerp: isPlayer ? 0.18 : 0.12,
    handNeutralSlerp: isPlayer ? 0.48 : 0.32,
    lowerBodyNeutralSlerp: isPlayer ? 0.12 : 0.08,
    singleLegRaiseSlerp: isPlayer ? 0.72 : 0.58,
    solvedLowerBodySlerp: isPlayer ? 0.62 : 0.54,
    squatFlexionSlerp: isPlayer ? 0.84 : 0.62,
  };
}

export function resolveMovementAvatarLowerBodyNeutralPose({
  slerp,
}: {
  slerp: number;
}): MovementAvatarBoneRotationSpec[] {
  const neutral = { x: 0, y: 0, z: 0 };

  return [
    { bone: "rightUpperLeg", rotation: neutral, slerp },
    { bone: "rightLowerLeg", rotation: neutral, slerp },
    { bone: "leftUpperLeg", rotation: neutral, slerp },
    { bone: "leftLowerLeg", rotation: neutral, slerp },
    { bone: "rightFoot", rotation: neutral, slerp },
    { bone: "leftFoot", rotation: neutral, slerp },
  ];
}

export function resolveMovementAvatarSolvedLowerBodyPose({
  depth,
  slerp,
}: {
  depth: number;
  slerp: number;
}): MovementAvatarRigRotationSpec[] {
  const flexDepth = smoothstep(depth, 0.08, 0.88);
  if (flexDepth <= 0.001) return [];

  const scale = 1 + flexDepth * 1.05;
  const upperLegLimit = 1.15 + flexDepth * 0.35;
  const lowerLegLimit = 1.45 + flexDepth * 0.35;

  return [
    {
      bone: "rightUpperLeg",
      limits: { x: upperLegLimit, y: 0.8, z: 0.8 },
      remember: false,
      scale,
      slerp,
      source: "RightUpperLeg",
    },
    {
      bone: "leftUpperLeg",
      limits: { x: upperLegLimit, y: 0.8, z: 0.8 },
      remember: false,
      scale,
      slerp,
      source: "LeftUpperLeg",
    },
    {
      bone: "rightLowerLeg",
      limits: { x: lowerLegLimit, y: 0.6, z: 0.6 },
      remember: false,
      scale,
      slerp,
      source: "RightLowerLeg",
    },
    {
      bone: "leftLowerLeg",
      limits: { x: lowerLegLimit, y: 0.6, z: 0.6 },
      remember: false,
      scale,
      slerp,
      source: "LeftLowerLeg",
    },
  ];
}

export function resolveMovementAvatarLegacyLowerBodyAimPose(): MovementAvatarLegacyLowerBodyAimSpec[] {
  return [
    {
      bone: "rightUpperLeg",
      child: "rightLowerLeg",
      options: "leg",
      source: { index: 24, type: "landmark" },
      target: "rightKnee",
    },
    {
      bone: "rightLowerLeg",
      child: "rightFoot",
      options: "leg",
      source: { target: "rightKnee", type: "target" },
      target: "rightAnkle",
    },
    {
      bone: "leftUpperLeg",
      child: "leftLowerLeg",
      options: "leg",
      source: { index: 23, type: "landmark" },
      target: "leftKnee",
    },
    {
      bone: "leftLowerLeg",
      child: "leftFoot",
      options: "leg",
      source: { target: "leftKnee", type: "target" },
      target: "leftAnkle",
    },
    {
      bone: "rightFoot",
      child: "rightToes",
      options: "foot",
      source: { index: 30, type: "landmark" },
      target: "rightToe",
    },
    {
      bone: "leftFoot",
      child: "leftToes",
      options: "foot",
      source: { index: 29, type: "landmark" },
      target: "leftToe",
    },
  ];
}

export function resolveMovementAvatarSquatFlexionPose({
  bendBoost = 0.32,
  depth,
  slerp,
}: {
  bendBoost?: number;
  depth: number;
  slerp: number;
}): MovementAvatarBoneRotationSpec[] {
  const flexDepth = smoothstep(depth, 0.1, 0.92);
  if (flexDepth <= 0.001) return [];

  const upperLegPitch = (1.76 + bendBoost * 1.15) * flexDepth;
  const lowerLegPitch = -(2.12 + bendBoost * 1.15) * flexDepth;
  const footPitch = 0.72 * flexDepth;
  const kneeOut = 0.12 * flexDepth;

  return [
    {
      bone: "rightUpperLeg",
      rotation: { x: upperLegPitch, y: 0, z: -kneeOut },
      slerp,
    },
    {
      bone: "leftUpperLeg",
      rotation: { x: upperLegPitch, y: 0, z: kneeOut },
      slerp,
    },
    {
      bone: "rightLowerLeg",
      rotation: { x: lowerLegPitch, y: 0, z: kneeOut * 0.35 },
      slerp,
    },
    {
      bone: "leftLowerLeg",
      rotation: { x: lowerLegPitch, y: 0, z: -kneeOut * 0.35 },
      slerp,
    },
    {
      bone: "rightFoot",
      rotation: { x: footPitch, y: 0, z: 0 },
      slerp: slerp * 0.75,
    },
    {
      bone: "leftFoot",
      rotation: { x: footPitch, y: 0, z: 0 },
      slerp: slerp * 0.75,
    },
  ];
}

export function resolveMovementAvatarSingleLegRaisePose({
  depth,
  side,
  slerp,
}: {
  depth: number;
  side: "left" | "right";
  slerp: number;
}): MovementAvatarBoneRotationSpec[] {
  const liftDepth = smoothstep(depth, 0.12, 0.9);
  if (liftDepth <= 0.001) return [];

  const plantedSide = side === "left" ? "right" : "left";
  const kneeOut = side === "left" ? 0.08 : -0.08;

  return [
    {
      bone: `${side}UpperLeg`,
      rotation: { x: 1.18 * liftDepth, y: 0.05 * liftDepth, z: kneeOut * liftDepth },
      slerp,
    },
    {
      bone: `${side}LowerLeg`,
      rotation: { x: -0.72 * liftDepth, y: 0, z: -kneeOut * 0.35 * liftDepth },
      slerp,
    },
    {
      bone: `${side}Foot`,
      rotation: { x: 0.18 * liftDepth, y: 0, z: 0 },
      slerp: slerp * 0.72,
    },
    {
      bone: `${plantedSide}UpperLeg`,
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.28,
    },
    {
      bone: `${plantedSide}LowerLeg`,
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.28,
    },
    {
      bone: `${plantedSide}Foot`,
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.32,
    },
  ];
}

export function resolveMovementAvatarSupportPresentationPose({
  exercisePose,
  poseLandmarks,
  supportConstraint,
  supportIntent,
}: {
  exercisePose: MovementExercisePoseDecision;
  poseLandmarks?: TrackingLandmark[];
  supportConstraint: MovementSupportConstraintDecision;
  supportIntent: MovementSupportIntentDecision;
}): MovementAvatarSupportPresentationDecision {
  const spec = (
    bone: MovementAvatarLowerBodyBoneName,
    rotation: MovementAvatarBoneRotationSpec["rotation"],
    slerp = 0.18,
  ): MovementAvatarBoneRotationSpec => ({ bone, rotation, slerp });
  const spineSpec = (
    bone: MovementAvatarSpineBoneName,
    rotation: MovementAvatarSpineBoneRotationSpec["rotation"],
    slerp = 0.16,
  ): MovementAvatarSpineBoneRotationSpec => ({ bone, rotation, slerp });
  const armSpec = (
    bone: MovementAvatarSupportPresentationArmBoneName,
    rotation: MovementAvatarSupportPresentationArmRotationSpec["rotation"],
    slerp = 0.16,
  ): MovementAvatarSupportPresentationArmRotationSpec => ({ bone, rotation, slerp });
  const decision = ({
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
  }): MovementAvatarSupportPresentationDecision => ({
    armSpecs,
    floorPose,
    owner,
    shouldApply: true,
    specs,
    standingPose,
    spineSpecs,
  });
  const none = (owner = "support-presentation-none"): MovementAvatarSupportPresentationDecision => ({
    armSpecs: [],
    floorPose: emptyMovementAvatarFloorPose(),
    owner,
    shouldApply: false,
    specs: [],
    standingPose: emptyMovementAvatarStandingPose(),
    spineSpecs: [],
  });

  if (supportIntent.key === "feet-floor") {
    if (exercisePose.poseKey === "yoga-half-lift-prep") {
      const halfLiftDepth = estimateMovementAvatarHalfLiftDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: 0.24 + halfLiftDepth * 0.28, y: 0, z: -0.28 }, 0.16),
          armSpec("leftUpperArm", { x: 0.24 + halfLiftDepth * 0.28, y: 0, z: 0.28 }, 0.16),
          armSpec("rightLowerArm", { x: 0.05 + halfLiftDepth * 0.18, y: 0, z: -0.06 }, 0.14),
          armSpec("leftLowerArm", { x: 0.05 + halfLiftDepth * 0.18, y: 0, z: 0.06 }, 0.14),
        ],
        owner: "support-presentation-yoga-half-lift",
        specs: [
          spec("rightUpperLeg", { x: 0.14 + halfLiftDepth * 0.14, y: 0, z: -0.02 }, 0.14),
          spec("leftUpperLeg", { x: 0.14 + halfLiftDepth * 0.14, y: 0, z: 0.02 }, 0.14),
          spec("rightLowerLeg", { x: -0.05 - halfLiftDepth * 0.05, y: 0, z: 0.01 }, 0.12),
          spec("leftLowerLeg", { x: -0.05 - halfLiftDepth * 0.05, y: 0, z: -0.01 }, 0.12),
          spec("rightFoot", { x: 0.03, y: 0, z: 0 }, 0.12),
          spec("leftFoot", { x: 0.03, y: 0, z: 0 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ halfLiftDepth, key: "halfLift" }),
        spineSpecs: [
          spineSpec("hips", { x: 0.08 + halfLiftDepth * 0.18, y: 0, z: 0 }, 0.16),
          spineSpec("spine", { x: 0.12 + halfLiftDepth * 0.26, y: 0, z: 0 }, 0.16),
          spineSpec("chest", { x: 0.08 + halfLiftDepth * 0.2, y: 0, z: 0 }, 0.16),
        ],
      });
    }

    if (exercisePose.poseKey === "yoga-forward-fold-prep") {
      const foldDepth = estimateMovementAvatarForwardFoldDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: 0.32 + foldDepth * 0.38, y: 0, z: -0.34 }, 0.16),
          armSpec("leftUpperArm", { x: 0.32 + foldDepth * 0.38, y: 0, z: 0.34 }, 0.16),
          armSpec("rightLowerArm", { x: 0.08 + foldDepth * 0.26, y: 0, z: -0.08 }, 0.14),
          armSpec("leftLowerArm", { x: 0.08 + foldDepth * 0.26, y: 0, z: 0.08 }, 0.14),
        ],
        owner: "support-presentation-yoga-forward-fold",
        specs: [
          spec("rightUpperLeg", { x: 0.16 + foldDepth * 0.18, y: 0, z: -0.03 }, 0.14),
          spec("leftUpperLeg", { x: 0.16 + foldDepth * 0.18, y: 0, z: 0.03 }, 0.14),
          spec("rightLowerLeg", { x: -0.08 - foldDepth * 0.08, y: 0, z: 0.01 }, 0.12),
          spec("leftLowerLeg", { x: -0.08 - foldDepth * 0.08, y: 0, z: -0.01 }, 0.12),
          spec("rightFoot", { x: 0.04, y: 0, z: 0 }, 0.12),
          spec("leftFoot", { x: 0.04, y: 0, z: 0 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ foldDepth, key: "forwardFold" }),
        spineSpecs: [
          spineSpec("hips", { x: 0.12 + foldDepth * 0.42, y: 0, z: 0 }, 0.16),
          spineSpec("spine", { x: 0.18 + foldDepth * 0.52, y: 0, z: 0 }, 0.16),
          spineSpec("chest", { x: 0.14 + foldDepth * 0.44, y: 0, z: 0 }, 0.16),
          spineSpec("upperChest", { x: 0.08 + foldDepth * 0.28, y: 0, z: 0 }, 0.14),
        ],
      });
    }

    if (exercisePose.poseKey === "yoga-chair-prep") {
      const chairDepth = estimateMovementAvatarChairPoseDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: -0.58 - chairDepth * 0.18, y: 0, z: -0.18 }, 0.18),
          armSpec("leftUpperArm", { x: -0.58 - chairDepth * 0.18, y: 0, z: 0.18 }, 0.18),
          armSpec("rightLowerArm", { x: -0.16 - chairDepth * 0.12, y: 0, z: -0.04 }, 0.16),
          armSpec("leftLowerArm", { x: -0.16 - chairDepth * 0.12, y: 0, z: 0.04 }, 0.16),
        ],
        owner: "support-presentation-yoga-chair",
        specs: [
          spec("rightUpperLeg", { x: 0.74 + chairDepth * 0.74, y: -0.04, z: -0.1 }, 0.2),
          spec("leftUpperLeg", { x: 0.74 + chairDepth * 0.74, y: 0.04, z: 0.1 }, 0.2),
          spec("rightLowerLeg", { x: -0.64 - chairDepth * 0.82, y: 0, z: 0.04 }, 0.2),
          spec("leftLowerLeg", { x: -0.64 - chairDepth * 0.82, y: 0, z: -0.04 }, 0.2),
          spec("rightFoot", { x: 0.16 + chairDepth * 0.18, y: 0, z: 0 }, 0.16),
          spec("leftFoot", { x: 0.16 + chairDepth * 0.18, y: 0, z: 0 }, 0.16),
        ],
        standingPose: movementAvatarStandingPose({ chairDepth, key: "chair" }),
        spineSpecs: [
          spineSpec("hips", { x: -0.04 - chairDepth * 0.12, y: 0, z: 0 }, 0.16),
          spineSpec("spine", { x: 0.08 + chairDepth * 0.18, y: 0, z: 0 }, 0.16),
          spineSpec("chest", { x: 0.08 + chairDepth * 0.14, y: 0, z: 0 }, 0.16),
        ],
      });
    }

    if (exercisePose.poseKey === "forward-lunge-prep") {
      const forwardLungeDepth = estimateMovementAvatarForwardLungeDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: 0.1 + forwardLungeDepth * 0.12, y: 0, z: -0.62 }, 0.16),
          armSpec("leftUpperArm", { x: 0.1 + forwardLungeDepth * 0.12, y: 0, z: 0.62 }, 0.16),
          armSpec("rightLowerArm", { x: 0.04, y: 0, z: -0.08 }, 0.14),
          armSpec("leftLowerArm", { x: 0.04, y: 0, z: 0.08 }, 0.14),
        ],
        owner: "support-presentation-forward-lunge",
        specs: [
          spec("rightUpperLeg", { x: 0.3 + forwardLungeDepth * 0.68, y: -0.06, z: -0.2 }, 0.18),
          spec("leftUpperLeg", { x: 0.12 + forwardLungeDepth * 0.22, y: 0.06, z: 0.16 }, 0.18),
          spec("rightLowerLeg", { x: -0.22 - forwardLungeDepth * 0.42, y: 0, z: 0.04 }, 0.16),
          spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.04 }, 0.14),
          spec("rightFoot", { x: 0.08, y: 0.1, z: -0.06 }, 0.12),
          spec("leftFoot", { x: 0.02, y: -0.1, z: 0.06 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ forwardLungeDepth, key: "forwardLunge" }),
        spineSpecs: [
          spineSpec("hips", { x: 0.04 + forwardLungeDepth * 0.08, y: 0.03, z: 0 }, 0.14),
          spineSpec("spine", { x: 0.06 + forwardLungeDepth * 0.08, y: 0.03, z: 0 }, 0.14),
          spineSpec("chest", { x: 0.05 + forwardLungeDepth * 0.06, y: 0.02, z: 0 }, 0.14),
        ],
      });
    }

    if (exercisePose.poseKey === "side-lunge-prep") {
      const sideLungeDepth = estimateMovementAvatarSideLungeDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: 0.08, y: 0, z: -0.72 }, 0.16),
          armSpec("leftUpperArm", { x: 0.08, y: 0, z: 0.72 }, 0.16),
          armSpec("rightLowerArm", { x: 0.04, y: 0, z: -0.08 }, 0.14),
          armSpec("leftLowerArm", { x: 0.04, y: 0, z: 0.08 }, 0.14),
        ],
        owner: "support-presentation-side-lunge",
        specs: [
          spec("rightUpperLeg", { x: 0.2 + sideLungeDepth * 0.42, y: -0.08, z: -0.32 }, 0.18),
          spec("leftUpperLeg", { x: 0.06 + sideLungeDepth * 0.12, y: 0.08, z: 0.28 }, 0.18),
          spec("rightLowerLeg", { x: -0.12 - sideLungeDepth * 0.36, y: 0, z: 0.06 }, 0.16),
          spec("leftLowerLeg", { x: -0.02, y: 0, z: -0.06 }, 0.14),
          spec("rightFoot", { x: 0.04, y: 0.12, z: -0.08 }, 0.12),
          spec("leftFoot", { x: 0.02, y: -0.12, z: 0.08 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ key: "sideLunge", sideLungeDepth }),
        spineSpecs: [
          spineSpec("hips", { x: 0.02, y: 0.08 * sideLungeDepth, z: 0.08 * sideLungeDepth }, 0.14),
          spineSpec("spine", { x: 0.04, y: 0.08 * sideLungeDepth, z: 0.12 * sideLungeDepth }, 0.14),
          spineSpec("chest", { x: 0.04, y: 0.06 * sideLungeDepth, z: 0.08 * sideLungeDepth }, 0.14),
        ],
      });
    }

    if (exercisePose.poseKey === "jumping-jack-prep") {
      const jumpingJackDepth = estimateMovementAvatarJumpingJackDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: -0.46 - jumpingJackDepth * 0.16, y: 0, z: -0.72 }, 0.18),
          armSpec("leftUpperArm", { x: -0.46 - jumpingJackDepth * 0.16, y: 0, z: 0.72 }, 0.18),
          armSpec("rightLowerArm", { x: -0.12 - jumpingJackDepth * 0.08, y: 0, z: -0.08 }, 0.16),
          armSpec("leftLowerArm", { x: -0.12 - jumpingJackDepth * 0.08, y: 0, z: 0.08 }, 0.16),
        ],
        owner: "support-presentation-jumping-jack-prep",
        specs: [
          spec("rightUpperLeg", { x: 0.04, y: -0.04, z: -0.24 - jumpingJackDepth * 0.18 }, 0.16),
          spec("leftUpperLeg", { x: 0.04, y: 0.04, z: 0.24 + jumpingJackDepth * 0.18 }, 0.16),
          spec("rightLowerLeg", { x: -0.02, y: 0, z: 0.05 }, 0.14),
          spec("leftLowerLeg", { x: -0.02, y: 0, z: -0.05 }, 0.14),
          spec("rightFoot", { x: 0.02, y: 0.08, z: -0.06 }, 0.12),
          spec("leftFoot", { x: 0.02, y: -0.08, z: 0.06 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ jumpingJackDepth, key: "jumpingJack" }),
        spineSpecs: [
          spineSpec("hips", { x: 0, y: 0, z: 0 }, 0.12),
          spineSpec("spine", { x: 0.02, y: 0, z: 0 }, 0.12),
          spineSpec("chest", { x: 0.02, y: 0, z: 0 }, 0.12),
        ],
      });
    }

    if (exercisePose.poseKey === "standing-arm-raise") {
      const armRaiseDepth = estimateMovementAvatarStandingArmRaiseDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: -0.5 - armRaiseDepth * 0.2, y: 0, z: -0.18 }, 0.18),
          armSpec("leftUpperArm", { x: -0.5 - armRaiseDepth * 0.2, y: 0, z: 0.18 }, 0.18),
          armSpec("rightLowerArm", { x: -0.12 - armRaiseDepth * 0.12, y: 0, z: -0.04 }, 0.16),
          armSpec("leftLowerArm", { x: -0.12 - armRaiseDepth * 0.12, y: 0, z: 0.04 }, 0.16),
        ],
        owner: "support-presentation-standing-arm-raise",
        specs: [
          spec("rightUpperLeg", { x: 0, y: 0, z: -0.02 }, 0.1),
          spec("leftUpperLeg", { x: 0, y: 0, z: 0.02 }, 0.1),
          spec("rightLowerLeg", { x: 0, y: 0, z: 0 }, 0.1),
          spec("leftLowerLeg", { x: 0, y: 0, z: 0 }, 0.1),
          spec("rightFoot", { x: 0, y: 0, z: 0 }, 0.1),
          spec("leftFoot", { x: 0, y: 0, z: 0 }, 0.1),
        ],
        standingPose: movementAvatarStandingPose({ armRaiseDepth, key: "armRaise" }),
        spineSpecs: [
          spineSpec("hips", { x: 0, y: 0, z: 0 }, 0.12),
          spineSpec("spine", { x: 0.02 + armRaiseDepth * 0.04, y: 0, z: 0 }, 0.12),
          spineSpec("chest", { x: 0.02 + armRaiseDepth * 0.04, y: 0, z: 0 }, 0.12),
        ],
      });
    }

    if (exercisePose.poseKey === "standing-twist") {
      const twistDepth = estimateMovementAvatarStandingTwistDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: 0.08, y: 0, z: -0.62 }, 0.16),
          armSpec("leftUpperArm", { x: 0.08, y: 0, z: 0.62 }, 0.16),
          armSpec("rightLowerArm", { x: 0.02, y: 0, z: -0.08 }, 0.14),
          armSpec("leftLowerArm", { x: 0.02, y: 0, z: 0.08 }, 0.14),
        ],
        owner: "support-presentation-standing-twist",
        specs: [
          spec("rightUpperLeg", { x: 0.02, y: -0.02, z: -0.04 }, 0.12),
          spec("leftUpperLeg", { x: 0.02, y: 0.02, z: 0.04 }, 0.12),
          spec("rightLowerLeg", { x: 0, y: 0, z: 0.02 }, 0.1),
          spec("leftLowerLeg", { x: 0, y: 0, z: -0.02 }, 0.1),
          spec("rightFoot", { x: 0, y: 0, z: 0 }, 0.1),
          spec("leftFoot", { x: 0, y: 0, z: 0 }, 0.1),
        ],
        standingPose: movementAvatarStandingPose({ key: "standingTwist", twistDepth }),
        spineSpecs: [
          spineSpec("hips", { x: 0, y: 0.04 * twistDepth, z: 0.02 * twistDepth }, 0.14),
          spineSpec("spine", { x: 0.02, y: 0.18 * twistDepth, z: 0.06 * twistDepth }, 0.16),
          spineSpec("chest", { x: 0.02, y: 0.3 * twistDepth, z: 0.08 * twistDepth }, 0.16),
          spineSpec("upperChest", { x: 0, y: 0.18 * twistDepth, z: 0.04 * twistDepth }, 0.14),
        ],
      });
    }

    if (exercisePose.poseKey === "yoga-tree-prep") {
      const { depth: treeDepth, side } = estimateMovementAvatarTreePose(poseLandmarks);
      const liftedSide = side ?? "left";
      const plantedSide = liftedSide === "left" ? "right" : "left";
      const liftedSign = liftedSide === "left" ? 1 : -1;

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: -0.52 - treeDepth * 0.2, y: 0, z: -0.18 }, 0.18),
          armSpec("leftUpperArm", { x: -0.52 - treeDepth * 0.2, y: 0, z: 0.18 }, 0.18),
          armSpec("rightLowerArm", { x: -0.1 - treeDepth * 0.12, y: 0, z: -0.04 }, 0.16),
          armSpec("leftLowerArm", { x: -0.1 - treeDepth * 0.12, y: 0, z: 0.04 }, 0.16),
        ],
        owner: "support-presentation-yoga-tree",
        specs: [
          spec(`${liftedSide}UpperLeg`, { x: 0.58 + treeDepth * 0.42, y: 0.12 * liftedSign, z: 0.42 * liftedSign }, 0.2),
          spec(`${liftedSide}LowerLeg`, { x: -0.72 - treeDepth * 0.36, y: 0, z: -0.18 * liftedSign }, 0.2),
          spec(`${liftedSide}Foot`, { x: 0.08, y: 0, z: 0.16 * liftedSign }, 0.16),
          spec(`${plantedSide}UpperLeg`, { x: 0, y: 0, z: -0.04 * liftedSign }, 0.12),
          spec(`${plantedSide}LowerLeg`, { x: 0, y: 0, z: 0.02 * liftedSign }, 0.12),
          spec(`${plantedSide}Foot`, { x: 0, y: 0, z: 0 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ key: "tree", treeDepth }),
        spineSpecs: [
          spineSpec("hips", { x: 0, y: 0, z: 0.04 * liftedSign * treeDepth }, 0.14),
          spineSpec("spine", { x: 0.03, y: 0, z: -0.03 * liftedSign * treeDepth }, 0.14),
          spineSpec("chest", { x: 0.03, y: 0, z: -0.02 * liftedSign * treeDepth }, 0.14),
        ],
      });
    }

    if (exercisePose.poseKey === "yoga-warrior-one-prep") {
      const warriorOneDepth = estimateMovementAvatarWarriorOneDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: -0.58 - warriorOneDepth * 0.18, y: 0, z: -0.16 }, 0.18),
          armSpec("leftUpperArm", { x: -0.58 - warriorOneDepth * 0.18, y: 0, z: 0.16 }, 0.18),
          armSpec("rightLowerArm", { x: -0.14 - warriorOneDepth * 0.12, y: 0, z: -0.04 }, 0.16),
          armSpec("leftLowerArm", { x: -0.14 - warriorOneDepth * 0.12, y: 0, z: 0.04 }, 0.16),
        ],
        owner: "support-presentation-yoga-warrior-one",
        specs: [
          spec("rightUpperLeg", { x: 0.28 + warriorOneDepth * 0.58, y: -0.04, z: -0.18 }, 0.18),
          spec("leftUpperLeg", { x: 0.12 + warriorOneDepth * 0.22, y: 0.04, z: 0.14 }, 0.18),
          spec("rightLowerLeg", { x: -0.2 - warriorOneDepth * 0.34, y: 0, z: 0.03 }, 0.16),
          spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.03 }, 0.14),
          spec("rightFoot", { x: 0.08, y: 0.08, z: -0.06 }, 0.12),
          spec("leftFoot", { x: 0.02, y: -0.08, z: 0.06 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ key: "warriorOne", warriorOneDepth }),
        spineSpecs: [
          spineSpec("hips", { x: 0.04, y: 0.02, z: 0 }, 0.14),
          spineSpec("spine", { x: 0.08 + warriorOneDepth * 0.08, y: 0.02, z: 0 }, 0.14),
          spineSpec("chest", { x: 0.08 + warriorOneDepth * 0.08, y: 0.02, z: 0 }, 0.14),
        ],
      });
    }

    if (exercisePose.poseKey === "yoga-triangle-prep") {
      const { depth: triangleDepth, side } = estimateMovementAvatarTrianglePose(poseLandmarks);
      const sign = side === "left" ? 1 : -1;

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: side === "right" ? -0.62 : 0.42, y: 0, z: -0.74 }, 0.18),
          armSpec("leftUpperArm", { x: side === "left" ? -0.62 : 0.42, y: 0, z: 0.74 }, 0.18),
          armSpec("rightLowerArm", { x: side === "right" ? -0.08 : 0.18, y: 0, z: -0.08 }, 0.16),
          armSpec("leftLowerArm", { x: side === "left" ? -0.08 : 0.18, y: 0, z: 0.08 }, 0.16),
        ],
        owner: "support-presentation-yoga-triangle",
        specs: [
          spec("rightUpperLeg", { x: 0.08 + triangleDepth * 0.14, y: -0.08, z: -0.24 }, 0.18),
          spec("leftUpperLeg", { x: 0.08 + triangleDepth * 0.14, y: 0.08, z: 0.24 }, 0.18),
          spec("rightLowerLeg", { x: -0.04, y: 0, z: 0.06 }, 0.14),
          spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.06 }, 0.14),
          spec("rightFoot", { x: 0.02, y: 0.1, z: -0.1 }, 0.12),
          spec("leftFoot", { x: 0.02, y: -0.1, z: 0.1 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ key: "triangle", triangleDepth }),
        spineSpecs: [
          spineSpec("hips", { x: 0.04, y: 0.08 * sign, z: 0.18 * sign * triangleDepth }, 0.16),
          spineSpec("spine", { x: 0.08, y: 0.14 * sign, z: 0.34 * sign * triangleDepth }, 0.16),
          spineSpec("chest", { x: 0.08, y: 0.16 * sign, z: 0.42 * sign * triangleDepth }, 0.16),
          spineSpec("upperChest", { x: 0.04, y: 0.12 * sign, z: 0.24 * sign * triangleDepth }, 0.14),
        ],
      });
    }

    if (exercisePose.poseKey === "yoga-warrior-two-prep") {
      const warriorDepth = estimateMovementAvatarWarriorTwoDepth(poseLandmarks);

      return decision({
        armSpecs: [
          armSpec("rightUpperArm", { x: 0.02, y: 0, z: -0.92 }, 0.18),
          armSpec("leftUpperArm", { x: 0.02, y: 0, z: 0.92 }, 0.18),
          armSpec("rightLowerArm", { x: 0, y: 0, z: -0.04 }, 0.16),
          armSpec("leftLowerArm", { x: 0, y: 0, z: 0.04 }, 0.16),
        ],
        owner: "support-presentation-yoga-warrior-two",
        specs: [
          spec("rightUpperLeg", { x: 0.22 + warriorDepth * 0.42, y: -0.08, z: -0.28 }, 0.18),
          spec("leftUpperLeg", { x: 0.08 + warriorDepth * 0.18, y: 0.08, z: 0.22 }, 0.18),
          spec("rightLowerLeg", { x: -0.18 - warriorDepth * 0.24, y: 0, z: 0.04 }, 0.16),
          spec("leftLowerLeg", { x: -0.04, y: 0, z: -0.04 }, 0.14),
          spec("rightFoot", { x: 0.08, y: 0.12, z: -0.08 }, 0.12),
          spec("leftFoot", { x: 0.02, y: -0.12, z: 0.08 }, 0.12),
        ],
        standingPose: movementAvatarStandingPose({ key: "warriorTwo", warriorDepth }),
        spineSpecs: [
          spineSpec("hips", { x: 0.02, y: 0.08, z: 0 }, 0.14),
          spineSpec("spine", { x: 0.04, y: 0.12, z: 0 }, 0.14),
          spineSpec("chest", { x: 0.04, y: 0.16, z: 0 }, 0.14),
        ],
      });
    }
  }

  if (supportConstraint.status === "active") return none();
  if (supportIntent.key === "unknown-support") return none("support-presentation-unknown");

  if (supportIntent.key === "seat-chair") {
    const isSeatedForwardFold = exercisePose.poseKey === "seated-forward-fold";
    const isSeatedLegLift = exercisePose.poseKey === "seated-leg-lift";
    const isSeatedTwist = exercisePose.poseKey === "seated-twist";
    const seatedFoldDepth = isSeatedForwardFold
      ? estimateMovementAvatarSeatedForwardFoldDepth(poseLandmarks)
      : 0;
    const { depth: seatedLegLiftDepth, side: seatedLegLiftSide } = estimateMovementAvatarSeatedLegLift(poseLandmarks);
    const liftedSeatedSide = seatedLegLiftSide ?? "right";
    const seatedLegLiftSign = liftedSeatedSide === "left" ? 1 : -1;
    const seatedUpperLegPitch = 1.42 - seatedLegLiftDepth * 0.16;
    const seatedLowerLegPitch = -1.22 + seatedLegLiftDepth * 0.72;

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: isSeatedForwardFold ? 0.24 + seatedFoldDepth * 0.24 : 0.08, y: 0, z: -0.86 }, 0.14),
        armSpec("leftUpperArm", { x: isSeatedForwardFold ? 0.24 + seatedFoldDepth * 0.24 : 0.08, y: 0, z: 0.86 }, 0.14),
        armSpec("rightLowerArm", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.18 : 0.04, y: 0, z: -0.1 }, 0.14),
        armSpec("leftLowerArm", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.18 : 0.04, y: 0, z: 0.1 }, 0.14),
      ],
      owner: isSeatedTwist
        ? "support-presentation-seated-twist"
        : isSeatedForwardFold
          ? "support-presentation-seated-forward-fold"
          : isSeatedLegLift ? "support-presentation-seated-leg-lift" : "support-presentation-seated",
      specs: [
        spec("rightUpperLeg", { x: isSeatedLegLift && liftedSeatedSide === "right" ? seatedUpperLegPitch : 1.42, y: -0.08, z: isSeatedLegLift ? -0.12 - 0.08 * seatedLegLiftSign : -0.12 }, 0.2),
        spec("leftUpperLeg", { x: isSeatedLegLift && liftedSeatedSide === "left" ? seatedUpperLegPitch : 1.42, y: 0.08, z: isSeatedLegLift ? 0.12 - 0.08 * seatedLegLiftSign : 0.12 }, 0.2),
        spec("rightLowerLeg", { x: isSeatedLegLift && liftedSeatedSide === "right" ? seatedLowerLegPitch : -1.22, y: 0, z: 0.05 }, 0.2),
        spec("leftLowerLeg", { x: isSeatedLegLift && liftedSeatedSide === "left" ? seatedLowerLegPitch : -1.22, y: 0, z: -0.05 }, 0.2),
        spec("rightFoot", { x: isSeatedLegLift && liftedSeatedSide === "right" ? 0.02 : 0.12, y: 0, z: 0 }, 0.16),
        spec("leftFoot", { x: isSeatedLegLift && liftedSeatedSide === "left" ? 0.02 : 0.12, y: 0, z: 0 }, 0.16),
      ],
      spineSpecs: [
        spineSpec("hips", { x: isSeatedForwardFold ? 0.02 + seatedFoldDepth * 0.18 : -0.04, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: isSeatedForwardFold ? 0.18 + seatedFoldDepth * 0.34 : 0.08, y: isSeatedTwist ? 0.18 : 0, z: isSeatedTwist ? 0.08 : 0 }, 0.16),
        spineSpec("chest", { x: isSeatedForwardFold ? 0.16 + seatedFoldDepth * 0.28 : 0.08, y: isSeatedTwist ? 0.28 : 0, z: isSeatedTwist ? 0.1 : 0 }, 0.16),
        spineSpec("upperChest", { x: isSeatedForwardFold ? 0.08 + seatedFoldDepth * 0.16 : 0.04, y: isSeatedTwist ? 0.18 : 0, z: isSeatedTwist ? 0.06 : 0 }, 0.14),
      ],
    });
  }

  if (supportIntent.key === "knees-floor") {
    const isHalfKneel = exercisePose.poseKey === "half-kneeling-floor";
    const isLowLunge = exercisePose.poseKey === "low-lunge-floor";

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.04, y: 0, z: -0.92 }, 0.14),
        armSpec("leftUpperArm", { x: 0.04, y: 0, z: 0.92 }, 0.14),
      ],
      owner: isLowLunge
        ? "support-presentation-low-lunge"
        : isHalfKneel ? "support-presentation-half-kneeling" : "support-presentation-kneeling",
      specs: [
        spec("rightUpperLeg", { x: isHalfKneel || isLowLunge ? 1.15 : 0.48, y: -0.04, z: -0.08 }, 0.2),
        spec("leftUpperLeg", { x: isLowLunge ? 0.74 : 0.48, y: 0.04, z: 0.08 }, 0.2),
        spec("rightLowerLeg", { x: isHalfKneel || isLowLunge ? -1.0 : -1.78, y: 0, z: 0.06 }, 0.22),
        spec("leftLowerLeg", { x: -1.78, y: 0, z: -0.06 }, 0.22),
        spec("rightFoot", { x: isHalfKneel || isLowLunge ? 0.06 : -0.58, y: 0, z: 0 }, 0.18),
        spec("leftFoot", { x: -0.58, y: 0, z: 0 }, 0.18),
      ],
      spineSpecs: [
        spineSpec("hips", { x: isLowLunge ? 0.14 : 0.02, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: isLowLunge ? 0.32 : 0.1, y: 0, z: 0 }, 0.16),
        spineSpec("chest", { x: isLowLunge ? 0.26 : 0.08, y: 0, z: 0 }, 0.16),
      ],
    });
  }

  if (supportIntent.key === "hands-feet-floor") {
    const isDownDog = exercisePose.poseKey === "yoga-down-dog-prep";
    const isBearCrawl = exercisePose.poseKey === "bear-crawl-prep";
    const plankLineDepth = !isDownDog && !isBearCrawl
      ? estimateMovementAvatarPlankLineDepth(poseLandmarks)
      : 0;
    const downDogPikeDepth = isDownDog
      ? estimateMovementAvatarDownDogPikeDepth(poseLandmarks)
      : 0;
    const bearCrawlDepth = isBearCrawl
      ? estimateMovementAvatarBearCrawlDepth(poseLandmarks)
      : 0;
    const armReachDepth = Math.max(plankLineDepth, downDogPikeDepth, bearCrawlDepth);
    const upperArmPitch = isDownDog
      ? 0.58 + downDogPikeDepth * 0.48
      : isBearCrawl ? 0.38 + bearCrawlDepth * 0.3 : 0.46 + plankLineDepth * 0.32;
    const lowerArmPitch = isDownDog
      ? 0.04 + downDogPikeDepth * 0.12
      : 0.08 + armReachDepth * 0.12;
    const upperLegPitch = isDownDog
      ? -0.08 - downDogPikeDepth * 0.32
      : isBearCrawl ? 0.18 + bearCrawlDepth * 0.38 : -0.04 - plankLineDepth * 0.08;
    const lowerLegPitch = isDownDog
      ? 0.08 + downDogPikeDepth * 0.24
      : isBearCrawl ? -0.38 - bearCrawlDepth * 0.56 : 0.02 + plankLineDepth * 0.06;
    const footPitch = isDownDog
      ? -0.08 - downDogPikeDepth * 0.16
      : 0.02;
    const hipPitch = isDownDog
      ? -0.08 - downDogPikeDepth * 0.24
      : isBearCrawl ? -0.02 + bearCrawlDepth * 0.06 : -0.04 - plankLineDepth * 0.06;
    const spinePitch = isDownDog
      ? 0.03 + downDogPikeDepth * 0.08
      : 0.02 + armReachDepth * 0.02;
    const chestPitch = isDownDog
      ? 0.04 + downDogPikeDepth * 0.09
      : 0.02 + armReachDepth * 0.03;

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: upperArmPitch, y: 0, z: -0.36 }, 0.18),
        armSpec("rightLowerArm", { x: lowerArmPitch, y: 0, z: -0.08 }, 0.16),
        armSpec("leftUpperArm", { x: upperArmPitch, y: 0, z: 0.36 }, 0.18),
        armSpec("leftLowerArm", { x: lowerArmPitch, y: 0, z: 0.08 }, 0.16),
      ],
      owner: isDownDog
        ? "support-presentation-down-dog"
        : isBearCrawl ? "support-presentation-bear-crawl" : "support-presentation-plank",
      floorPose: isDownDog
        ? movementAvatarFloorPose({ downDogPikeDepth, key: "downDog" })
        : isBearCrawl
          ? movementAvatarFloorPose({ bearCrawlDepth, key: "bearCrawl" })
          : movementAvatarFloorPose({ key: "plank", plankLineDepth }),
      specs: [
        spec("rightUpperLeg", { x: upperLegPitch, y: -0.04, z: -0.04 }, 0.18),
        spec("leftUpperLeg", { x: upperLegPitch, y: 0.04, z: 0.04 }, 0.18),
        spec("rightLowerLeg", { x: lowerLegPitch, y: 0, z: 0.02 }, 0.16),
        spec("leftLowerLeg", { x: lowerLegPitch, y: 0, z: -0.02 }, 0.16),
        spec("rightFoot", { x: footPitch, y: 0, z: 0 }, 0.14),
        spec("leftFoot", { x: footPitch, y: 0, z: 0 }, 0.14),
      ],
      spineSpecs: [
        spineSpec("hips", { x: hipPitch, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: spinePitch, y: 0, z: 0 }, 0.16),
        spineSpec("chest", { x: chestPitch, y: 0, z: 0 }, 0.16),
      ],
    });
  }

  if (supportIntent.key === "hands-knees-floor") {
    const isBirdDog = exercisePose.poseKey === "quadruped-bird-dog-prep";
    const isCat = exercisePose.poseKey === "yoga-cat-prep";
    const isChildPose = exercisePose.poseKey === "yoga-child-pose-prep";
    const isCow = exercisePose.poseKey === "yoga-cow-prep";
    const childFoldDepth = isChildPose
      ? estimateMovementAvatarChildFoldDepth(poseLandmarks)
      : 0;
    const catDepth = isCat ? estimateMovementAvatarCatDepth(poseLandmarks) : 0;
    const cowDepth = isCow ? estimateMovementAvatarCowDepth(poseLandmarks) : 0;
    const childUpperLegPitch = 0.72 + childFoldDepth * 0.58;
    const childLowerLegPitch = -1.12 - childFoldDepth * 0.68;
    const childHipPitch = 0.04 + childFoldDepth * 0.24;
    const childSpinePitch = 0.1 + childFoldDepth * 0.28;
    const childChestPitch = 0.08 + childFoldDepth * 0.22;
    const quadrupedUpperArmPitch = isChildPose
      ? 0.48 + childFoldDepth * 0.28
      : isCat ? 0.62 + catDepth * 0.08 : isCow ? 0.7 - cowDepth * 0.06 : 0.68;
    const quadrupedLowerArmPitch = isChildPose
      ? 0.12 + childFoldDepth * 0.12
      : isCat ? 0.2 + catDepth * 0.08 : isCow ? 0.14 : 0.18;
    const quadrupedHipPitch = isChildPose
      ? childHipPitch
      : isCat ? 0.08 + catDepth * 0.18 : isCow ? -0.12 - cowDepth * 0.14 : -0.06;
    const quadrupedSpinePitch = isChildPose
      ? childSpinePitch
      : isCat ? 0.16 + catDepth * 0.36 : isCow ? -0.08 - cowDepth * 0.28 : isBirdDog ? 0.08 : 0.04;
    const quadrupedChestPitch = isChildPose
      ? childChestPitch
      : isCat ? 0.14 + catDepth * 0.32 : isCow ? -0.12 - cowDepth * 0.34 : isBirdDog ? 0.1 : 0.05;

    return decision({
      armSpecs: isBirdDog
        ? [
            armSpec("rightUpperArm", { x: 0.62, y: 0, z: -0.42 }, 0.18),
            armSpec("rightLowerArm", { x: 0.16, y: 0, z: -0.1 }, 0.16),
            armSpec("leftUpperArm", { x: -0.82, y: 0.06, z: 0.18 }, 0.2),
            armSpec("leftLowerArm", { x: -0.18, y: 0, z: 0.04 }, 0.18),
            armSpec("leftHand", { x: 0, y: 0, z: 0 }, 0.14),
          ]
        : [
            armSpec("rightUpperArm", { x: quadrupedUpperArmPitch, y: 0, z: -0.44 }, 0.18),
            armSpec("rightLowerArm", { x: quadrupedLowerArmPitch, y: 0, z: -0.1 }, 0.16),
            armSpec("leftUpperArm", { x: quadrupedUpperArmPitch, y: 0, z: 0.44 }, 0.18),
            armSpec("leftLowerArm", { x: quadrupedLowerArmPitch, y: 0, z: 0.1 }, 0.16),
          ],
      owner: isChildPose
        ? "support-presentation-child-pose"
        : isCat
          ? "support-presentation-yoga-cat"
          : isCow ? "support-presentation-yoga-cow" : isBirdDog ? "support-presentation-bird-dog" : "support-presentation-all-fours",
      floorPose: isChildPose
        ? movementAvatarFloorPose({ childFoldDepth, key: "childPose" })
        : isCat
          ? movementAvatarFloorPose({ catDepth, key: "cat" })
          : isCow
            ? movementAvatarFloorPose({ cowDepth, key: "cow" })
        : emptyMovementAvatarFloorPose(),
      specs: [
        spec("rightUpperLeg", { x: isChildPose ? childUpperLegPitch : isBirdDog ? -0.18 : 0.72, y: -0.08, z: -0.1 }, 0.2),
        spec("leftUpperLeg", { x: isChildPose ? childUpperLegPitch : 0.76, y: 0.08, z: 0.1 }, 0.2),
        spec("rightLowerLeg", { x: isChildPose ? childLowerLegPitch : isBirdDog ? 0.18 : -1.38, y: 0, z: 0.04 }, 0.2),
        spec("leftLowerLeg", { x: isChildPose ? childLowerLegPitch : -1.38, y: 0, z: -0.04 }, 0.2),
        spec("rightFoot", { x: isBirdDog ? 0.08 : -0.28, y: 0, z: 0 }, 0.16),
        spec("leftFoot", { x: -0.28, y: 0, z: 0 }, 0.16),
      ],
      spineSpecs: [
        spineSpec("hips", { x: quadrupedHipPitch, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: quadrupedSpinePitch, y: 0, z: 0 }, 0.16),
        spineSpec("chest", { x: quadrupedChestPitch, y: 0, z: 0 }, 0.16),
      ],
    });
  }

  if (supportIntent.key === "back-floor") {
    const isBridge = exercisePose.poseKey === "pilates-bridge-prep";
    const isDeadBug = exercisePose.poseKey === "pilates-dead-bug-prep";
    const isDoubleLegStretch = exercisePose.poseKey === "pilates-double-leg-stretch-prep";
    const isHollowHold = exercisePose.poseKey === "pilates-hollow-hold-prep";
    const isHundred = exercisePose.poseKey === "pilates-hundred-prep";
    const isSingleLegStretch = exercisePose.poseKey === "pilates-single-leg-stretch-prep";
    const bridgeLiftDepth = isBridge
      ? estimateMovementAvatarBridgeLiftDepth(poseLandmarks)
      : 0;
    const bridgeUpperLegPitch = 0.48 + bridgeLiftDepth * 0.54;
    const bridgeLowerLegPitch = -0.62 - bridgeLiftDepth * 0.68;
    const bridgeHipPitch = -0.12 - bridgeLiftDepth * 0.24;
    const bridgeSpinePitch = -0.05 - bridgeLiftDepth * 0.11;
    const bridgeChestPitch = -0.02 - bridgeLiftDepth * 0.04;
    const pilatesHundredDepth = isHundred
      ? estimateMovementAvatarPilatesHundredDepth(poseLandmarks)
      : 0;
    const hundredUpperArmPitch = 0.02 + pilatesHundredDepth * 0.16;
    const hundredLowerArmPitch = -0.02 - pilatesHundredDepth * 0.08;
    const hundredUpperLegPitch = 0.24 + pilatesHundredDepth * 0.48;
    const hundredLowerLegPitch = -0.08 - pilatesHundredDepth * 0.24;
    const pilatesSingleLegStretchDepth = isSingleLegStretch
      ? estimateMovementAvatarSingleLegStretchDepth(poseLandmarks)
      : 0;
    const pilatesDoubleLegStretchDepth = isDoubleLegStretch
      ? estimateMovementAvatarDoubleLegStretchDepth(poseLandmarks)
      : 0;
    const pilatesDeadBugDepth = isDeadBug
      ? estimateMovementAvatarDeadBugDepth(poseLandmarks)
      : 0;
    const pilatesHollowHoldDepth = isHollowHold
      ? estimateMovementAvatarHollowHoldDepth(poseLandmarks)
      : 0;
    const deadBugLeftReach = estimateMovementAvatarDeadBugSide(poseLandmarks) ?? "leftArmRightLeg";
    const singleSide = estimateMovementAvatarSingleLegStretchSide(poseLandmarks);
    const singleLiftedSide = singleSide ?? "left";
    const singleReachSide = singleLiftedSide === "left" ? "right" : "left";
    const singleSign = singleLiftedSide === "left" ? 1 : -1;
    const singleLiftPitch = 0.46 + pilatesSingleLegStretchDepth * 0.62;
    const singleReachPitch = 0.08 + pilatesSingleLegStretchDepth * 0.08;
    const doubleArmPitch = -0.22 - pilatesDoubleLegStretchDepth * 0.36;
    const doubleLegPitch = 0.34 + pilatesDoubleLegStretchDepth * 0.46;
    const deadBugLiftPitch = 0.28 + pilatesDeadBugDepth * 0.54;
    const deadBugReachPitch = -0.18 - pilatesDeadBugDepth * 0.24;
    const hollowArmPitch = -0.12 - pilatesHollowHoldDepth * 0.28;
    const hollowLegPitch = 0.24 + pilatesHollowHoldDepth * 0.38;

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: isDoubleLegStretch ? doubleArmPitch : isHollowHold ? hollowArmPitch : isDeadBug && deadBugLeftReach === "rightArmLeftLeg" ? deadBugReachPitch : isHundred ? hundredUpperArmPitch : 0.02, y: 0, z: -0.58 }, 0.14),
        armSpec("leftUpperArm", { x: isDoubleLegStretch ? doubleArmPitch : isHollowHold ? hollowArmPitch : isDeadBug && deadBugLeftReach === "leftArmRightLeg" ? deadBugReachPitch : isHundred ? hundredUpperArmPitch : 0.02, y: 0, z: 0.58 }, 0.14),
        armSpec("rightLowerArm", { x: isDoubleLegStretch ? doubleArmPitch * 0.34 : isHollowHold ? hollowArmPitch * 0.35 : isDeadBug && deadBugLeftReach === "rightArmLeftLeg" ? deadBugReachPitch * 0.35 : isHundred ? hundredLowerArmPitch : 0, y: 0, z: -0.08 }, 0.14),
        armSpec("leftLowerArm", { x: isDoubleLegStretch ? doubleArmPitch * 0.34 : isHollowHold ? hollowArmPitch * 0.35 : isDeadBug && deadBugLeftReach === "leftArmRightLeg" ? deadBugReachPitch * 0.35 : isHundred ? hundredLowerArmPitch : 0, y: 0, z: 0.08 }, 0.14),
      ],
      owner: isHundred
        ? "support-presentation-hundred-prep"
        : isBridge
          ? "support-presentation-bridge"
          : isDeadBug
            ? "support-presentation-dead-bug"
            : isHollowHold
              ? "support-presentation-hollow-hold"
          : isSingleLegStretch
            ? "support-presentation-single-leg-stretch"
            : isDoubleLegStretch
              ? "support-presentation-double-leg-stretch"
              : "support-presentation-supine",
      floorPose: isBridge
          ? movementAvatarFloorPose({ bridgeLiftDepth, key: "bridge" })
        : isHundred
          ? movementAvatarFloorPose({ key: "pilatesHundred", pilatesHundredDepth })
          : isDeadBug
            ? movementAvatarFloorPose({ key: "pilatesDeadBug", pilatesDeadBugDepth })
            : isHollowHold
              ? movementAvatarFloorPose({ key: "pilatesHollowHold", pilatesHollowHoldDepth })
          : isSingleLegStretch
            ? movementAvatarFloorPose({ key: "pilatesSingleLegStretch", pilatesSingleLegStretchDepth })
            : isDoubleLegStretch
              ? movementAvatarFloorPose({ key: "pilatesDoubleLegStretch", pilatesDoubleLegStretchDepth })
              : emptyMovementAvatarFloorPose(),
      specs: [
        spec("rightUpperLeg", { x: isDoubleLegStretch ? doubleLegPitch : isHollowHold ? hollowLegPitch : isDeadBug ? (deadBugLeftReach === "leftArmRightLeg" ? deadBugLiftPitch : 0.16) : isSingleLegStretch ? (singleLiftedSide === "right" ? singleLiftPitch : singleReachPitch) : isHundred ? hundredUpperLegPitch : isBridge ? bridgeUpperLegPitch : 0.18, y: isSingleLegStretch ? -0.05 * singleSign : -0.04, z: isSingleLegStretch ? -0.16 * singleSign : -0.1 }, 0.18),
        spec("leftUpperLeg", { x: isDoubleLegStretch ? doubleLegPitch : isHollowHold ? hollowLegPitch : isDeadBug ? (deadBugLeftReach === "rightArmLeftLeg" ? deadBugLiftPitch : 0.16) : isSingleLegStretch ? (singleLiftedSide === "left" ? singleLiftPitch : singleReachPitch) : isHundred ? hundredUpperLegPitch : isBridge ? bridgeUpperLegPitch : 0.18, y: isSingleLegStretch ? 0.05 * singleSign : 0.04, z: isSingleLegStretch ? 0.16 * singleSign : 0.1 }, 0.18),
        spec("rightLowerLeg", { x: isDoubleLegStretch ? -0.2 - pilatesDoubleLegStretchDepth * 0.22 : isHollowHold ? -0.1 - pilatesHollowHoldDepth * 0.12 : isDeadBug ? (deadBugLeftReach === "leftArmRightLeg" ? -0.42 - pilatesDeadBugDepth * 0.22 : -0.08) : isSingleLegStretch ? (singleReachSide === "right" ? -0.06 : -0.52 - pilatesSingleLegStretchDepth * 0.28) : isHundred ? hundredLowerLegPitch : isBridge ? bridgeLowerLegPitch : -0.22, y: 0, z: 0.04 }, 0.18),
        spec("leftLowerLeg", { x: isDoubleLegStretch ? -0.2 - pilatesDoubleLegStretchDepth * 0.22 : isHollowHold ? -0.1 - pilatesHollowHoldDepth * 0.12 : isDeadBug ? (deadBugLeftReach === "rightArmLeftLeg" ? -0.42 - pilatesDeadBugDepth * 0.22 : -0.08) : isSingleLegStretch ? (singleReachSide === "left" ? -0.06 : -0.52 - pilatesSingleLegStretchDepth * 0.28) : isHundred ? hundredLowerLegPitch : isBridge ? bridgeLowerLegPitch : -0.22, y: 0, z: -0.04 }, 0.18),
        spec("rightFoot", { x: isBridge ? 0.08 : 0.02, y: 0, z: 0 }, 0.15),
        spec("leftFoot", { x: isBridge ? 0.08 : 0.02, y: 0, z: 0 }, 0.15),
      ],
      spineSpecs: [
        spineSpec("hips", { x: isBridge ? bridgeHipPitch : 0, y: 0, z: 0 }, 0.18),
        spineSpec("spine", { x: isBridge ? bridgeSpinePitch : (isSingleLegStretch || isDoubleLegStretch || isDeadBug || isHollowHold) ? 0.04 : 0.01, y: 0, z: 0 }, 0.16),
        spineSpec("chest", { x: isBridge ? bridgeChestPitch : (isSingleLegStretch || isDoubleLegStretch || isDeadBug || isHollowHold) ? 0.05 : 0.01, y: 0, z: 0 }, 0.16),
      ],
    });
  }

  if (supportIntent.key === "chest-floor") {
    const isExtension = exercisePose.poseKey === "prone-back-extension-prep";
    const isSwimming = exercisePose.poseKey === "pilates-swimming-prep";
    const proneExtensionDepth = isExtension
      ? estimateMovementAvatarProneExtensionDepth(poseLandmarks)
      : 0;
    const pilatesSwimmingDepth = isSwimming
      ? estimateMovementAvatarSwimmingDepth(poseLandmarks)
      : 0;
    const extensionUpperArmPitch = 0.24 + proneExtensionDepth * 0.34;
    const extensionLowerArmPitch = -0.34 - proneExtensionDepth * 0.5;
    const extensionUpperLegPitch = -0.04 - proneExtensionDepth * 0.12;
    const extensionLowerLegPitch = 0.04 + proneExtensionDepth * 0.18;
    const extensionHipPitch = -0.02 - proneExtensionDepth * 0.08;
    const extensionSpinePitch = -0.06 - proneExtensionDepth * 0.16;
    const extensionChestPitch = -0.08 - proneExtensionDepth * 0.22;
    const extensionUpperChestPitch = -0.06 - proneExtensionDepth * 0.15;
    const swimmingReachPitch = 0.2 + pilatesSwimmingDepth * 0.38;
    const swimmingLegPitch = -0.04 - pilatesSwimmingDepth * 0.16;

    return decision({
      armSpecs: isExtension
        ? [
            armSpec("rightUpperArm", { x: extensionUpperArmPitch, y: 0, z: -0.35 }, 0.18),
            armSpec("rightLowerArm", { x: extensionLowerArmPitch, y: 0, z: -0.08 }, 0.18),
            armSpec("leftUpperArm", { x: extensionUpperArmPitch, y: 0, z: 0.35 }, 0.18),
            armSpec("leftLowerArm", { x: extensionLowerArmPitch, y: 0, z: 0.08 }, 0.18),
          ]
        : isSwimming
          ? [
              armSpec("rightUpperArm", { x: 0.18, y: 0, z: -0.32 }, 0.16),
              armSpec("rightLowerArm", { x: 0.04, y: 0, z: -0.08 }, 0.14),
              armSpec("leftUpperArm", { x: swimmingReachPitch, y: 0, z: 0.24 }, 0.18),
              armSpec("leftLowerArm", { x: 0.04 + pilatesSwimmingDepth * 0.08, y: 0, z: 0.04 }, 0.14),
            ]
          : [
              armSpec("rightUpperArm", { x: 0.2, y: 0, z: -0.42 }, 0.14),
              armSpec("leftUpperArm", { x: 0.2, y: 0, z: 0.42 }, 0.14),
            ],
      owner: isExtension
        ? "support-presentation-prone-extension"
        : isSwimming ? "support-presentation-swimming-prep" : "support-presentation-prone",
      floorPose: isExtension
        ? movementAvatarFloorPose({ key: "proneExtension", proneExtensionDepth })
        : isSwimming
          ? movementAvatarFloorPose({ key: "pilatesSwimming", pilatesSwimmingDepth })
          : emptyMovementAvatarFloorPose(),
      specs: [
        spec("rightUpperLeg", { x: isSwimming ? swimmingLegPitch : isExtension ? extensionUpperLegPitch : -0.04, y: -0.02, z: -0.05 }, 0.16),
        spec("leftUpperLeg", { x: isSwimming ? -0.02 : isExtension ? extensionUpperLegPitch : -0.04, y: 0.02, z: 0.05 }, 0.16),
        spec("rightLowerLeg", { x: isSwimming ? 0.08 + pilatesSwimmingDepth * 0.16 : isExtension ? extensionLowerLegPitch : 0.04, y: 0, z: 0.03 }, 0.16),
        spec("leftLowerLeg", { x: isExtension ? extensionLowerLegPitch : 0.04, y: 0, z: -0.03 }, 0.16),
        spec("rightFoot", { x: -0.08, y: 0, z: 0 }, 0.14),
        spec("leftFoot", { x: -0.08, y: 0, z: 0 }, 0.14),
      ],
      spineSpecs: [
        spineSpec("hips", { x: isExtension ? extensionHipPitch : 0, y: 0, z: 0 }, 0.16),
        spineSpec("spine", { x: isExtension ? extensionSpinePitch : 0.01, y: 0, z: 0 }, 0.18),
        spineSpec("chest", { x: isExtension ? extensionChestPitch : 0.01, y: 0, z: 0 }, 0.18),
        spineSpec("upperChest", { x: isExtension ? extensionUpperChestPitch : 0.01, y: 0, z: 0 }, 0.16),
      ],
    });
  }

  if (supportIntent.key === "side-body-floor") {
    const isClam = exercisePose.poseKey === "pilates-clam-prep";
    const isLegLift = exercisePose.poseKey === "pilates-side-lying-leg-lift";
    const pilatesClamDepth = isClam
      ? estimateMovementAvatarClamDepth(poseLandmarks)
      : 0;
    const sideLegLiftDepth = isLegLift
      ? estimateMovementAvatarSideLegLiftDepth(poseLandmarks)
      : 0;
    const sideLiftUpperLegPitch = -0.02 - sideLegLiftDepth * 0.26;
    const sideLiftUpperLegSide = -0.08 - sideLegLiftDepth * 0.16;
    const sideLiftLowerLegPitch = -0.02 + sideLegLiftDepth * 0.16;
    const sideLiftHipRoll = 0.04 + sideLegLiftDepth * 0.08;
    const sideLiftSpineRoll = 0.05 + sideLegLiftDepth * 0.08;
    const sideLiftChestRoll = 0.04 + sideLegLiftDepth * 0.07;
    const clamUpperLegSide = -0.1 - pilatesClamDepth * 0.28;
    const clamLowerLegSide = 0.02 + pilatesClamDepth * 0.12;

    return decision({
      armSpecs: [
        armSpec("rightUpperArm", { x: 0.1, y: 0, z: -0.32 }, 0.14),
        armSpec("leftUpperArm", { x: 0.1, y: 0, z: 0.68 }, 0.14),
        armSpec("leftLowerArm", { x: 0, y: 0, z: 0.18 }, 0.14),
      ],
      owner: isClam
        ? "support-presentation-clam-prep"
        : isLegLift ? "support-presentation-side-leg-lift" : "support-presentation-side-lying",
      floorPose: isLegLift
        ? movementAvatarFloorPose({ key: "sideLegLift", sideLegLiftDepth })
        : isClam
          ? movementAvatarFloorPose({ key: "pilatesClam", pilatesClamDepth })
          : emptyMovementAvatarFloorPose(),
      specs: [
        spec("rightUpperLeg", { x: isLegLift ? sideLiftUpperLegPitch : 0.02, y: isLegLift ? sideLiftUpperLegSide : isClam ? clamUpperLegSide : -0.12, z: -0.18 }, 0.18),
        spec("leftUpperLeg", { x: 0.04, y: 0.1, z: 0.16 }, 0.18),
        spec("rightLowerLeg", { x: isLegLift ? sideLiftLowerLegPitch : -0.04, y: isClam ? clamLowerLegSide : 0, z: 0.04 }, 0.16),
        spec("leftLowerLeg", { x: -0.06, y: 0, z: -0.04 }, 0.16),
        spec("rightFoot", { x: 0.02, y: 0, z: 0 }, 0.14),
        spec("leftFoot", { x: 0.02, y: 0, z: 0 }, 0.14),
      ],
      spineSpecs: [
        spineSpec("hips", { x: 0, y: 0, z: isLegLift ? sideLiftHipRoll : 0.04 }, 0.16),
        spineSpec("spine", { x: 0.02, y: 0, z: isLegLift ? sideLiftSpineRoll : 0.05 }, 0.16),
        spineSpec("chest", { x: 0.02, y: 0, z: isLegLift ? sideLiftChestRoll : 0.04 }, 0.16),
      ],
    });
  }

  return none();
}

function estimateMovementAvatarBridgeLiftDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0.7;

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  return smoothstep(shoulderY - hipY, 0.045, 0.16);
}

function estimateMovementAvatarPilatesHundredDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  const leftWrist = poseLandmarks[15];
  const rightWrist = poseLandmarks[16];
  const leftKnee = poseLandmarks[25];
  const rightKnee = poseLandmarks[26];
  const leftAnkle = poseLandmarks[27];
  const rightAnkle = poseLandmarks[28];
  if (
    !leftHip ||
    !rightHip ||
    !leftWrist ||
    !rightWrist ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return 0.7;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const wristLift = hipY - ((leftWrist.y + rightWrist.y) / 2);
  const kneeLift = hipY - ((leftKnee.y + rightKnee.y) / 2);
  const ankleLift = hipY - ((leftAnkle.y + rightAnkle.y) / 2);
  return smoothstep((wristLift * 0.35) + (kneeLift * 0.25) + (ankleLift * 0.4), 0.02, 0.16);
}

function estimateMovementAvatarSingleLegStretchSide(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return null;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const leftLift = ((hipY - leftKnee.y) * 0.45) + ((hipY - leftAnkle.y) * 0.55);
  const rightLift = ((hipY - rightKnee.y) * 0.45) + ((hipY - rightAnkle.y) * 0.55);
  return leftLift >= rightLift ? "left" as const : "right" as const;
}

function estimateMovementAvatarSingleLegStretchDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return 0.7;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const leftLift = ((hipY - leftKnee.y) * 0.45) + ((hipY - leftAnkle.y) * 0.55);
  const rightLift = ((hipY - rightKnee.y) * 0.45) + ((hipY - rightAnkle.y) * 0.55);
  return smoothstep(Math.abs(leftLift - rightLift), 0.08, 0.22);
}

function estimateMovementAvatarDoubleLegStretchDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (
    !leftHip ||
    !rightHip ||
    !leftWrist ||
    !rightWrist ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return 0.7;

  const hipY = (leftHip.y + rightHip.y) / 2;
  const wristReach = ((leftHip.x + rightHip.x) / 2) - ((leftWrist.x + rightWrist.x) / 2);
  const kneeLift = hipY - ((leftKnee.y + rightKnee.y) / 2);
  const ankleLift = hipY - ((leftAnkle.y + rightAnkle.y) / 2);
  return smoothstep((wristReach * 0.35) + (kneeLift * 0.25) + (ankleLift * 0.4), 0.08, 0.28);
}

function estimateMovementAvatarDeadBugSide(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return null;

  const leftArmRightLeg = Math.max(0, centers.shoulderX - leftWrist.x) + Math.max(0, centers.hipY - rightAnkle.y);
  const rightArmLeftLeg = Math.max(0, centers.shoulderX - rightWrist.x) + Math.max(0, centers.hipY - leftAnkle.y);
  return leftArmRightLeg >= rightArmLeftLeg ? "leftArmRightLeg" as const : "rightArmLeftLeg" as const;
}

function estimateMovementAvatarDeadBugDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!centers || !leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return 0.7;

  const leftArmRightLeg = Math.max(0, centers.shoulderX - leftWrist.x) + Math.max(0, centers.hipY - rightAnkle.y);
  const rightArmLeftLeg = Math.max(0, centers.shoulderX - rightWrist.x) + Math.max(0, centers.hipY - leftAnkle.y);
  return smoothstep(Math.max(leftArmRightLeg, rightArmLeftLeg), 0.1, 0.36);
}

function estimateMovementAvatarHollowHoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armLift = centers.shoulderY - centers.wristY;
  const legLift = centers.hipY - centers.ankleY;
  const kneeLift = centers.hipY - centers.kneeY;
  return smoothstep((armLift * 0.4) + (legLift * 0.42) + (kneeLift * 0.18), 0.08, 0.28);
}

function estimateMovementAvatarProneExtensionDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const nose = poseLandmarks[0];
  const leftShoulder = poseLandmarks[11];
  const rightShoulder = poseLandmarks[12];
  const leftHip = poseLandmarks[23];
  const rightHip = poseLandmarks[24];
  if (!nose || !leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0.7;

  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = (leftHip.y + rightHip.y) / 2;
  const shoulderLift = hipY - shoulderY;
  const headLift = hipY - nose.y;
  return smoothstep((shoulderLift * 0.7) + (headLift * 0.3), 0.08, 0.28);
}

function estimateMovementAvatarSwimmingDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftWrist || !rightWrist || !leftAnkle || !rightAnkle) return 0.7;

  const leftArmLift = rightWrist.y - leftWrist.y;
  const rightArmLift = leftWrist.y - rightWrist.y;
  const leftLegLift = rightAnkle.y - leftAnkle.y;
  const rightLegLift = leftAnkle.y - rightAnkle.y;
  return smoothstep(Math.max(
    (leftArmLift * 0.5) + (rightLegLift * 0.5),
    (rightArmLift * 0.5) + (leftLegLift * 0.5),
  ), 0.06, 0.18);
}

function estimateMovementAvatarSideLegLiftDepth(poseLandmarks?: TrackingLandmark[]) {
  if (!poseLandmarks) return 0.7;
  const leftKnee = poseLandmarks[25];
  const rightKnee = poseLandmarks[26];
  const leftAnkle = poseLandmarks[27];
  const rightAnkle = poseLandmarks[28];
  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return 0.7;

  const rightLift = ((leftKnee.y - rightKnee.y) * 0.4) + ((leftAnkle.y - rightAnkle.y) * 0.6);
  const leftLift = ((rightKnee.y - leftKnee.y) * 0.4) + ((rightAnkle.y - leftAnkle.y) * 0.6);
  return smoothstep(Math.max(rightLift, leftLift), 0.08, 0.28);
}

function estimateMovementAvatarClamDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftKnee || !rightKnee || !leftAnkle || !rightAnkle) return 0.7;

  const kneeOpen = Math.abs(leftKnee.y - rightKnee.y);
  const ankleOpen = Math.abs(leftAnkle.y - rightAnkle.y);
  return smoothstep(kneeOpen - (ankleOpen * 0.45), 0.04, 0.2);
}

function getMovementAvatarFloorCenters(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (
    !leftShoulder ||
    !rightShoulder ||
    !leftHip ||
    !rightHip ||
    !leftWrist ||
    !rightWrist ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return null;

  return {
    ankleX: (leftAnkle.x + rightAnkle.x) / 2,
    ankleY: (leftAnkle.y + rightAnkle.y) / 2,
    hipX: (leftHip.x + rightHip.x) / 2,
    hipY: (leftHip.y + rightHip.y) / 2,
    kneeY: (leftKnee.y + rightKnee.y) / 2,
    shoulderX: (leftShoulder.x + rightShoulder.x) / 2,
    shoulderY: (leftShoulder.y + rightShoulder.y) / 2,
    wristX: (leftWrist.x + rightWrist.x) / 2,
    wristY: (leftWrist.y + rightWrist.y) / 2,
  };
}

function estimateMovementAvatarPlankLineDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const hipShoulderAlignment = 1 - Math.min(Math.abs(centers.hipY - centers.shoulderY) / 0.2, 1);
  const handFootAlignment = 1 - Math.min(Math.abs(centers.wristY - centers.ankleY) / 0.18, 1);
  const hipBetweenHandsAndFeet = centers.hipX > centers.wristX && centers.hipX < centers.ankleX + 0.08;
  return Math.max(0, Math.min(1, ((hipShoulderAlignment * 0.55) + (handFootAlignment * 0.45)) * (hipBetweenHandsAndFeet ? 1 : 0.75)));
}

function estimateMovementAvatarDownDogPikeDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const supportY = (centers.wristY + centers.ankleY) / 2;
  const hipLift = supportY - centers.hipY;
  const shoulderBelowHip = centers.shoulderY - centers.hipY;
  return smoothstep((hipLift * 0.7) + (shoulderBelowHip * 0.3), 0.12, 0.38);
}

function estimateMovementAvatarBearCrawlDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  if (!centers) return 0.7;

  const kneeBend = centers.ankleY - centers.kneeY;
  const hipDrop = centers.hipY - centers.shoulderY;
  return smoothstep((kneeBend * 0.7) + (hipDrop * 0.3), 0.12, 0.34);
}

function estimateMovementAvatarChildFoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const hipBehindShoulders = centers.hipX - centers.shoulderX;
  const headDrop = nose.y - centers.shoulderY;
  const handsForward = centers.shoulderX - centers.wristX;
  return smoothstep((hipBehindShoulders * 0.45) + (headDrop * 0.35) + (handsForward * 0.2), 0.12, 0.36);
}

function estimateMovementAvatarCatDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const headDrop = nose.y - centers.shoulderY;
  const backRound = Math.max(0, centers.shoulderY - centers.hipY + 0.06);
  return smoothstep((headDrop * 0.76) + (backRound * 0.24), 0.08, 0.28);
}

function estimateMovementAvatarCowDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const headLift = centers.shoulderY - nose.y;
  const hipDrop = centers.hipY - centers.shoulderY;
  return smoothstep((headLift * 0.62) + (hipDrop * 0.38), 0.08, 0.3);
}

function estimateMovementAvatarStandingCenters(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftWrist = poseLandmarks?.[15];
  const rightWrist = poseLandmarks?.[16];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (
    !leftShoulder ||
    !rightShoulder ||
    !leftWrist ||
    !rightWrist ||
    !leftHip ||
    !rightHip ||
    !leftKnee ||
    !rightKnee ||
    !leftAnkle ||
    !rightAnkle
  ) return null;

  return {
    ankleSpan: Math.abs(leftAnkle.x - rightAnkle.x),
    hipY: (leftHip.y + rightHip.y) / 2,
    kneeY: (leftKnee.y + rightKnee.y) / 2,
    leftAnkle,
    leftKnee,
    leftWrist,
    rightAnkle,
    rightKnee,
    rightWrist,
    shoulderY: (leftShoulder.y + rightShoulder.y) / 2,
    wristSpan: Math.abs(leftWrist.x - rightWrist.x),
    wristY: (leftWrist.y + rightWrist.y) / 2,
  };
}

function estimateMovementAvatarStandingArmRaiseDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  return smoothstep(centers.shoulderY - centers.wristY, 0.08, 0.26);
}

function estimateMovementAvatarStandingTwistDepth(poseLandmarks?: TrackingLandmark[]) {
  const leftShoulder = poseLandmarks?.[11];
  const rightShoulder = poseLandmarks?.[12];
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  if (!leftShoulder || !rightShoulder || !leftHip || !rightHip) return 0.7;

  const shoulderSkew = (leftShoulder.y - rightShoulder.y) + ((leftShoulder.z ?? 0) - (rightShoulder.z ?? 0));
  const hipSkew = (leftHip.y - rightHip.y) + ((leftHip.z ?? 0) - (rightHip.z ?? 0));
  return smoothstep(Math.abs(shoulderSkew - hipSkew), 0.06, 0.22);
}

function estimateMovementAvatarForwardFoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const torsoDrop = centers.shoulderY - 0.42;
  const headDrop = nose.y - centers.shoulderY;
  const handDrop = centers.wristY - centers.hipY;
  return smoothstep((torsoDrop * 0.42) + (headDrop * 0.28) + (handDrop * 0.3), 0.08, 0.34);
}

function estimateMovementAvatarSeatedForwardFoldDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = getMovementAvatarFloorCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const headDrop = nose.y - centers.shoulderY;
  const torsoDrop = centers.shoulderY - 0.42;
  const handDrop = centers.wristY - centers.hipY;
  return smoothstep((headDrop * 0.38) + (torsoDrop * 0.34) + (handDrop * 0.28), 0.08, 0.3);
}

function estimateMovementAvatarSeatedLegLift(poseLandmarks?: TrackingLandmark[]) {
  const leftHip = poseLandmarks?.[23];
  const rightHip = poseLandmarks?.[24];
  const leftKnee = poseLandmarks?.[25];
  const rightKnee = poseLandmarks?.[26];
  const leftAnkle = poseLandmarks?.[27];
  const rightAnkle = poseLandmarks?.[28];
  if (!leftHip || !rightHip || !leftKnee || !rightKnee || !leftAnkle || !rightAnkle) {
    return { depth: 0, side: null as "left" | "right" | null };
  }

  const hipY = (leftHip.y + rightHip.y) / 2;
  const leftLift = ((hipY - leftKnee.y) * 0.35) + ((hipY - leftAnkle.y) * 0.65);
  const rightLift = ((hipY - rightKnee.y) * 0.35) + ((hipY - rightAnkle.y) * 0.65);
  const side = leftLift >= rightLift ? "left" as const : "right" as const;
  return {
    depth: smoothstep(Math.abs(leftLift - rightLift), 0.08, 0.26),
    side,
  };
}

function estimateMovementAvatarHalfLiftDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  const nose = poseLandmarks?.[0];
  if (!centers || !nose) return 0.7;

  const torsoDrop = centers.shoulderY - 0.42;
  const flatBack = Math.max(0, centers.hipY - centers.shoulderY);
  const handToShin = centers.wristY - centers.hipY;
  const headInLine = Math.max(0, centers.hipY - nose.y);
  return smoothstep((torsoDrop * 0.34) + (flatBack * 0.3) + (handToShin * 0.22) + (headInLine * 0.14), 0.12, 0.34);
}

function estimateMovementAvatarChairPoseDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const hipDrop = centers.hipY - centers.shoulderY;
  const kneeDrop = centers.kneeY - centers.hipY;
  const armLift = centers.shoulderY - centers.wristY;
  return smoothstep((hipDrop * 0.42) + (kneeDrop * 0.36) + (armLift * 0.22), 0.18, 0.42);
}

function estimateMovementAvatarForwardLungeDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const kneeAsymmetry = Math.abs(centers.leftKnee.y - centers.rightKnee.y);
  return smoothstep((centers.ankleSpan * 0.46) + (kneeAsymmetry * 0.34) + ((centers.kneeY - centers.hipY) * 0.2), 0.28, 0.7);
}

function estimateMovementAvatarSideLungeDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const kneeAsymmetry = Math.abs(centers.leftKnee.y - centers.rightKnee.y);
  return smoothstep((centers.ankleSpan * 0.56) + (kneeAsymmetry * 0.32), 0.34, 0.78);
}

function estimateMovementAvatarJumpingJackDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armLift = centers.shoulderY - centers.wristY;
  return smoothstep((centers.ankleSpan * 0.48) + (centers.wristSpan * 0.34) + (armLift * 0.18), 0.42, 0.92);
}

function estimateMovementAvatarWarriorOneDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armLift = centers.shoulderY - centers.wristY;
  const kneeAsymmetry = Math.abs(centers.leftKnee.y - centers.rightKnee.y);
  return smoothstep((centers.ankleSpan * 0.5) + (armLift * 0.3) + (kneeAsymmetry * 0.2), 0.36, 0.82);
}

function estimateMovementAvatarWarriorTwoDepth(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return 0.7;

  const armSpan = centers.wristSpan;
  const stanceWidth = centers.ankleSpan;
  const armLevel = 1 - Math.min(Math.abs(centers.wristY - centers.shoulderY) / 0.16, 1);
  return smoothstep((stanceWidth * 0.5) + (armSpan * 0.35) + (armLevel * 0.15), 0.48, 0.92);
}

function estimateMovementAvatarTrianglePose(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return { depth: 0.7, side: "left" as const };

  const leftIsLow = centers.leftWrist.y > centers.rightWrist.y;
  const wristDelta = Math.abs(centers.leftWrist.y - centers.rightWrist.y);
  const lowWristY = Math.max(centers.leftWrist.y, centers.rightWrist.y);
  const highWristY = Math.min(centers.leftWrist.y, centers.rightWrist.y);
  const fold = (wristDelta * 0.48) + ((lowWristY - centers.hipY) * 0.28) + ((centers.shoulderY - highWristY) * 0.24);
  return {
    depth: smoothstep(fold, 0.22, 0.58),
    side: leftIsLow ? "left" as const : "right" as const,
  };
}

function estimateMovementAvatarTreePose(poseLandmarks?: TrackingLandmark[]) {
  const centers = estimateMovementAvatarStandingCenters(poseLandmarks);
  if (!centers) return { depth: 0.7, side: "left" as const };

  const leftLift = Math.max(0, centers.rightAnkle.y - centers.leftAnkle.y);
  const rightLift = Math.max(0, centers.leftAnkle.y - centers.rightAnkle.y);
  const side = leftLift >= rightLift ? "left" as const : "right" as const;
  const liftedAnkle = side === "left" ? centers.leftAnkle : centers.rightAnkle;
  const plantedKnee = side === "left" ? centers.rightKnee : centers.leftKnee;
  const liftedKnee = side === "left" ? centers.leftKnee : centers.rightKnee;
  const footLift = plantedKnee.y - liftedAnkle.y;
  const kneeOpen = Math.abs(liftedKnee.x - liftedAnkle.x);
  return {
    depth: smoothstep((footLift * 0.72) + (kneeOpen * 0.28), 0.04, 0.24),
    side,
  };
}

export function resolveMovementAvatarSupportContactLocks({
  exercisePose,
  supportConstraint,
  supportIntent,
}: {
  exercisePose: MovementExercisePoseDecision;
  supportConstraint: MovementSupportConstraintDecision;
  supportIntent: MovementSupportIntentDecision;
}): MovementAvatarSupportContactLockDecision {
  const inactive = (owner = "support-contact-locks-none"): MovementAvatarSupportContactLockDecision => ({
    anchors: [],
    boneCorrectionScale: 0,
    maxCorrection: 0,
    maxBoneCorrection: 0,
    owner,
    rootCorrectionScale: 0,
    shouldApply: false,
    slerp: 0,
    status: "inactive",
  });
  const anchor = (
    bone: MovementAvatarSupportContactBoneName,
    label: string,
    surface: MovementAvatarSupportContactAnchor["surface"],
    targetOffsetFromFloor: number,
    weight = 1,
  ): MovementAvatarSupportContactAnchor => ({
    bone,
    label,
    surface,
    targetOffsetFromFloor,
    weight,
  });
  const anchorsForPoints = (
    points: MovementContactPoint[],
    fallback: MovementAvatarSupportContactAnchor[],
  ) => {
    const anchors: MovementAvatarSupportContactAnchor[] = [];
    const usedBones = new Set<MovementAvatarSupportContactBoneName>();
    const add = (item: MovementAvatarSupportContactAnchor | null) => {
      if (!item || usedBones.has(item.bone)) return;
      usedBones.add(item.bone);
      anchors.push(item);
    };
    const anchorForPoint = (point: MovementContactPoint): MovementAvatarSupportContactAnchor | null => {
      if (point === "leftFoot") return anchor("leftFoot", "left foot to floor", "floor", 0.02, 0.85);
      if (point === "rightFoot") return anchor("rightFoot", "right foot to floor", "floor", 0.02, 0.85);
      if (point === "leftHand") return anchor("leftHand", "left hand to floor", "floor", 0.03, 0.75);
      if (point === "rightHand") return anchor("rightHand", "right hand to floor", "floor", 0.03, 0.75);
      if (point === "leftKnee") return anchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 0.9);
      if (point === "rightKnee") return anchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 0.9);
      if (point === "leftHip" || point === "rightHip") return anchor("hips", "hips to floor", "floor", 0.08, 0.9);
      if (point === "leftShoulder" || point === "rightShoulder") return anchor("chest", "shoulders to floor", "floor", 0.12, 0.75);
      if (point === "leftElbow") return anchor("leftLowerArm", "left elbow to floor", "floor", 0.07, 0.42);
      if (point === "rightElbow") return anchor("rightLowerArm", "right elbow to floor", "floor", 0.07, 0.42);
      if (point === "seat") return anchor("hips", "pelvis to virtual seat", "chair", 0.62, 1.2);
      if (point === "back") return anchor("spine", "back to floor", "floor", 0.1, 0.95);
      if (point === "belly") return anchor("spine", "belly to floor", "floor", 0.1, 0.72);
      if (point === "chest") return anchor("chest", "chest to floor", "floor", 0.08, 1);
      if (point === "sideBody") return anchor("hips", "side body to floor", "floor", 0.08, 1);
      return null;
    };

    points.forEach((point) => add(anchorForPoint(point)));
    if (anchors.length > 0) return anchors;
    fallback.forEach(add);
    return anchors;
  };
  const partial = ({
    anchors,
    boneCorrectionScale = 0,
    maxCorrection = 0.16,
    maxBoneCorrection = 0,
    owner,
    rootCorrectionScale = 1,
    slerp = 0.12,
  }: {
    anchors: MovementAvatarSupportContactAnchor[];
    boneCorrectionScale?: number;
    maxCorrection?: number;
    maxBoneCorrection?: number;
    owner: string;
    rootCorrectionScale?: number;
    slerp?: number;
  }): MovementAvatarSupportContactLockDecision => ({
    anchors,
    boneCorrectionScale,
    maxCorrection,
    maxBoneCorrection,
    owner,
    rootCorrectionScale,
    shouldApply: anchors.length > 0,
    slerp,
    status: "partial",
  });

  if (supportConstraint.status === "active" || supportIntent.key === "feet-floor") {
    return inactive("support-contact-locks-standing-foot-lock");
  }

  if (!supportConstraint.activeLayers.includes("support-anchor-correction")) {
    return inactive("support-contact-locks-unavailable");
  }

  if (supportIntent.key === "seat-chair") {
    return partial({
      anchors: [
        anchor("hips", "pelvis to virtual seat", "chair", 0.62, 1.2),
        anchor("rightFoot", "right foot to floor", "floor", 0.02, 0.45),
        anchor("leftFoot", "left foot to floor", "floor", 0.02, 0.45),
      ],
      boneCorrectionScale: 0.035,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.025,
      owner: "support-contact-seat-chair",
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "knees-floor") {
    return partial({
      anchors: [
        anchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 1),
        anchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 1),
        anchor("rightFoot", "right foot to floor", "floor", 0.02, 0.4),
        anchor("leftFoot", "left foot to floor", "floor", 0.02, 0.4),
      ],
      boneCorrectionScale: 0.04,
      maxBoneCorrection: 0.03,
      owner: "support-contact-knees-floor",
    });
  }

  if (supportIntent.key === "hands-knees-floor") {
    return partial({
      anchors: [
        anchor("rightHand", "right hand to floor", "floor", 0.03, 0.85),
        anchor("leftHand", "left hand to floor", "floor", 0.03, 0.85),
        anchor("rightLowerLeg", "right knee to floor", "floor", 0.04, 1),
        anchor("leftLowerLeg", "left knee to floor", "floor", 0.04, 1),
      ],
      boneCorrectionScale: 0.05,
      maxCorrection: 0.18,
      maxBoneCorrection: 0.035,
      owner: "support-contact-hands-knees-floor",
      rootCorrectionScale: 0.94,
      slerp: 0.11,
    });
  }

  if (supportIntent.key === "hands-feet-floor") {
    return partial({
      anchors: [
        anchor("rightHand", "right hand to floor", "floor", 0.03, 0.9),
        anchor("leftHand", "left hand to floor", "floor", 0.03, 0.9),
        anchor("rightFoot", "right foot to floor", "floor", 0.02, 1),
        anchor("leftFoot", "left foot to floor", "floor", 0.02, 1),
      ],
      boneCorrectionScale: 0.05,
      maxCorrection: 0.18,
      maxBoneCorrection: 0.035,
      owner: "support-contact-hands-feet-floor",
      rootCorrectionScale: 0.92,
      slerp: 0.11,
    });
  }

  if (supportIntent.key === "back-floor") {
    if (exercisePose.poseKey === "pilates-bridge-prep") {
      return partial({
        anchors: [
          anchor("spine", "upper back to floor", "floor", 0.1, 1),
          anchor("chest", "shoulders to floor", "floor", 0.12, 0.85),
          anchor("leftFoot", "left bridge foot to floor", "floor", 0.02, 1),
          anchor("rightFoot", "right bridge foot to floor", "floor", 0.02, 1),
        ],
        boneCorrectionScale: 0.08,
        maxCorrection: 0.14,
        maxBoneCorrection: 0.055,
        owner: "support-contact-bridge-floor",
        rootCorrectionScale: 0.82,
        slerp: 0.1,
      });
    }

    const fallbackAnchors = [
      anchor("hips", "hips/back to floor", "floor", 0.08, 1),
      anchor("spine", "spine to floor", "floor", 0.1, 0.8),
      anchor("chest", "upper back to floor", "floor", 0.12, 0.7),
    ];

    return partial({
      anchors: anchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.08,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.055,
      owner: "support-contact-back-floor",
      rootCorrectionScale: 0.88,
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "chest-floor") {
    if (exercisePose.poseKey === "prone-back-extension-prep") {
      return partial({
        anchors: [
          anchor("spine", "belly to floor", "floor", 0.1, 0.85),
          anchor("hips", "front hips to floor", "floor", 0.08, 0.9),
          anchor("leftHand", "left cobra hand to floor", "floor", 0.03, 0.85),
          anchor("rightHand", "right cobra hand to floor", "floor", 0.03, 0.85),
          anchor("leftFoot", "left prone foot to floor", "floor", 0.02, 0.5),
          anchor("rightFoot", "right prone foot to floor", "floor", 0.02, 0.5),
        ],
        boneCorrectionScale: 0.075,
        maxCorrection: 0.14,
        maxBoneCorrection: 0.05,
        owner: "support-contact-prone-extension-floor",
        rootCorrectionScale: 0.84,
        slerp: 0.1,
      });
    }

    const fallbackAnchors = [
      anchor("chest", "chest to floor", "floor", 0.08, 1),
      anchor("hips", "front hips to floor", "floor", 0.08, 0.85),
      anchor("spine", "belly to floor", "floor", 0.1, 0.65),
    ];

    return partial({
      anchors: anchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.08,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.055,
      owner: "support-contact-chest-floor",
      rootCorrectionScale: 0.88,
      slerp: 0.1,
    });
  }

  if (supportIntent.key === "side-body-floor") {
    const fallbackAnchors = [
      anchor("hips", "side hip to floor", "floor", 0.08, 1),
      anchor("chest", "side ribs to floor", "floor", 0.1, 0.75),
      anchor("leftUpperArm", "lower arm side support", "floor", 0.08, 0.45),
    ];

    return partial({
      anchors: anchorsForPoints(supportIntent.anchorPoints, fallbackAnchors),
      boneCorrectionScale: 0.075,
      maxCorrection: 0.14,
      maxBoneCorrection: 0.05,
      owner: "support-contact-side-body-floor",
      rootCorrectionScale: 0.86,
      slerp: 0.1,
    });
  }

  return inactive("support-contact-locks-unknown");
}

export function resolveMovementAvatarPlantedSquatIkPose({
  avatarRole,
  depth,
}: {
  avatarRole: "instructor" | "player";
  depth: number;
}): MovementAvatarPlantedSquatIkPoseDecision {
  const ikDepth = smoothstep(depth, 0.16, 0.82);
  if (ikDepth <= 0.001) {
    return {
      ikDepth: 0,
      specs: [],
    };
  }

  const kneeOut = 0.3 * ikDepth;
  const kneeForward = 0.86 * ikDepth;
  const ankleBack = 0.4 * ikDepth;
  const thighDown = 0.72 - ikDepth * 0.2;
  const shinDown = 0.8 - ikDepth * 0.12;
  const footBrace = 0.18 * ikDepth;
  const { footSlerp, legSlerp } = resolveMovementAvatarPlantedSquatIkOptions({
    avatarRole,
  });

  return {
    ikDepth,
    specs: [
      {
        bone: "rightUpperLeg",
        direction: { down: thighDown, side: -kneeOut, forward: kneeForward },
        slerp: legSlerp,
      },
      {
        bone: "leftUpperLeg",
        direction: { down: thighDown, side: kneeOut, forward: kneeForward },
        slerp: legSlerp,
      },
      {
        bone: "rightLowerLeg",
        direction: { down: shinDown, side: kneeOut * 0.38, forward: -ankleBack },
        slerp: legSlerp,
      },
      {
        bone: "leftLowerLeg",
        direction: { down: shinDown, side: -kneeOut * 0.38, forward: -ankleBack },
        slerp: legSlerp,
      },
      {
        bone: "rightFoot",
        direction: { down: 0.08, side: -footBrace * 0.2, forward: 1 },
        slerp: footSlerp,
      },
      {
        bone: "leftFoot",
        direction: { down: 0.08, side: footBrace * 0.2, forward: 1 },
        slerp: footSlerp,
      },
    ],
  };
}

export function resolveMovementAvatarSpineApplyOptions({
  avatarRole,
  shouldApplySpine,
}: {
  avatarRole: "instructor" | "player";
  shouldApplySpine: boolean;
}): MovementAvatarSpineApplyOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    activeDrive: {
      chest: isPlayer ? 0.42 : 0.78,
      hips: isPlayer ? 0.22 : 0.36,
      spine: isPlayer ? 0.44 : 0.82,
      upperChest: isPlayer ? 0.36 : 0.72,
    },
    shouldCountRecordedSpineRetarget: !isPlayer && shouldApplySpine,
    solver: {
      chest: isPlayer ? 0.36 : 0.24,
      hips: isPlayer ? 0.34 : 0.26,
      spine: isPlayer ? 0.42 : 0.28,
      upperChest: isPlayer ? 0.32 : 0.22,
    },
  };
}

export function resolveMovementAvatarActiveSpinePose({
  spineApplyOptions,
  spineDrive,
}: {
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
  spineDrive: MovementAvatarPlayerSpineDrive;
}): MovementAvatarSpineBoneRotationSpec[] {
  return [
    {
      bone: "hips",
      rotation: spineDrive.rotations.hips,
      slerp: spineApplyOptions.activeDrive.hips,
    },
    {
      bone: "spine",
      rotation: spineDrive.rotations.spine,
      slerp: spineApplyOptions.activeDrive.spine,
    },
    {
      bone: "chest",
      rotation: spineDrive.rotations.chest,
      slerp: spineApplyOptions.activeDrive.chest,
    },
    {
      bone: "upperChest",
      rotation: spineDrive.rotations.upperChest,
      slerp: spineApplyOptions.activeDrive.upperChest,
    },
  ];
}

export function resolveMovementAvatarSpineSolverPose({
  avatarRole,
  spineApplyOptions,
}: {
  avatarRole: "instructor" | "player";
  spineApplyOptions: MovementAvatarSpineApplyOptionsDecision;
}): MovementAvatarSpineSolverSpec[] {
  const mirrorZ = avatarRole === "instructor";

  return [
    {
      bone: "hips",
      limits: { x: 0.35, y: 0.75, z: 0.45 },
      mirrorZ,
      scale: 1,
      slerp: spineApplyOptions.solver.hips,
      source: "hips",
    },
    {
      bone: "spine",
      limits: { x: 0.45, y: 0.65, z: 0.45 },
      mirrorZ,
      scale: 0.65,
      slerp: spineApplyOptions.solver.spine,
      source: "spine",
    },
    {
      bone: "chest",
      limits: { x: 0.35, y: 0.5, z: 0.35 },
      mirrorZ,
      scale: 0.35,
      slerp: spineApplyOptions.solver.chest,
      source: "spine",
    },
    {
      bone: "upperChest",
      limits: { x: 0.25, y: 0.35, z: 0.25 },
      mirrorZ,
      scale: 0.2,
      slerp: spineApplyOptions.solver.upperChest,
      source: "spine",
    },
  ];
}

export function resolveMovementAvatarSpineNeutralPose(): MovementAvatarSpineBoneRotationSpec[] {
  return [
    { bone: "hips", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "spine", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "chest", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
    { bone: "upperChest", rotation: { x: 0.01, y: 0, z: 0 }, slerp: 0.14 },
  ];
}

export function resolveMovementAvatarHeadApplyOptions({
  avatarRole,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
}: {
  avatarRole: "instructor" | "player";
  profile?: MovementAvatarTrackingProfile;
}): MovementAvatarHeadApplyOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    headPositionSlerp: 0.3,
    headSlerp: isPlayer ? profile.headSlerp : 0.82,
    upperChestCompensationSlerp: 0.18,
  };
}

export function resolveMovementAvatarHeadApplicationPose({
  headMotionIntent,
  headPitch,
  headRoll,
  headYaw,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  shouldApplyHeadMotion,
  shouldApplyLowerBody,
  shouldApplyPlayerHeadMotion,
  shouldApplySpine,
}: {
  headMotionIntent: MovementHeadMotionIntent;
  headPitch: number;
  headRoll: number;
  headYaw: number;
  profile?: MovementAvatarTrackingProfile;
  shouldApplyHeadMotion: boolean;
  shouldApplyLowerBody: boolean;
  shouldApplyPlayerHeadMotion: boolean;
  shouldApplySpine: boolean;
}): MovementAvatarHeadApplicationPoseDecision {
  return {
    headPositionOffset: shouldApplyPlayerHeadMotion
      ? {
          x: headMotionIntent.lateral * 0.025,
          y: -headMotionIntent.vertical * 0.012,
          z: -headMotionIntent.depth * 0.018,
        }
      : null,
    neckRotation: shouldApplyHeadMotion
      ? {
          rotationOrder: "YXZ",
          x: headPitch * profile.neckPitchShare +
            (shouldApplyPlayerHeadMotion ? headMotionIntent.depth * 0.12 : 0),
          y: headYaw * profile.neckYawShare +
            (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.08 : 0),
          z: headRoll * profile.neckRollShare -
            (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.08 : 0),
        }
      : null,
    upperChestCompensation:
      shouldApplyPlayerHeadMotion && !shouldApplyLowerBody && !shouldApplySpine
        ? {
            x: headMotionIntent.depth * 0.1,
            y: headMotionIntent.lateral * 0.06,
            z: -headMotionIntent.lateral * 0.08,
          }
        : null,
  };
}

export function resolveMovementAvatarHeadBonePitch({
  avatarRole,
  headPitch,
}: {
  avatarRole: "instructor" | "player";
  headPitch: number;
}) {
  return avatarRole === "player" ? -headPitch : headPitch;
}

export function resolveMovementAvatarFootLockOptions({
  avatarRole,
}: {
  avatarRole: "instructor" | "player";
}): MovementAvatarFootLockOptionsDecision {
  const isPlayer = avatarRole === "player";

  return {
    correctionScale: isPlayer ? 0.4 : 0.5,
    engageSlerp: 0.32,
    initialStrength: 0.25,
    maxDriftBeforeReset: 0.55,
    minStrengthBeforeClear: 0.04,
    releaseSlerp: 0.28,
  };
}

export function resolveMovementAvatarFootLockEngagement({
  avatarRole,
  lowerBodyDrive,
  lowerBodyTrackingReady,
  retargetFrame,
  shouldApplyLowerBody,
  shouldHoldPlayerSquatPose = false,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  lowerBodyTrackingReady: boolean;
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose?: boolean;
}): MovementAvatarFootLockEngagementDecision {
  const hasReliablePlantedFeet =
    lowerBodyTrackingReady &&
    shouldApplyLowerBody &&
    retargetFrame.contacts.leftFoot &&
    retargetFrame.contacts.rightFoot &&
    retargetFrame.debug.sourceQuality >= 0.45;

  if (!hasReliablePlantedFeet) {
    return { shouldEngage: false };
  }

  if (avatarRole === "player") {
    return {
      shouldEngage:
        lowerBodyDrive.shouldDrivePlayerSquat ||
        lowerBodyDrive.shouldDrivePlayerLegRaise ||
        shouldHoldPlayerSquatPose,
    };
  }

  return { shouldEngage: true };
}

export function resolveMovementAvatarTrackingFallbackLabels({
  activeSpineOwner,
  armTargets,
  autoCalibrationKind,
  avatarRole,
  bodyConfidence,
  feetOwner,
  hasActiveCalibration,
  hasManualCalibration,
  headMotionIntent,
  headOwner,
  leftArmTrackingReady,
  leftFootSource,
  leftKneeSource,
  lowerBodyIntent,
  lowerBodyOwner,
  lowerBodyTrackingReady,
  rawHead,
  rightArmTrackingReady,
  rightFootSource,
  rightKneeSource,
  shouldApplyLowerBody,
  torsoOwner,
}: {
  activeSpineOwner: string;
  armTargets: MovementAvatarArmTargetsDecision;
  autoCalibrationKind?: string | null;
  avatarRole: "instructor" | "player";
  bodyConfidence: Record<string, number>;
  feetOwner: string;
  hasActiveCalibration: boolean;
  hasManualCalibration: boolean;
  headMotionIntent: MovementHeadMotionIntent;
  headOwner: string;
  leftArmTrackingReady: boolean;
  leftFootSource: string;
  leftKneeSource: string;
  lowerBodyIntent: MovementLowerBodyIntent;
  lowerBodyOwner: string;
  lowerBodyTrackingReady: boolean;
  rawHead: MovementHeadAngles;
  rightArmTrackingReady: boolean;
  rightFootSource: string;
  rightKneeSource: string;
  shouldApplyLowerBody: boolean;
  torsoOwner: string;
}): MovementAvatarTrackingFallbackLabelsDecision {
  const isPlayer = avatarRole === "player";
  const lowerBodyLabel = isPlayer
    ? hasManualCalibration || !hasActiveCalibration
      ? lowerBodyIntent.label
      : `${lowerBodyIntent.label}-auto`
    : "recorded";
  const lowerBodyDebugLabel =
    `${lowerBodyLabel} d${lowerBodyIntent.squatDepth.toFixed(2)} ` +
    `h${lowerBodyIntent.squatSignals.hipDrop.toFixed(2)} ` +
    `k${lowerBodyIntent.squatSignals.kneeBend.toFixed(2)} ` +
    `t${lowerBodyIntent.squatSignals.torsoDrop.toFixed(2)} ` +
    `l${lowerBodyIntent.leftKneeRaise.toFixed(2)} ` +
    `r${lowerBodyIntent.rightKneeRaise.toFixed(2)}`;
  const shouldUseLowerBodySources = lowerBodyTrackingReady && shouldApplyLowerBody;
  const headSource = rawHead.confidence > 0.25 ? rawHead.source : "last-good";

  return {
    armDepth: isPlayer ? "player-2d-safe-arms" : "recorded-depth-arms",
    baseline: hasManualCalibration
      ? "manual-calibration"
      : hasActiveCalibration
        ? `${autoCalibrationKind ?? "auto"}-auto-baseline`
        : "none",
    floor: shouldUseLowerBodySources &&
      ((bodyConfidence.leftFoot ?? 0) > 0.35 || (bodyConfidence.rightFoot ?? 0) > 0.35)
      ? isPlayer
        ? hasManualCalibration ? "calibrated-floor" : "auto-floor"
        : "recorded-floor"
      : "fixed-floor",
    head: hasManualCalibration
      ? headSource
      : hasActiveCalibration
        ? `${headSource}-auto`
        : "neutral",
    headMotion: hasActiveCalibration ? headMotionIntent.label : "uncalibrated",
    leftArm: leftArmTrackingReady ? armTargets.left.wristSource : "relaxed-arm",
    leftFoot: shouldUseLowerBodySources ? leftFootSource : "neutral-stance",
    leftKnee: shouldUseLowerBodySources ? leftKneeSource : "neutral-stance",
    lowerBody: shouldUseLowerBodySources ? lowerBodyDebugLabel : "neutral-stance",
    owners: `head ${headOwner}; torso ${torsoOwner}; lower ${lowerBodyOwner}; feet ${feetOwner}`,
    rightArm: rightArmTrackingReady ? armTargets.right.wristSource : "relaxed-arm",
    rightFoot: shouldUseLowerBodySources ? rightFootSource : "neutral-stance",
    rightKnee: shouldUseLowerBodySources ? rightKneeSource : "neutral-stance",
    spine: activeSpineOwner,
  };
}

export function resolveMovementAvatarArmDecision({
  bodyConfidence,
  isPlayer,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  side,
}: {
  bodyConfidence: Record<string, number>;
  isPlayer: boolean;
  profile?: MovementAvatarTrackingProfile;
  side: MovementAvatarArmSide;
}): MovementAvatarArmDecision {
  const shoulderKey = side === "left" ? "leftShoulder" : "rightShoulder";
  const elbowKey = side === "left" ? "leftElbow" : "rightElbow";
  const wristKey = side === "left" ? "leftWrist" : "rightWrist";
  const handKey = side === "left" ? "leftHand" : "rightHand";
  const endpointConfidence = Math.max(bodyConfidence[wristKey] ?? 0, bodyConfidence[handKey] ?? 0);
  const isTrackingReady =
    !isPlayer ||
    (
      (bodyConfidence[shoulderKey] ?? 0) >= profile.armVisibility &&
      endpointConfidence >= profile.armVisibility &&
      (
        (bodyConfidence[elbowKey] ?? 0) >= profile.armVisibility ||
        (bodyConfidence[handKey] ?? 0) >= 0.15
      )
    );

  return {
    endpointConfidence,
    isTrackingReady,
    side,
    unreadyFallback: isPlayer && endpointConfidence >= 0.12 ? "hold-last-good" : "relax",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(value: number, min: number, max: number) {
  if (min === max) return value < min ? 0 : 1;
  const x = clamp((value - min) / (max - min), 0, 1);
  return x * x * (3 - 2 * x);
}

function lerp(start: number, end: number, amount: number) {
  return start + (end - start) * amount;
}

function smoothLowerBodyValue(current: number, target: number, rise: number, fall: number) {
  const factor = target > current ? rise : fall;
  const next = lerp(current, target, factor);
  return target <= 0.001 && next < 0.025 ? 0 : next;
}

function smoothInstructorSquatDepth(current: number, sourceDepth: number) {
  const enterThreshold = current > 0.08 ? 0.08 : 0.2;
  const target = sourceDepth >= enterThreshold ? sourceDepth : 0;
  return smoothLowerBodyValue(current, target, 0.2, 0.1);
}

function resolveFrontBodyArmBias({
  elbow,
  side,
  leftHip,
  leftShoulder,
  rightHip,
  rightShoulder,
  wrist,
}: {
  elbow?: MovementAvatarTargetLandmark | null;
  side: MovementAvatarArmSide;
  leftHip?: MovementAvatarTargetLandmark | null;
  leftShoulder?: MovementAvatarTargetLandmark | null;
  rightHip?: MovementAvatarTargetLandmark | null;
  rightShoulder?: MovementAvatarTargetLandmark | null;
  wrist?: MovementAvatarTargetLandmark | null;
}) {
  if (!leftShoulder || !rightShoulder || !wrist) return 0;

  const shoulderSpan = Math.abs(leftShoulder.x - rightShoulder.x);
  if (shoulderSpan < 0.05) return 0;

  const sameShoulder = side === "left" ? leftShoulder : rightShoulder;
  const oppositeShoulder = side === "left" ? rightShoulder : leftShoulder;
  const crossAmount = (wrist.x - sameShoulder.x) / (oppositeShoulder.x - sameShoulder.x);
  const crossScore = smoothstep(crossAmount, 0.35, 1.05);
  const shoulderY = (leftShoulder.y + rightShoulder.y) / 2;
  const hipY = leftHip && rightHip
    ? (leftHip.y + rightHip.y) / 2
    : shoulderY + shoulderSpan * 1.85;
  const minX = Math.min(leftShoulder.x, rightShoulder.x) - shoulderSpan * 0.35;
  const maxX = Math.max(leftShoulder.x, rightShoulder.x) + shoulderSpan * 0.35;
  const minY = Math.min(shoulderY, hipY) - shoulderSpan * 0.65;
  const maxY = Math.max(shoulderY, hipY) + shoulderSpan * 0.35;

  const getTorsoScore = (point?: MovementAvatarTargetLandmark | null) => {
    if (!point || point.visibility < 0.2) return 0;
    if (point.x < minX || point.x > maxX || point.y < minY || point.y > maxY) return 0;

    const centerX = (leftShoulder.x + rightShoulder.x) / 2;
    const centered = 1 - clamp(
      Math.abs(point.x - centerX) / (shoulderSpan * 0.9),
      0,
      1,
    );
    return 0.55 + centered * 0.45;
  };

  const wristScore = getTorsoScore(wrist);
  const elbowScore = getTorsoScore(elbow) * 0.75;
  const visibility = Math.min(leftShoulder.visibility, rightShoulder.visibility, wrist.visibility);
  if (visibility < 0.2) return 0;

  return Math.max(crossScore, wristScore, elbowScore) * 0.34;
}

function buildFrontBodyElbowTarget({
  elbow,
  frontBias,
  shoulder,
  wrist,
}: {
  elbow?: MovementAvatarTargetLandmark | null;
  frontBias: number;
  shoulder?: MovementAvatarTargetLandmark | null;
  wrist?: MovementAvatarTargetLandmark | null;
}): MovementAvatarTargetLandmark | null {
  if (!elbow || !shoulder || !wrist || frontBias <= 0.001) return elbow ?? null;

  const strength = clamp(frontBias / 0.34, 0, 1);
  const guidedElbow: MovementAvatarTargetLandmark = {
    x: shoulder.x + (wrist.x - shoulder.x) * 0.46,
    y: shoulder.y + (wrist.y - shoulder.y) * 0.68,
    z: wrist.z,
    visibility: Math.max(0.35, Math.min(elbow.visibility, shoulder.visibility, wrist.visibility)),
    isSnapped: elbow.isSnapped || wrist.isSnapped,
  };

  return {
    x: lerp(elbow.x, guidedElbow.x, strength),
    y: lerp(elbow.y, guidedElbow.y, strength),
    z: lerp(elbow.z, guidedElbow.z, strength),
    visibility: guidedElbow.visibility,
    isSnapped: guidedElbow.isSnapped,
  };
}

function resolveMovementAvatarArmTarget({
  handWristFallback,
  isPlayer,
  playerLandmarks,
  safeZScale,
  side,
  solverLandmarks,
}: {
  handWristFallback?: MovementAvatarTargetLandmark | null;
  isPlayer: boolean;
  playerLandmarks: MovementAvatarTargetLandmark[];
  safeZScale?: number;
  side: MovementAvatarArmSide;
  solverLandmarks: MovementAvatarTargetLandmark[];
}): MovementAvatarArmTargetDecision {
  const shoulderIndex = side === "left" ? 11 : 12;
  const elbowIndex = side === "left" ? 13 : 14;
  const wristIndex = side === "left" ? 15 : 16;
  const poseTarget = isPlayer ? playerLandmarks[wristIndex] : solverLandmarks[wristIndex];
  const wristSelection = selectMovementTrackingEndpoint({
    poseTarget,
    secondaryTarget: isPlayer ? handWristFallback : null,
    preferSecondaryWhenPoseBelow: 0.65,
  });
  const wristTarget =
    (wristSelection.target as MovementAvatarTargetLandmark | null) ??
    poseTarget ??
    null;
  const frontBias = isPlayer
    ? resolveFrontBodyArmBias({
        elbow: playerLandmarks[elbowIndex],
        side,
        leftHip: playerLandmarks[23],
        leftShoulder: playerLandmarks[11],
        rightHip: playerLandmarks[24],
        rightShoulder: playerLandmarks[12],
        wrist: wristTarget,
      })
    : 0;
  const elbowTarget = isPlayer
    ? buildFrontBodyElbowTarget({
        elbow: playerLandmarks[elbowIndex],
        frontBias,
        shoulder: playerLandmarks[shoulderIndex],
        wrist: wristTarget,
      })
    : playerLandmarks[elbowIndex] ?? null;

  return {
    elbowTarget,
    frontBias,
    safeZScale,
    wristSource: wristSelection.source,
    wristTarget,
  };
}

export function resolveMovementAvatarArmTargets({
  handWristFallbacks = {},
  isPlayer,
  lowerBodyDrive,
  playerLandmarks,
  solverLandmarks,
}: {
  handWristFallbacks?: Partial<Record<MovementAvatarArmSide, MovementAvatarTargetLandmark | null>>;
  isPlayer: boolean;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerLandmarks: MovementAvatarTargetLandmark[];
  solverLandmarks: MovementAvatarTargetLandmark[];
}): MovementAvatarArmTargetsDecision {
  const safeZScale = isPlayer
    ? (lowerBodyDrive.shouldDrivePlayerSquat ? 0.32 : 0.24)
    : undefined;

  return {
    left: resolveMovementAvatarArmTarget({
      handWristFallback: handWristFallbacks.left,
      isPlayer,
      playerLandmarks,
      safeZScale,
      side: "left",
      solverLandmarks,
    }),
    right: resolveMovementAvatarArmTarget({
      handWristFallback: handWristFallbacks.right,
      isPlayer,
      playerLandmarks,
      safeZScale,
      side: "right",
      solverLandmarks,
    }),
  };
}

export function resolveMovementAvatarLowerBodyTargetSelections({
  avatarRole,
  landmarks,
}: {
  avatarRole: "instructor" | "player";
  landmarks: TrackingLandmark[];
}): MovementAvatarLowerBodyTargetSelectionsDecision {
  const endpointVisibilityThreshold = avatarRole === "player" ? 0.18 : 0.2;

  return {
    endpointVisibilityThreshold,
    rightKnee: selectMovementKneeTarget({
      hip: landmarks[24],
      knee: landmarks[26],
      ankle: landmarks[28],
      side: "right",
    }),
    leftKnee: selectMovementKneeTarget({
      hip: landmarks[23],
      knee: landmarks[25],
      ankle: landmarks[27],
      side: "left",
    }),
    rightAnkle: selectMovementTrackingEndpoint({
      poseTarget: landmarks[28],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
    leftAnkle: selectMovementTrackingEndpoint({
      poseTarget: landmarks[27],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
    rightToe: selectMovementTrackingEndpoint({
      poseTarget: landmarks[32],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
    leftToe: selectMovementTrackingEndpoint({
      poseTarget: landmarks[31],
      poseVisibilityThreshold: endpointVisibilityThreshold,
    }),
  };
}

export function resolveMovementAvatarRecordedHeadAngles({
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rawHead,
}: {
  profile?: MovementAvatarTrackingProfile;
  rawHead: MovementHeadAngles;
}): MovementHeadAngles {
  const poseOnlyHeadScale = rawHead.source === "pose"
    ? { pitch: 0.38, roll: 0.22, yaw: 0.28 }
    : { pitch: 0.72, roll: 0.48, yaw: 0.52 };

  return {
    pitch: clamp(
      rawHead.pitch * poseOnlyHeadScale.pitch + profile.headPitchOffset,
      Math.max(profile.minHeadPitch, -0.18),
      Math.min(profile.maxHeadPitch, 0.24),
    ),
    yaw: clamp(
      rawHead.yaw * poseOnlyHeadScale.yaw + profile.headYawOffset,
      -Math.min(profile.maxHeadYaw, 0.2),
      Math.min(profile.maxHeadYaw, 0.2),
    ),
    roll: clamp(
      rawHead.roll * poseOnlyHeadScale.roll + profile.headRollOffset,
      -Math.min(profile.maxHeadRoll, 0.12),
      Math.min(profile.maxHeadRoll, 0.12),
    ),
    confidence: rawHead.confidence,
    source: rawHead.source,
  };
}

export function resolveMovementAvatarRawHeadDecision({
  faceLandmarks,
  poseLandmarks,
}: {
  faceLandmarks?: TrackingLandmark[] | null;
  poseLandmarks: TrackingLandmark[];
}): MovementAvatarRawHeadDecision {
  const selectedFaceLandmarks = faceLandmarks ?? null;

  return {
    faceLandmarks: selectedFaceLandmarks,
    rawHead: estimateMovementHeadAngles({
      faceLandmarks: selectedFaceLandmarks,
      poseLandmarks,
    }),
  };
}

export function resolveMovementAvatarHeadDecision({
  avatarRole,
  calibration,
  headMotionIntent,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  rawHead,
}: {
  avatarRole: "instructor" | "player";
  calibration: MovementCalibration | null;
  headMotionIntent: MovementHeadMotionIntent;
  profile?: MovementAvatarTrackingProfile;
  rawHead: MovementHeadAngles;
}): MovementAvatarHeadDecision {
  const isPlayer = avatarRole === "player";
  const recordedHeadTrackingReady =
    !isPlayer &&
    (
      (rawHead.source === "face" && rawHead.confidence >= 0.35) ||
      (rawHead.source === "pose" && rawHead.confidence >= 0.75)
    );
  const shouldApplyPlayerHeadMotion = isPlayer && Boolean(calibration);
  const calibratedPlayerHead = shouldApplyPlayerHeadMotion
    ? applyHeadCalibration({
        rawHead,
        calibration,
        profile,
      })
    : null;
  const appliedHead = calibratedPlayerHead
    ? resolveMovementAvatarMirrorHeadForDisplay({
        avatarRole,
        head: calibratedPlayerHead,
      })
    : recordedHeadTrackingReady
      ? resolveMovementAvatarRecordedHeadAngles({
          profile,
          rawHead,
        })
      : getNeutralMovementHeadAngles(profile);
  const shouldApplyHeadMotion = shouldApplyPlayerHeadMotion || recordedHeadTrackingReady;
  const headOwner = shouldApplyPlayerHeadMotion
    ? "player-calibrated"
    : recordedHeadTrackingReady
      ? `recorded-${rawHead.source}`
      : "neutral";
  return {
    appliedHead,
    headOwner,
    headPitch: appliedHead.pitch + (shouldApplyPlayerHeadMotion ? headMotionIntent.depth * 0.22 : 0),
    headRoll: appliedHead.roll + (shouldApplyPlayerHeadMotion ? -headMotionIntent.lateral * 0.16 : 0),
    headYaw: appliedHead.yaw + (shouldApplyPlayerHeadMotion ? headMotionIntent.lateral * 0.18 : 0),
    shouldApplyHeadMotion,
    shouldApplyPlayerHeadMotion,
  };
}

export function resolveMovementAvatarMirrorHeadForDisplay({
  avatarRole,
  head,
}: {
  avatarRole: "instructor" | "player";
  head: MovementHeadAngles;
}): MovementHeadAngles {
  if (avatarRole !== "player") return head;

  return {
    ...head,
    roll: -head.roll,
    yaw: -head.yaw,
  };
}

export function resolveMovementAvatarHeadWorldYaw({
  avatarRootYaw,
  headYaw,
}: {
  avatarRootYaw: number;
  headYaw: number;
}) {
  return avatarRootYaw + headYaw;
}

export function resolveMovementAvatarPlayerSourceOwnerDecision({
  avatarRole,
  decision,
  playerSquatPresentationDepth,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  decision: MovementAvatarPipelineDecision;
  playerSquatPresentationDepth: number;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarPlayerSourceOwnerDecision {
  const playerRetargetLowerBodyMotion = avatarRole === "player"
    ? Math.max(
        playerSquatPresentationDepth,
        decision.retargetFrame.squatDepth,
        decision.retargetFrame.kneeLift.left,
        decision.retargetFrame.kneeLift.right,
        decision.lowerBodySegmentMotion,
      )
    : decision.playerRetargetLowerBodyMotion;

  return {
    lowerBodyOwnerDecision: avatarRole === "player"
      ? resolveMovementAvatarPlayerLowerBodyOwners({
          lowerBodyDrive: decision.lowerBodyDrive,
          lowerBodySegmentMotion: decision.lowerBodySegmentMotion,
          lowerBodyTrackingReady: decision.lowerBodyTrackingReady,
          playerRetargetLowerBodyMotion,
          retargetSourceQuality: decision.retargetFrame.debug.sourceQuality,
          shouldApplyLowerBody: decision.shouldApplyLowerBody,
          shouldHoldPlayerSquatPose,
          solvedFootSegments: decision.retargetSolvedFeet,
          solvedLegSegments: decision.retargetSolvedLegs,
          solvedLowerBodySegments: decision.retargetSolvedLegs + decision.retargetSolvedFeet,
          totalSolvedSegments: decision.retargetFrame.debug.solvedSegments.length,
        })
      : null,
    playerRetargetLowerBodyMotion,
  };
}

export function resolveMovementAvatarAppliedLowerBodyDecision({
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
}: {
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
  retargetFrame: MovementRetargetFrame;
  shouldApplyLowerBody: boolean;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarAppliedLowerBodyDecision {
  const isPlayer = avatarRole === "player";
  const retargetOwnsLowerBody =
    appliedLegSegments >= 4 &&
    retargetFrame.debug.sourceQuality >= 0.45;
  const shouldUseLegacyLowerBody = !retargetOwnsLowerBody;
  const shouldUseRecordedSquatPresentation =
    !isPlayer &&
    instructorSquatPresentationDepth > 0.18 &&
    balancedPlantedSquatDepth === 0;
  const playerAppliedOwnerDecision = isPlayer
    ? resolveMovementAvatarPlayerLowerBodyOwners({
        lowerBodyDrive,
        lowerBodySegmentMotion,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        retargetSourceQuality: retargetFrame.debug.sourceQuality,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        solvedFootSegments: appliedFootSegments,
        solvedLegSegments: appliedLegSegments,
        solvedLowerBodySegments: appliedLowerBodySegments,
        totalSolvedSegments: retargetFrame.debug.solvedSegments.length,
      })
    : null;
  const shouldUsePlayerFootFallback =
    playerAppliedOwnerDecision?.shouldUsePlayerFootFallback ?? false;
  const lowerBodyOwner = playerAppliedOwnerDecision?.lowerBodyOwner ?? (retargetOwnsLowerBody
    ? "recorded-retarget"
    : appliedLowerBodySegments > 0
      ? "retarget-legacy-fallback"
      : "legacy-fallback");
  const feetOwner = shouldUsePlayerFootFallback
    ? "player-legacy-foot-fallback"
    : playerAppliedOwnerDecision?.feetOwner ?? (appliedFootSegments > 0 ? "recorded-retarget" : "neutral");

  return {
    feetOwner,
    lowerBodyOwner,
    playerAppliedOwnerDecision,
    retargetOwnsLowerBody,
    shouldUseLegacyLowerBody,
    shouldUsePlayerFootFallback,
    shouldUseRecordedSquatPresentation,
  };
}

export function resolveMovementAvatarPlantedFootOwner(currentOwner: string) {
  if (currentOwner.includes("planted-flat")) return currentOwner;
  if (currentOwner === "neutral") return "planted-flat";
  return `${currentOwner}+planted-flat`;
}

export function resolveMovementAvatarRetargetSegmentApplication({
  avatarRole,
  hasWorldLandmarks,
  instructorSquatPresentationDepth,
  lowerBodySegmentMotion,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  retargetFrame,
  segmentName,
  segmentType,
  shouldUseRetargetedUpperBody,
}: {
  avatarRole: "instructor" | "player";
  hasWorldLandmarks: boolean;
  instructorSquatPresentationDepth: number;
  lowerBodySegmentMotion: number;
  profile?: MovementAvatarTrackingProfile;
  retargetFrame: MovementRetargetFrame;
  segmentName: MovementRetargetSegmentName;
  segmentType: MovementAvatarRetargetSegmentType;
  shouldUseRetargetedUpperBody: boolean;
}): MovementAvatarRetargetSegmentApplicationDecision {
  const isPlayer = avatarRole === "player";
  const segment = retargetFrame.segments[segmentName];
  const useReplayUpperBodySlerp = shouldUseRetargetedUpperBody && segmentType === "arm";
  const slerp = segmentType === "foot"
    ? (isPlayer ? profile.footSlerp : 0.36)
    : segmentType === "arm"
      ? segmentName.includes("UpperArm")
        ? (useReplayUpperBodySlerp ? 0.72 : isPlayer ? profile.upperArmSlerp : 0.72)
        : (useReplayUpperBodySlerp ? 0.78 : isPlayer ? profile.lowerArmSlerp : 0.78)
      : segmentType === "spine"
        ? (isPlayer ? 0.32 : 0.66)
        : (isPlayer ? profile.legSlerp : 0.42);

  const inactiveDecision = (
    reason: MovementAvatarRetargetSegmentApplicationDecision["reason"],
  ): MovementAvatarRetargetSegmentApplicationDecision => ({
    reason,
    shouldApply: false,
    slerp,
    zScale: hasWorldLandmarks ? 1 : 0.18,
  });

  if (!segment || segment.confidence < 0.3) return inactiveDecision("low-confidence");

  const presentationSquatDepth = isPlayer
    ? retargetFrame.squatDepth
    : instructorSquatPresentationDepth;
  const activeFootMotion = Math.max(
    presentationSquatDepth,
    lowerBodySegmentMotion,
    retargetFrame.kneeLift.left,
    retargetFrame.kneeLift.right,
  );

  if (!isPlayer && segmentType === "foot" && activeFootMotion < 0.22) {
    return inactiveDecision("recorded-foot-low-motion");
  }

  if (!isPlayer && segmentType === "foot") {
    const isLeftFoot = segmentName === "leftFoot";
    const isPlanted = isLeftFoot
      ? retargetFrame.contacts.leftFoot
      : retargetFrame.contacts.rightFoot;
    const kneeLift = isLeftFoot
      ? retargetFrame.kneeLift.left
      : retargetFrame.kneeLift.right;

    if (isPlanted) return inactiveDecision("recorded-foot-planted");
    if (kneeLift < 0.45) return inactiveDecision("recorded-foot-low-knee-lift");
  }

  return {
    reason: "active",
    shouldApply: true,
    slerp,
    zScale: hasWorldLandmarks ? 1 : 0.18,
  };
}

export function resolveMovementAvatarInactiveLowerBodyDecision({
  avatarRole,
  lowerBodySourceReliable,
}: {
  avatarRole: "instructor" | "player";
  lowerBodySourceReliable: boolean;
}): MovementAvatarInactiveLowerBodyDecision {
  if (avatarRole === "instructor" && !lowerBodySourceReliable) {
    return {
      feetOwner: "recorded-source-limited",
      lowerBodyOwner: "recorded-source-limited",
    };
  }

  return {
    feetOwner: null,
    lowerBodyOwner: null,
  };
}

export function resolveMovementAvatarLowerBodyApplicationStage({
  avatarRole,
  instructorLowerBodyMotion,
  lowerBodyDrive,
  playerRetargetLowerBodyMotion,
  sourceOwnerDecision,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  instructorLowerBodyMotion: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerRetargetLowerBodyMotion: number;
  sourceOwnerDecision: MovementAvatarPlayerLowerBodyOwnerDecision | null;
  shouldHoldPlayerSquatPose: boolean;
}): MovementAvatarLowerBodyApplicationStageDecision {
  const isPlayer = avatarRole === "player";
  const playerLegRaiseOwner =
    isPlayer &&
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    lowerBodyDrive.playerLegRaiseSide
      ? `player-${lowerBodyDrive.playerLegRaiseSide}-leg-raise`
      : null;
  const anchoredPlayerLegRaiseSide =
    isPlayer &&
    lowerBodyDrive.shouldDrivePlayerLegRaise &&
    lowerBodyDrive.playerLegRaiseSide
      ? lowerBodyDrive.playerLegRaiseSide
      : null;
  const canUsePlayerRetargetLegRaise =
    sourceOwnerDecision?.canUsePlayerRetargetLegRaise ?? false;

  if (anchoredPlayerLegRaiseSide && !canUsePlayerRetargetLegRaise) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: sourceOwnerDecision?.feetOwner ?? "neutral",
      lowerBodyOwner: sourceOwnerDecision?.lowerBodyOwner ?? playerLegRaiseOwner ?? "player-leg-raise",
      stage: "player-leg-raise",
    };
  }

  if (isPlayer && (lowerBodyDrive.shouldDrivePlayerSquat || shouldHoldPlayerSquatPose)) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: sourceOwnerDecision?.feetOwner ?? "recorded-retarget",
      lowerBodyOwner: sourceOwnerDecision?.lowerBodyOwner ?? (lowerBodyDrive.shouldDrivePlayerSquat
        ? "player-stable-squat"
        : "player-stable-squat-held"),
      stage: "player-squat",
    };
  }

  const shouldKeepNeutralPlayerLowerBody =
    isPlayer &&
    lowerBodyDrive.playerLowerBodyState === "neutral" &&
    playerRetargetLowerBodyMotion < 0.32 &&
    !sourceOwnerDecision?.shouldUsePlayerFootFallback;

  if (isPlayer && (shouldKeepNeutralPlayerLowerBody || playerRetargetLowerBodyMotion < 0.16)) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: "neutral",
      lowerBodyOwner: "player-lower-body-neutral",
      stage: "player-neutral",
    };
  }

  if (!isPlayer && instructorLowerBodyMotion < 0.08) {
    return {
      anchoredPlayerLegRaiseSide: null,
      canUsePlayerRetargetLegRaise: false,
      feetOwner: "neutral",
      lowerBodyOwner: "recorded-neutral",
      stage: "recorded-neutral",
    };
  }

  return {
    anchoredPlayerLegRaiseSide,
    canUsePlayerRetargetLegRaise,
    feetOwner: "neutral",
    lowerBodyOwner: "neutral",
    stage: "retarget",
  };
}

export function resolveMovementAvatarLowerBodyVisualDecision({
  avatarRole,
  lowerBodyDrive,
  previousState,
  recordedSquatPresentationDepth,
}: {
  avatarRole: "instructor" | "player";
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  previousState: MovementAvatarLowerBodyVisualState;
  recordedSquatPresentationDepth: number;
}): MovementAvatarLowerBodyVisualDecision {
  if (avatarRole === "player") {
    const state = {
      squatPresentationDepth: smoothLowerBodyValue(
        previousState.squatPresentationDepth,
        lowerBodyDrive.playerSquatPresentationDepth,
        lowerBodyDrive.shouldDrivePlayerSquat ? 0.22 : 0.12,
        0.2,
      ),
      visualRootDrop: smoothLowerBodyValue(
        previousState.visualRootDrop,
        lowerBodyDrive.visualRootDrop,
        0.2,
        0.22,
      ),
    };

    return {
      instructorSquatPresentationDepth: recordedSquatPresentationDepth,
      playerSquatPresentationDepth: state.squatPresentationDepth,
      state,
      visualRootDrop: state.visualRootDrop,
    };
  }

  const squatPresentationDepth = smoothInstructorSquatDepth(
    previousState.squatPresentationDepth,
    recordedSquatPresentationDepth,
  );
  const visualRootDrop = smoothLowerBodyValue(
    previousState.visualRootDrop,
    squatPresentationDepth * 0.56,
    0.18,
    0.12,
  );
  const state = {
    squatPresentationDepth,
    visualRootDrop,
  };

  return {
    instructorSquatPresentationDepth: squatPresentationDepth,
    playerSquatPresentationDepth: squatPresentationDepth,
    state,
    visualRootDrop,
  };
}

export function resolveMovementAvatarPipelineDecision({
  avatarTrackingProfile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  avatarRole,
  calibration,
  retargetSourceModel,
  shouldHoldPlayerSquatPose = false,
  source,
}: MovementAvatarPipelineInput): MovementAvatarPipelineDecision {
  const isPlayer = avatarRole === "player";
  const bodyConfidence = getMovementBodyConfidence(source.poseLandmarks, source.hands);
  const bodyOrientation = classifyMovementBodyOrientation(source.poseLandmarks);
  const bodySupport = resolveMovementSupportContacts({
    bodyOrientation,
    poseLandmarks: source.poseLandmarks,
  });
  const exercisePose = resolveMovementExercisePose({
    bodyOrientation,
    bodySupport,
    poseLandmarks: source.poseLandmarks,
  });
  const supportIntent = resolveMovementSupportIntent({
    bodySupport,
    exercisePose,
  });
  const supportConstraint = resolveMovementSupportConstraint({
    exercisePose,
    supportIntent,
  });
  const supportPresentation = resolveMovementAvatarSupportPresentationPose({
    exercisePose,
    poseLandmarks: source.poseLandmarks,
    supportConstraint,
    supportIntent,
  });
  const supportContactLocks = resolveMovementAvatarSupportContactLocks({
    exercisePose,
    supportConstraint,
    supportIntent,
  });
  const rootOrientation = resolveMovementAvatarRootOrientation({ bodyOrientation });
  const lowerBodyIntent = getMovementLowerBodyIntent({
    calibration,
    poseLandmarks: source.poseLandmarks,
  });
  const retargetFrame = solveMovementRetargetFrame({
    calibration: retargetSourceModel,
    poseLandmarks: source.poseLandmarks,
  });
  const lowerBodySourceBounds = getMovementAvatarLowerBodySourceBounds(source.poseLandmarks);
  const rawLowerBodyTrackingReady = isMovementAvatarLowerBodyTrackingReady({
    bodyConfidence,
    isPlayer,
    lowerBodyIntent,
  });
  const lowerBodySourceReliable = lowerBodySourceBounds.reliable;
  const lowerBodyTrackingReady = rawLowerBodyTrackingReady && lowerBodySourceReliable;
  const upperBodyTrackingReady =
    bodyConfidence.head >= 0.55 &&
    Math.min(bodyConfidence.leftShoulder, bodyConfidence.rightShoulder) >= 0.55;
  const leftArm = resolveMovementAvatarArmDecision({
    bodyConfidence,
    isPlayer,
    profile: avatarTrackingProfile,
    side: "left",
  });
  const rightArm = resolveMovementAvatarArmDecision({
    bodyConfidence,
    isPlayer,
    profile: avatarTrackingProfile,
    side: "right",
  });
  const torsoTrackingReady = !isPlayer || bodyConfidence.torso >= 0.45 || upperBodyTrackingReady;
  const hasBodyCalibration = isPlayer ? Boolean(calibration) : Boolean(retargetSourceModel);
  const lowerBodyDrive = resolveMovementAvatarLowerBodyDrive({
    hasLiveBodyCalibration: hasBodyCalibration,
    isPlayer,
    lowerBodyIntent,
    lowerBodyTrackingReady,
    retargetContactsBothFeet: retargetFrame.contacts.leftFoot && retargetFrame.contacts.rightFoot,
    retargetHipDrop: retargetFrame.hipDrop,
    retargetSquatDepth: retargetFrame.squatDepth,
  });
  const shouldApplyLowerBody = lowerBodyDrive.shouldApplyLowerBody && lowerBodySourceReliable;
  const shouldApplySolverTorso =
    lowerBodyDrive.shouldApplySolverTorso ||
    (!isPlayer && torsoTrackingReady && retargetFrame.debug.sourceQuality >= 0.45);
  const shouldUseRetargetedUpperBody = retargetFrame.debug.sourceQuality >= 0.45;
  const playerSpineDrive = resolveMovementAvatarPlayerSpineDrive({
    calibration,
    isPlayer,
    poseLandmarks: source.poseLandmarks,
    torsoTrackingReady,
  });
  const recordedSpineDrive = resolveMovementAvatarRecordedSpineDrive({
    kneeLift: retargetFrame.kneeLift,
    poseLandmarks: source.poseLandmarks,
    retargetCalibration: retargetSourceModel,
    torsoTrackingReady,
  });
  const spineDrive = shouldHoldUnsupportedBodyOrientation(bodyOrientation)
    ? buildUnsupportedOrientationSpineDrive(bodyOrientation)
    : isPlayer ? playerSpineDrive : recordedSpineDrive;
  const lowerBodySegmentMotion = getRecordedLowerBodySegmentMotionDepth({
    calibration: retargetSourceModel,
    frame: retargetFrame,
  });
  const retargetSolvedLegs = countMovementRetargetSegments(retargetFrame, LOWER_BODY_SEGMENTS);
  const retargetSolvedFeet = countMovementRetargetSegments(retargetFrame, FOOT_SEGMENTS);
  const playerRetargetLowerBodyMotion = Math.max(
    lowerBodyDrive.playerSquatPresentationDepth,
    retargetFrame.squatDepth,
    retargetFrame.kneeLift.left,
    retargetFrame.kneeLift.right,
    lowerBodySegmentMotion,
  );
  const lowerBodyOwnerDecision = isPlayer
    ? resolveMovementAvatarPlayerLowerBodyOwners({
        lowerBodyDrive,
        lowerBodySegmentMotion,
        lowerBodyTrackingReady,
        playerRetargetLowerBodyMotion,
        retargetSourceQuality: retargetFrame.debug.sourceQuality,
        shouldApplyLowerBody,
        shouldHoldPlayerSquatPose,
        solvedFootSegments: retargetSolvedFeet,
        solvedLegSegments: retargetSolvedLegs,
        solvedLowerBodySegments: retargetSolvedLegs + retargetSolvedFeet,
        totalSolvedSegments: retargetFrame.debug.solvedSegments.length,
      })
    : null;
  const torsoOwner = spineDrive.shouldApplySpine
    ? spineDrive.owner
    : shouldApplySolverTorso
      ? isPlayer ? "player-solver" : "recorded-solver"
      : "neutral";

  return {
    bodyOrientation,
    bodySupport,
    exercisePose,
    supportConstraint,
    supportContactLocks,
    supportIntent,
    supportPresentation,
    bodyConfidence,
    feetOwner: lowerBodyOwnerDecision?.feetOwner ?? "neutral",
    leftArm,
    lowerBodyDrive,
    lowerBodyIntent,
    lowerBodyOwnerDecision,
    lowerBodySegmentMotion,
    lowerBodySourceBounds,
    lowerBodySourceReliable,
    lowerBodyTrackingReady,
    lowerLabel: lowerBodyIntent.label,
    lowerOwner: lowerBodyOwnerDecision?.lowerBodyOwner ?? "neutral",
    playerRetargetLowerBodyMotion,
    rawLowerBodyTrackingReady,
    retargetFrame,
    retargetSolvedFeet,
    retargetSolvedLegs,
    rootOrientation,
    rightArm,
    shouldApplyLowerBody,
    shouldApplySolverTorso,
    shouldUseRetargetedUpperBody,
    spineDrive,
    torsoOwner,
    torsoTrackingReady,
    upperBodyTrackingReady,
  };
}
