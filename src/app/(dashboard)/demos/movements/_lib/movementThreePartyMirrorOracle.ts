import type {
  VrmBlendshapeCategory,
  VrmHandsPayload,
  VrmMotionPayload,
  VrmPoseLandmark,
} from "./vrmRigging";
import type {
  MovementRetargetSegmentName,
  MovementRetargetSourceModel,
} from "./movementRetargeting";

// This table is intentionally independent of movementMirrorMapping.ts. It is
// proof data, not production mapping: changing the runtime mirror helper must
// not silently change the expected opposite-player imitation.
export const REPLAY_THREE_PARTY_POSE_PAIRS = [
  [1, 4],
  [2, 5],
  [3, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
] as const;

const REPLAY_THREE_PARTY_FACE_PAIRS = [[33, 263]] as const;
const REPLAY_THREE_PARTY_SEGMENT_PAIRS = [
  ["leftUpperArm", "rightUpperArm"],
  ["leftLowerArm", "rightLowerArm"],
  ["leftThigh", "rightThigh"],
  ["leftShin", "rightShin"],
  ["leftFoot", "rightFoot"],
] as const satisfies ReadonlyArray<readonly [MovementRetargetSegmentName, MovementRetargetSegmentName]>;

function cloneLandmark(
  landmark: VrmPoseLandmark,
  mapX: (x: number) => number = (x) => x,
): VrmPoseLandmark {
  return { ...landmark, x: mapX(landmark.x) };
}

export function buildOppositePlayerPoseOracle(
  landmarks: VrmPoseLandmark[] | null | undefined,
  mapX: (x: number) => number = (x) => x,
): VrmPoseLandmark[] | null {
  if (!landmarks) return null;
  const opposite = landmarks.map((landmark) => cloneLandmark(landmark, mapX));
  REPLAY_THREE_PARTY_POSE_PAIRS.forEach(([leftIndex, rightIndex]) => {
    const sourceLeft = landmarks[leftIndex];
    const sourceRight = landmarks[rightIndex];
    if (!sourceLeft || !sourceRight) return;
    opposite[leftIndex] = cloneLandmark(sourceRight, mapX);
    opposite[rightIndex] = cloneLandmark(sourceLeft, mapX);
  });
  return opposite;
}

function buildOppositeFaceOracle(
  landmarks: VrmPoseLandmark[] | null | undefined,
): VrmPoseLandmark[] | null {
  if (!landmarks) return null;
  const opposite = landmarks.map((landmark) => cloneLandmark(landmark));
  REPLAY_THREE_PARTY_FACE_PAIRS.forEach(([leftIndex, rightIndex]) => {
    const sourceLeft = landmarks[leftIndex];
    const sourceRight = landmarks[rightIndex];
    if (!sourceLeft || !sourceRight) return;
    opposite[leftIndex] = cloneLandmark(sourceRight);
    opposite[rightIndex] = cloneLandmark(sourceLeft);
  });
  return opposite;
}

function buildOppositeHandsOracle(hands: VrmHandsPayload | undefined): VrmHandsPayload | undefined {
  if (!hands) return undefined;
  const reflectHand = (hand: NonNullable<VrmHandsPayload["left"]>) => ({
    ...structuredClone(hand),
    landmarks: hand.landmarks.map((landmark) => cloneLandmark(landmark)),
    worldLandmarks: hand.worldLandmarks?.map((landmark) => cloneLandmark(landmark)),
  });
  return {
    left: hands.right ? reflectHand(hands.right) : undefined,
    right: hands.left ? reflectHand(hands.left) : undefined,
  };
}

function oppositeBlendshapeName(name: string) {
  if (name.includes("Left")) return name.replace("Left", "Right");
  if (name.includes("Right")) return name.replace("Right", "Left");
  return name;
}

function buildOppositeBlendshapesOracle(
  blendshapes: VrmBlendshapeCategory[] | undefined,
): VrmBlendshapeCategory[] | undefined {
  return blendshapes?.map((blendshape) => ({
    ...blendshape,
    categoryName: oppositeBlendshapeName(blendshape.categoryName),
  }));
}

export function buildOppositePlayerImitationOracle(payload: VrmMotionPayload): VrmMotionPayload {
  const landmarks = buildOppositePlayerPoseOracle(payload.landmarks) ?? [];
  return {
    ...payload,
    blendshapes: buildOppositeBlendshapesOracle(payload.blendshapes),
    faceLandmarks: buildOppositeFaceOracle(payload.faceLandmarks) ?? undefined,
    hands: buildOppositeHandsOracle(payload.hands),
    landmarks,
    pose: buildOppositePlayerPoseOracle(payload.pose) ?? undefined,
    worldLandmarks: buildOppositePlayerPoseOracle(payload.worldLandmarks) ?? undefined,
  };
}

export function buildOppositePlayerRetargetSourceModelOracle(
  instructor: MovementRetargetSourceModel | null,
): MovementRetargetSourceModel | null {
  if (!instructor) return null;
  const segments = Object.fromEntries(Object.entries(instructor.segments).map(([name, segment]) => [
    name,
    segment
      ? { ...segment, direction: { ...segment.direction, x: -segment.direction.x } }
      : segment,
  ])) as MovementRetargetSourceModel["segments"];
  REPLAY_THREE_PARTY_SEGMENT_PAIRS.forEach(([left, right]) => {
    const instructorLeft = instructor.segments[left];
    const instructorRight = instructor.segments[right];
    segments[left] = instructorRight
      ? { ...instructorRight, direction: { ...instructorRight.direction, x: -instructorRight.direction.x } }
      : undefined;
    segments[right] = instructorLeft
      ? { ...instructorLeft, direction: { ...instructorLeft.direction, x: -instructorLeft.direction.x } }
      : undefined;
  });

  return {
    ...instructor,
    hipCenter: { ...instructor.hipCenter, x: 1 - instructor.hipCenter.x },
    neutralKneeLift: {
      left: instructor.neutralKneeLift.right,
      right: instructor.neutralKneeLift.left,
    },
    segments,
    shoulderCenter: { ...instructor.shoulderCenter, x: 1 - instructor.shoulderCenter.x },
  };
}
