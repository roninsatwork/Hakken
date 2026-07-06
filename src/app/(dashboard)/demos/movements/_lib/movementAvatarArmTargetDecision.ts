import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarArmDecision,
  MovementAvatarArmSide,
  MovementAvatarArmTargetDecision,
  MovementAvatarArmTargetsDecision,
  MovementAvatarTargetLandmark,
} from "./movementAvatarPipeline";
import {
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  selectMovementTrackingEndpoint,
  type MovementAvatarTrackingProfile,
} from "./movementTrackingCalibration";

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
