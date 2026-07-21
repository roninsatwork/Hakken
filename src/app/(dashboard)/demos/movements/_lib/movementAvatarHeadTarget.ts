import {
  resolveMovementAvatarHeadApplicationPose,
  resolveMovementAvatarHeadApplyOptions,
  resolveMovementAvatarHeadBonePitch,
  resolveMovementAvatarHeadDecision,
  resolveMovementAvatarHeadWorldYaw,
  resolveMovementAvatarRawHeadDecision,
  type MovementAvatarHeadApplicationPoseDecision,
  type MovementAvatarHeadApplyOptionsDecision,
  type MovementAvatarHeadDecision,
  type MovementAvatarRawHeadDecision,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  getMovementHeadMotionIntent,
  type MovementAvatarTrackingProfile,
  type MovementCalibration,
  type MovementHeadMotionIntent,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementAvatarHeadTargetDecision = {
  applicationPose: MovementAvatarHeadApplicationPoseDecision;
  applyOptions: MovementAvatarHeadApplyOptionsDecision;
  headBonePitch: number;
  headDecision: MovementAvatarHeadDecision;
  headMotionIntent: MovementHeadMotionIntent;
  headWorldYaw: number;
  rawHeadDecision: MovementAvatarRawHeadDecision;
};

// The head is small and tracked from few landmarks, so per-frame angle noise
// and confidence flapping (tracked <-> neutral) read as a "floppy, detached"
// head. Arms/spine/feet already have temporal stabilization; these budgets give
// the head the same treatment. Genuine head turns stay responsive (a fast real
// turn is ~3 rad/s sustained); jitter is high-frequency sign-flipping and gets
// absorbed by the per-frame step cap.
const HEAD_TARGET_RATE_RADIANS_PER_SECOND = 3.2;
const HEAD_OWNER_TRANSITION_RATE_RADIANS_PER_SECOND = 1.4;
const MAX_CONTINUOUS_HEAD_SOURCE_DELTA_MS = 100;

function limitHeadAngleStep({
  current,
  maxAngle,
  previous,
}: {
  current: { pitch: number; yaw: number; roll: number };
  maxAngle: number;
  previous: { pitch: number; yaw: number; roll: number };
}) {
  const delta = {
    pitch: current.pitch - previous.pitch,
    yaw: current.yaw - previous.yaw,
    roll: current.roll - previous.roll,
  };
  const magnitude = Math.hypot(delta.pitch, delta.yaw, delta.roll);
  if (magnitude <= maxAngle || magnitude <= 0.000001) return { ...current };
  const scale = maxAngle / magnitude;
  return {
    pitch: previous.pitch + delta.pitch * scale,
    yaw: previous.yaw + delta.yaw * scale,
    roll: previous.roll + delta.roll * scale,
  };
}

function stabilizeMovementAvatarHeadDecision({
  current,
  previous,
  sourceDeltaMs,
}: {
  current: MovementAvatarHeadDecision;
  previous: MovementAvatarHeadDecision | null | undefined;
  sourceDeltaMs?: number;
}): MovementAvatarHeadDecision {
  if (
    !previous ||
    sourceDeltaMs === undefined ||
    !Number.isFinite(sourceDeltaMs) ||
    sourceDeltaMs <= 0
  ) {
    return current;
  }

  const deltaSeconds = Math.min(sourceDeltaMs, MAX_CONTINUOUS_HEAD_SOURCE_DELTA_MS) / 1000;
  // Ownership changes (tracked <-> neutral, face <-> pose) are where the raw
  // targets jump hardest; ease through them at a slower budget so the head
  // never snaps when evidence appears or drops out.
  const rate = current.headOwner === previous.headOwner
    ? HEAD_TARGET_RATE_RADIANS_PER_SECOND
    : HEAD_OWNER_TRANSITION_RATE_RADIANS_PER_SECOND;
  const limited = limitHeadAngleStep({
    current: { pitch: current.headPitch, yaw: current.headYaw, roll: current.headRoll },
    maxAngle: rate * deltaSeconds,
    previous: { pitch: previous.headPitch, yaw: previous.headYaw, roll: previous.headRoll },
  });

  return {
    ...current,
    headPitch: limited.pitch,
    headRoll: limited.roll,
    headYaw: limited.yaw,
  };
}

export function resolveMovementAvatarHeadTarget({
  avatarRole,
  avatarRootYaw,
  calibration,
  faceLandmarks,
  headMotionIntent,
  mirrorHeadForDisplay,
  poseLandmarks,
  previousHeadTarget = null,
  profile = DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  shouldApplyLowerBody,
  shouldApplySpine,
  sourceDeltaMs,
}: {
  avatarRole: "instructor" | "player";
  avatarRootYaw: number;
  calibration: MovementCalibration | null;
  faceLandmarks?: TrackingLandmark[] | null;
  headMotionIntent?: MovementHeadMotionIntent;
  mirrorHeadForDisplay?: boolean;
  poseLandmarks: TrackingLandmark[];
  previousHeadTarget?: MovementAvatarHeadTargetDecision | null;
  profile?: MovementAvatarTrackingProfile;
  shouldApplyLowerBody: boolean;
  shouldApplySpine: boolean;
  sourceDeltaMs?: number;
}): MovementAvatarHeadTargetDecision {
  const resolvedHeadMotionIntent = headMotionIntent ?? getMovementHeadMotionIntent({
    calibration,
    faceLandmarks: faceLandmarks ?? undefined,
    poseLandmarks,
  });
  const rawHeadDecision = resolveMovementAvatarRawHeadDecision({
    faceLandmarks: faceLandmarks ?? null,
    poseLandmarks,
  });
  const rawHeadDecisionAngles = resolveMovementAvatarHeadDecision({
    avatarRole,
    calibration,
    headMotionIntent: resolvedHeadMotionIntent,
    mirrorHeadForDisplay,
    profile,
    rawHead: rawHeadDecision.rawHead,
    shouldApplySpine,
  });
  // Every downstream consumer (bone pitch, application pose, world yaw) is
  // derived from the STABILIZED angles, so the whole head chain moves smoothly.
  const headDecision = stabilizeMovementAvatarHeadDecision({
    current: rawHeadDecisionAngles,
    previous: previousHeadTarget?.headDecision,
    sourceDeltaMs,
  });
  const headBonePitch = resolveMovementAvatarHeadBonePitch({
    avatarRole,
    headPitch: headDecision.headPitch,
  });
  const applyOptions = resolveMovementAvatarHeadApplyOptions({
    // Shared pose-only head targets also share their interpolation semantics.
    // Role-specific slerp after a common target would still create a rendered
    // three-party mismatch during continuous movement.
    avatarRole: headDecision.headOwner === "shared-pose" ? "instructor" : avatarRole,
    profile,
  });
  const applicationPose = resolveMovementAvatarHeadApplicationPose({
    headMotionIntent: resolvedHeadMotionIntent,
    headPitch: headBonePitch,
    headRoll: headDecision.headRoll,
    headYaw: headDecision.headYaw,
    profile,
    shouldApplyHeadMotion: headDecision.shouldApplyHeadMotion,
    shouldApplyLowerBody,
    shouldApplyPlayerHeadMotion: headDecision.shouldApplyPlayerHeadMotion,
    shouldApplySpine,
  });

  return {
    applicationPose,
    applyOptions,
    headBonePitch,
    headDecision,
    headMotionIntent: resolvedHeadMotionIntent,
    headWorldYaw: resolveMovementAvatarHeadWorldYaw({
      avatarRootYaw,
      headYaw: headDecision.headYaw,
    }),
    rawHeadDecision,
  };
}
