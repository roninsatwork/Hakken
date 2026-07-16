import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import type {
  MovementRetargetSegment,
  MovementRetargetSegmentName,
  MovementRetargetVector,
} from "./movementRetargeting";

// Keep reacquisition and foreshortening corrections below the rendered jerk
// gate at normal 25-30 fps. The former 8 rad/s budget allowed a 0.20-radian
// target step at 25 fps, which became a visible four-frame forearm catch-up
// even though the recorded source advanced only about 0.04 radians per frame.
const ARM_TARGET_RATE_RADIANS_PER_SECOND = 4.8;
const SPINE_TARGET_RATE_RADIANS_PER_SECOND = 2.4;
const FOOT_CONTACT_CHANGE_CONFIDENCE = 0.45;
const MAX_CONTINUOUS_SOURCE_DELTA_MS = 100;
const ARM_SEGMENTS: MovementRetargetSegmentName[] = [
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
];
const SPINE_BONES = ["hips", "spine", "chest", "upperChest"] as const;

type StabilizableDecision = Pick<
  MovementAvatarPipelineDecision,
  "retargetFrame" | "spineDrive"
> & Partial<Pick<MovementAvatarPipelineDecision, "lowerBodyDrive">>;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalize(vector: MovementRetargetVector): MovementRetargetVector {
  const length = Math.hypot(vector.x, vector.y, vector.z);
  if (length <= 0.000001) return { x: 0, y: 0, z: 0 };
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length,
  };
}

function limitDirectionStep({
  current,
  maxAngle,
  previous,
}: {
  current: MovementRetargetVector;
  maxAngle: number;
  previous: MovementRetargetVector;
}) {
  const from = normalize(previous);
  const to = normalize(current);
  const dot = clamp(from.x * to.x + from.y * to.y + from.z * to.z, -1, 1);
  const angle = Math.acos(dot);
  if (angle <= maxAngle || angle <= 0.000001) return to;

  const interpolation = maxAngle / angle;
  const sinAngle = Math.sin(angle);
  if (Math.abs(sinAngle) <= 0.000001) {
    return normalize({
      x: from.x + (to.x - from.x) * interpolation,
      y: from.y + (to.y - from.y) * interpolation,
      z: from.z + (to.z - from.z) * interpolation,
    });
  }

  const fromWeight = Math.sin((1 - interpolation) * angle) / sinAngle;
  const toWeight = Math.sin(interpolation * angle) / sinAngle;
  return normalize({
    x: from.x * fromWeight + to.x * toWeight,
    y: from.y * fromWeight + to.y * toWeight,
    z: from.z * fromWeight + to.z * toWeight,
  });
}

function stabilizeArmSegment({
  current,
  maxAngle,
  previous,
}: {
  current?: MovementRetargetSegment;
  maxAngle: number;
  previous?: MovementRetargetSegment;
}) {
  if (!current || !previous) return current;
  return {
    ...current,
    direction: limitDirectionStep({
      current: current.direction,
      maxAngle,
      previous: previous.direction,
    }),
  };
}

function stabilizeFootContact({
  confidence,
  current,
  previous,
}: {
  confidence: number | undefined;
  current: boolean;
  previous: boolean;
}) {
  if (current === previous) return current;
  // Contact ownership must not flip merely because a foot passes through the
  // source-confidence boundary. Retain the prior state until the source is
  // trustworthy enough to prove a real lift or landing.
  return (confidence ?? 0) >= FOOT_CONTACT_CHANGE_CONFIDENCE ? current : previous;
}

function limitRotationStep({
  current,
  maxAngle,
  previous,
}: {
  current: { x: number; y: number; z: number };
  maxAngle: number;
  previous: { x: number; y: number; z: number };
}) {
  const delta = {
    x: current.x - previous.x,
    y: current.y - previous.y,
    z: current.z - previous.z,
  };
  const magnitude = Math.hypot(delta.x, delta.y, delta.z);
  if (magnitude <= maxAngle || magnitude <= 0.000001) return { ...current };
  const scale = maxAngle / magnitude;
  return {
    x: previous.x + delta.x * scale,
    y: previous.y + delta.y * scale,
    z: previous.z + delta.z * scale,
  };
}

export function stabilizeMovementAvatarPipelineDecision<Decision extends StabilizableDecision>({
  current,
  previous,
  sourceDeltaMs,
}: {
  current: Decision;
  previous: Decision | null | undefined;
  sourceDeltaMs: number;
}): Decision {
  if (
    !previous ||
    !Number.isFinite(sourceDeltaMs) ||
    sourceDeltaMs <= 0
  ) {
    return current;
  }

  // Recorded captures can contain long timestamp stalls even though the source
  // frame sequence remains continuous. Cap their smoothing budget instead of
  // treating them as a manual seek; seek/reset orchestration clears `previous`.
  const deltaSeconds = Math.min(sourceDeltaMs, MAX_CONTINUOUS_SOURCE_DELTA_MS) / 1000;
  const armMaxAngle = ARM_TARGET_RATE_RADIANS_PER_SECOND * deltaSeconds;
  const spineMaxAngle = SPINE_TARGET_RATE_RADIANS_PER_SECOND * deltaSeconds;
  const segments = { ...current.retargetFrame.segments };
  ARM_SEGMENTS.forEach((segmentName) => {
    segments[segmentName] = stabilizeArmSegment({
      current: current.retargetFrame.segments[segmentName],
      maxAngle: armMaxAngle,
      previous: previous.retargetFrame.segments[segmentName],
    });
  });

  const isHeldSpine = current.spineDrive.owner.endsWith("-spine-held");
  const rotations = Object.fromEntries(SPINE_BONES.map((bone) => [
    bone,
    isHeldSpine
      ? { ...previous.spineDrive.rotations[bone] }
      : limitRotationStep({
          current: current.spineDrive.rotations[bone],
          maxAngle: spineMaxAngle,
          previous: previous.spineDrive.rotations[bone],
        }),
  ])) as Decision["spineDrive"]["rotations"];
  const contacts = {
    leftFoot: stabilizeFootContact({
      confidence: current.retargetFrame.segments.leftFoot?.confidence,
      current: current.retargetFrame.contacts.leftFoot,
      previous: previous.retargetFrame.contacts.leftFoot,
    }),
    rightFoot: stabilizeFootContact({
      confidence: current.retargetFrame.segments.rightFoot?.confidence,
      current: current.retargetFrame.contacts.rightFoot,
      previous: previous.retargetFrame.contacts.rightFoot,
    }),
  };
  const suppressedContactChange =
    contacts.leftFoot !== current.retargetFrame.contacts.leftFoot ||
    contacts.rightFoot !== current.retargetFrame.contacts.rightFoot;
  const shouldRetainPlantedSquat = Boolean(
    current.lowerBodyDrive &&
    previous.lowerBodyDrive?.shouldDrivePlayerSquat &&
    suppressedContactChange &&
    contacts.leftFoot &&
    contacts.rightFoot,
  );
  const lowerBodyDrive = current.lowerBodyDrive &&
    shouldRetainPlantedSquat
      ? {
          ...current.lowerBodyDrive,
          groundedSquatDepth: current.lowerBodyDrive.liveSquatDepth,
          playerLowerBodyState: "planted-squat" as const,
          playerSquatPresentationDepth: current.retargetFrame.hipDrop,
          shouldDrivePlayerSquat: true,
          // A planted source-driven squat uses hip drop directly. Keep that
          // model and its ownership when contact hysteresis rejects a
          // low-confidence bit flip. The raw decision may already have fallen
          // back to neutral because it was built before contact stabilization.
          visualRootDrop: current.retargetFrame.hipDrop * 0.56,
        }
      : current.lowerBodyDrive;

  return {
    ...current,
    ...(lowerBodyDrive ? { lowerBodyDrive } : {}),
    retargetFrame: {
      ...current.retargetFrame,
      contacts,
      segments,
    },
    spineDrive: {
      ...current.spineDrive,
      rotations,
    },
  };
}
