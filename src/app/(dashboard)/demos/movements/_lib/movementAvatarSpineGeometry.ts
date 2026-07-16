import type { MovementRetargetVector } from "./movementRetargeting";

const FORWARD_ROTATION_WEIGHTS = {
  chest: 0.52,
  hips: 0.08,
  spine: 0.32,
  upperChest: 0.38,
} as const;

export const MOVEMENT_AVATAR_FORWARD_ROTATION_WEIGHT = Object.values(
  FORWARD_ROTATION_WEIGHTS,
).reduce((sum, weight) => sum + weight, 0);

function signedSagittalAngle(vector: MovementRetargetVector) {
  return Math.atan2(vector.z, Math.hypot(vector.x, vector.y));
}

/**
 * Resolve an absolute source-geometry lean delta. Coordinate-length changes
 * are deliberately excluded: shortening the shoulder-to-hip projection is
 * not proof that the torso rotated forward.
 */
export function resolveMovementAvatarSourceForwardLean({
  current,
  neutral,
}: {
  current: MovementRetargetVector;
  neutral: MovementRetargetVector;
}) {
  return signedSagittalAngle(current) - signedSagittalAngle(neutral);
}

export function movementAvatarForwardPresentationDrive(sourceLeanRadians: number) {
  return sourceLeanRadians / MOVEMENT_AVATAR_FORWARD_ROTATION_WEIGHT;
}
