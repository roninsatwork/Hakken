import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import {
  MOVEMENT_AVATAR_VISUAL_MAPPINGS,
} from "./movementAvatarRestPose";
import {
  resolveMovementAvatarRetargetSegmentWorldDirection,
} from "./movementAvatarSegmentApplication";
import type { MovementAvatarFootWorldRuntimeSnapshot } from "./movementAvatarFootWorldRuntime";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

function compactVector(vector: THREE.Vector3) {
  return {
    x: Number(vector.x.toFixed(4)),
    y: Number(vector.y.toFixed(4)),
    z: Number(vector.z.toFixed(4)),
  };
}

export function buildMovementAvatarVisualTelemetry({
  floorY,
  footWorldSnapshot,
  retargetFrame,
  vrm,
  zScale,
}: {
  floorY?: number;
  footWorldSnapshot?: MovementAvatarFootWorldRuntimeSnapshot | null;
  retargetFrame: MovementRetargetFrame;
  vrm: VRM;
  zScale: number;
}): MovementTrackingDebugState["avatarVisual"] {
  vrm.scene.updateMatrixWorld(true);

  const lowerBodySourceErrors: number[] = [];
  const upperBodySourceErrors: number[] = [];
  const segments = MOVEMENT_AVATAR_VISUAL_MAPPINGS.reduce<
    NonNullable<MovementTrackingDebugState["avatarVisual"]>["segments"]
  >((telemetry, mapping) => {
    const bone = vrm.humanoid.getNormalizedBoneNode(mapping.bone);
    const child = vrm.humanoid.getNormalizedBoneNode(mapping.child);
    if (!bone || !child) return telemetry;

    const boneWorldPosition = new THREE.Vector3();
    const childWorldPosition = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPosition);
    child.getWorldPosition(childWorldPosition);

    const avatarDirection = childWorldPosition.sub(boneWorldPosition);
    const length = avatarDirection.length();
    if (length <= 0.000001) return telemetry;

    avatarDirection.normalize();
    const sourceSegment = retargetFrame.segments[mapping.segment];
    const sourceDirection = resolveMovementAvatarRetargetSegmentWorldDirection({
      mapping,
      retargetFrame,
      segmentApplicationDecision: {
        reason: "active",
        shouldApply: true,
        slerp: 0,
        zScale,
      },
    })?.desiredWorldDirection ?? null;
    const sourceError = sourceDirection
      ? 1 - THREE.MathUtils.clamp(avatarDirection.dot(sourceDirection), -1, 1)
      : undefined;

    if (typeof sourceError === "number" && sourceSegment && sourceSegment.confidence >= 0.3) {
      if (mapping.type === "leg" || mapping.type === "foot") {
        lowerBodySourceErrors.push(sourceError);
      } else {
        upperBodySourceErrors.push(sourceError);
      }
    }

    telemetry[mapping.segment] = {
      confidence: sourceSegment?.confidence,
      direction: compactVector(avatarDirection),
      length: Number(length.toFixed(4)),
      sourceDirection: sourceDirection ? compactVector(sourceDirection) : undefined,
      sourceError: typeof sourceError === "number" ? Number(sourceError.toFixed(4)) : undefined,
    };
    return telemetry;
  }, {});

  return {
    averageLowerBodyDirectionError: lowerBodySourceErrors.length
      ? Number((lowerBodySourceErrors.reduce((sum, value) => sum + value, 0) / lowerBodySourceErrors.length).toFixed(4))
      : undefined,
    averageUpperBodyDirectionError: upperBodySourceErrors.length
      ? Number((upperBodySourceErrors.reduce((sum, value) => sum + value, 0) / upperBodySourceErrors.length).toFixed(4))
      : undefined,
    comparedLowerBodySegments: lowerBodySourceErrors.length,
    comparedUpperBodySegments: upperBodySourceErrors.length,
    footing: footWorldSnapshot
      ? {
        floorY: typeof floorY === "number" ? Number(floorY.toFixed(4)) : undefined,
        leftFootClearance: footWorldSnapshot.left && typeof floorY === "number"
          ? Number((footWorldSnapshot.left.y - floorY).toFixed(4))
          : undefined,
        leftFootY: footWorldSnapshot.left ? Number(footWorldSnapshot.left.y.toFixed(4)) : undefined,
        rightFootClearance: footWorldSnapshot.right && typeof floorY === "number"
          ? Number((footWorldSnapshot.right.y - floorY).toFixed(4))
          : undefined,
        rightFootY: footWorldSnapshot.right ? Number(footWorldSnapshot.right.y.toFixed(4)) : undefined,
      }
      : undefined,
    segments,
  };
}
