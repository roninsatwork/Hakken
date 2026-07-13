import {
  getRecordedLowerBodySegmentMotionDepth,
  type MovementRetargetFrame,
  type MovementRetargetSegmentName,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import {
  getMovementAvatarRetargetSegmentMinimumConfidence,
} from "./movementAvatarRetargetSegmentApplicationDecision";
import type { MovementAvatarRetargetSegmentType } from "./movementAvatarPipelineTypes";

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

export const LOWER_BODY_SEGMENTS = new Set<MovementRetargetSegmentName>([
  "leftThigh",
  "leftShin",
  "rightThigh",
  "rightShin",
]);

export const THIGH_SEGMENTS = new Set<MovementRetargetSegmentName>([
  "leftThigh",
  "rightThigh",
]);

export const FOOT_SEGMENTS = new Set<MovementRetargetSegmentName>(["leftFoot", "rightFoot"]);

export const UPPER_BODY_SEGMENTS = new Set<MovementRetargetSegmentName>([
  "spine",
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
]);

export function countMovementRetargetSegments(
  frame: MovementRetargetFrame,
  segments: Set<MovementRetargetSegmentName>,
) {
  return frame.debug.solvedSegments.filter((name) => segments.has(name)).length;
}

export function countMovementApplicableRetargetSegments(
  frame: MovementRetargetFrame,
  segments: Set<MovementRetargetSegmentName>,
  segmentType: MovementAvatarRetargetSegmentType,
) {
  const minimumConfidence = getMovementAvatarRetargetSegmentMinimumConfidence(segmentType);
  return Array.from(segments).filter(
    (name) => (frame.segments[name]?.confidence ?? 0) >= minimumConfidence,
  ).length;
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
