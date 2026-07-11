import type { VRM } from "@pixiv/three-vrm";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

export function buildMovementAvatarHandsVisualTelemetry(
  vrm: VRM,
): MovementTrackingDebugState["avatarHands"] {
  return Object.fromEntries((["left", "right"] as const).map((side) => {
    const rotations = (["Index", "Middle", "Thumb"] as const).map((finger) => {
      const boneName = `${side}${finger}Proximal` as
        | "leftIndexProximal"
        | "leftMiddleProximal"
        | "leftThumbProximal"
        | "rightIndexProximal"
        | "rightMiddleProximal"
        | "rightThumbProximal";
      const bone = vrm.humanoid.getNormalizedBoneNode(boneName);
      return bone
        ? {
            key: `${finger.charAt(0).toLowerCase()}${finger.slice(1)}Proximal`,
            rotation: {
              x: Number(bone.rotation.x.toFixed(4)),
              y: Number(bone.rotation.y.toFixed(4)),
              z: Number(bone.rotation.z.toFixed(4)),
            },
          }
        : null;
    }).filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
    const curlMagnitude = rotations.reduce(
      (sum, entry) => sum + Math.abs(entry.rotation.x) + Math.abs(entry.rotation.y) + Math.abs(entry.rotation.z),
      0,
    );
    return [side, {
      curlMagnitude: Number(curlMagnitude.toFixed(4)),
      ...Object.fromEntries(rotations.map((entry) => [entry.key, entry.rotation])),
    }];
  })) as MovementTrackingDebugState["avatarHands"];
}

export function buildMovementAvatarExpressionVisualTelemetry(
  vrm: VRM,
): MovementTrackingDebugState["avatarExpressions"] {
  const getValue = (name: string) => {
    const value = vrm.expressionManager?.getValue(name) ?? null;
    return typeof value === "number" ? Number(value.toFixed(4)) : null;
  };
  return {
    aa: getValue("aa"),
    blinkLeft: getValue("blinkLeft"),
    blinkRight: getValue("blinkRight"),
    happy: getValue("happy"),
  };
}
