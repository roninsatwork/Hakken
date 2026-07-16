import * as THREE from "three";
import { movementSourceSegmentToAvatarWorldDirection } from "./movementAvatarRestPose";
import type { MovementRetargetFrame } from "./movementRetargeting";

const AVATAR_WORLD_UP = new THREE.Vector3(0, 1, 0);

/** Cancel camera tilt using the calibrated neutral spine as vertical. */
export function resolveMovementAvatarRetargetCameraTiltCorrection({
  retargetFrame,
  zScale,
}: {
  retargetFrame: MovementRetargetFrame;
  zScale: number;
}): THREE.Quaternion | null {
  if (!retargetFrame.neutralSpineDirection) return null;

  const neutralSpine = movementSourceSegmentToAvatarWorldDirection(
    retargetFrame.neutralSpineDirection,
    zScale,
  );
  if (!neutralSpine) return null;

  return new THREE.Quaternion().setFromUnitVectors(neutralSpine, AVATAR_WORLD_UP);
}

export function resolveMovementAvatarRetargetLimbAngleStep({
  confidence,
  type,
}: {
  confidence: number;
  type: "arm" | "foot" | "leg" | "spine";
}): number | undefined {
  // Arm continuity is bounded in world space by temporal target
  // stabilization. A second local-space angle cap is incorrect for a child
  // bone: when its upper-arm parent moves, the lower arm can need a large
  // compensating local rotation merely to preserve a smooth world direction.
  if (type === "arm") return undefined;

  const linearConfidenceBlend = type === "leg"
    ? Math.max(0, Math.min(1, (confidence - 0.3) / 0.3))
    : null;
  if (linearConfidenceBlend === null) return undefined;
  return 0.08 + 0.16 * linearConfidenceBlend;
}
