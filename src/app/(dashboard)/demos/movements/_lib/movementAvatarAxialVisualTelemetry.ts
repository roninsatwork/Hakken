import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";
import type { MovementAnatomicalMapping } from "./movementMirrorMapping";

export function mapMovementAvatarVisualSourceDirection({
  anatomicalMapping,
  direction,
  segment,
}: {
  anatomicalMapping: MovementAnatomicalMapping;
  direction: THREE.Vector3;
  segment: MovementRetargetFrame["debug"]["solvedSegments"][number];
}) {
  const mappedDirection = direction.clone();
  if (
    anatomicalMapping === "opposite" &&
    (
      segment === "spine" ||
      segment.includes("Arm") ||
      segment.includes("Thigh") ||
      segment.includes("Shin") ||
      segment.includes("Foot")
    )
  ) {
    mappedDirection.x = -mappedDirection.x;
  }
  return mappedDirection;
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
