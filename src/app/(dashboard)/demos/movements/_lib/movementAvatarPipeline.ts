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
const RECORDED_LOWER_BODY_OUT_OF_FRAME_LIMIT = 3;

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

export function getMovementAvatarLowerBodySourceBounds(
  landmarks: Array<{ x: number; y: number } | undefined>,
): MovementAvatarLowerBodySourceBounds {
  let lowerOutOfFrameCount = 0;
  let maxY = 0;

  LOWER_BODY_SOURCE_LANDMARKS.forEach((index) => {
    const landmark = landmarks[index];
    if (!landmark) return;
    maxY = Math.max(maxY, landmark.y);
    if (landmark.x < 0 || landmark.x > 1 || landmark.y < 0 || landmark.y > 1) {
      lowerOutOfFrameCount += 1;
    }
  });

  return {
    lowerOutOfFrameCount,
    maxY,
    reliable:
      lowerOutOfFrameCount < RECORDED_LOWER_BODY_OUT_OF_FRAME_LIMIT &&
      maxY <= 1.08,
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
    isPlayer &&
    (
      lowerBodyDrive.shouldDrivePlayerSquat ||
      lowerBodyDrive.shouldDrivePlayerLegRaise
    );

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
    rawHead.source === "face" &&
    rawHead.confidence >= 0.35;
  const shouldApplyPlayerHeadMotion = isPlayer && Boolean(calibration);
  const appliedHead = shouldApplyPlayerHeadMotion
    ? applyHeadCalibration({
        rawHead,
        calibration,
        profile,
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
  retargetSourceQuality,
  sourceOwnerDecision,
  shouldHoldPlayerSquatPose,
}: {
  avatarRole: "instructor" | "player";
  instructorLowerBodyMotion: number;
  lowerBodyDrive: MovementAvatarLowerBodyDrive;
  playerRetargetLowerBodyMotion: number;
  retargetSourceQuality: number;
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

  if (
    isPlayer &&
    (
      lowerBodyDrive.playerLowerBodyState === "neutral" ||
      playerRetargetLowerBodyMotion < 0.16
    )
  ) {
    return {
      anchoredPlayerLegRaiseSide,
      canUsePlayerRetargetLegRaise,
      feetOwner: lowerBodyDrive.playerLowerBodyState === "neutral"
        ? "neutral"
        : sourceOwnerDecision?.feetOwner ?? "neutral",
      lowerBodyOwner: lowerBodyDrive.playerLowerBodyState === "neutral"
        ? "player-lower-body-neutral"
        : sourceOwnerDecision?.lowerBodyOwner ?? (retargetSourceQuality >= 0.65
          ? "player-retarget"
          : "player-lower-body-neutral"),
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
  const spineDrive = isPlayer ? playerSpineDrive : recordedSpineDrive;
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

export function resolveMovementAvatarReplayDecision(
  input: MovementAvatarSourceWrapperInput,
): MovementAvatarPipelineDecision {
  return resolveMovementAvatarPipelineDecision({
    ...input,
    sourceOrigin: "replay",
  });
}

export function resolveMovementAvatarStudioDecision(
  input: MovementAvatarSourceWrapperInput,
): MovementAvatarPipelineDecision {
  return resolveMovementAvatarPipelineDecision({
    ...input,
    sourceOrigin: "studio",
  });
}
