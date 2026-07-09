import type {
  MovementAvatarLowerBodyDrive,
  MovementAvatarPlayerLowerBodyOwnerDecision,
} from "./movementAvatarLowerBody";
import type { MovementAvatarPlayerSpineDrive } from "./movementAvatarPlayerDrive";
import type { MovementBodyOrientationDecision } from "./movementBodyOrientation";
import type { MovementSupportContactDecision } from "./movementSupportContact";
import type { MovementAvatarSupportContactLockDecision } from "./movementAvatarSupportContactDecision";
import type { MovementExercisePoseDecision } from "./movementExercisePose";
import type { MovementSupportIntentDecision } from "./movementSupportIntent";
import type { MovementSupportConstraintDecision } from "./movementSupportConstraint";
import type {
  MovementRetargetFrame,
  MovementRetargetSourceModel,
} from "./movementRetargeting";
import type { MovementAvatarRootOrientationDecision } from "./movementAvatarRootOrientationDecision";
import type { MovementAvatarLowerBodySourceBounds } from "./movementAvatarLowerBodySourceBounds";
import type {
  MovementAvatarTrackingProfile,
  MovementCalibration,
  MovementHandsForConfidence,
  MovementHeadAngles,
  MovementLowerBodyIntent,
  MovementTrackingEndpointSelection,
  TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementAvatarSourceOrigin = "replay" | "studio";

export type MovementAvatarSource = {
  poseLandmarks: TrackingLandmark[];
  worldPoseLandmarks?: TrackingLandmark[] | null;
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

export type MovementAvatarAimOptionsDecision = {
  frontBias?: number;
  minVectorLengthSq: number;
  slerpOverride: number;
  storeVisibilityThreshold?: number;
  visibilityThreshold: number;
  zScale?: number;
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
