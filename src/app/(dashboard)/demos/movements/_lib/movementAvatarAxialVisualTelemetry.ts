import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";
import type { MovementAnatomicalMapping } from "./movementMirrorMapping";

export function mapMovementAvatarVisualSourceDirection({
  direction,
}: {
  anatomicalMapping: MovementAnatomicalMapping;
  direction: THREE.Vector3;
  segment: MovementRetargetFrame["debug"]["solvedSegments"][number];
}) {
  // The retarget frame has already passed through the role-specific display
  // landmark mapping before application. Fidelity telemetry must compare the
  // final bone against the exact world direction sent to the VRM; reflecting
  // player X here again creates a false near-opposite arm error.
  return direction.clone();
}

export function buildMovementAvatarSpineVisualTelemetry(
  vrm: VRM,
): MovementTrackingDebugState["avatarSpine"] {
  const spineBones = ["hips", "spine", "chest", "upperChest"] as const;
  return Object.fromEntries(spineBones.flatMap((boneName) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) return [];
    return [[boneName, {
      x: Number(bone.rotation.x.toFixed(4)),
      y: Number(bone.rotation.y.toFixed(4)),
      z: Number(bone.rotation.z.toFixed(4)),
    }]];
  })) as MovementTrackingDebugState["avatarSpine"];
}
