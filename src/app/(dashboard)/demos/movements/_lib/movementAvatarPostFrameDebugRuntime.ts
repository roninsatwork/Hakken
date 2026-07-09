import type { VRM } from "@pixiv/three-vrm";
import {
  applyMovementAvatarOptionalPostFrameDebugTelemetry,
  type MovementAvatarRetargetDebugRegistryWindow,
} from "./movementAvatarDebugTelemetry";
import type { MovementRetargetFrame } from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

type MovementAvatarMutableRef<T> = {
  current: T;
};

export type MovementAvatarPostFrameDebugRuntimeResult = {
  applied: boolean;
  trackingDebugState: MovementTrackingDebugState | null;
};

export function applyMovementAvatarPostFrameDebugRuntime({
  avatarName,
  avatarRole,
  floorY,
  footLock,
  footWorldSnapshot,
  frameUpdatedAt,
  registryWindow = typeof window === "undefined"
    ? undefined
    : window as Window & MovementAvatarRetargetDebugRegistryWindow,
  retargetFrame,
  trackingDebugRef,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  floorY?: number;
  footLock: Parameters<typeof applyMovementAvatarOptionalPostFrameDebugTelemetry>[0]["footLock"];
  footWorldSnapshot?: Parameters<typeof applyMovementAvatarOptionalPostFrameDebugTelemetry>[0]["footWorldSnapshot"];
  frameUpdatedAt: number;
  registryWindow?: (Window & MovementAvatarRetargetDebugRegistryWindow) | undefined;
  retargetFrame: MovementRetargetFrame;
  trackingDebugRef?: MovementAvatarMutableRef<MovementTrackingDebugState | null>;
  vrm: VRM;
  zScale: number;
}): MovementAvatarPostFrameDebugRuntimeResult {
  if (!trackingDebugRef) {
    return {
      applied: false,
      trackingDebugState: null,
    };
  }

  const trackingDebugState = applyMovementAvatarOptionalPostFrameDebugTelemetry({
    avatarName,
    avatarRole,
    floorY,
    footLock,
    footWorldSnapshot,
    frameUpdatedAt,
    registryWindow,
    retargetFrame,
    state: trackingDebugRef.current,
    vrm,
    zScale,
  });
  trackingDebugRef.current = trackingDebugState;

  return {
    applied: true,
    trackingDebugState,
  };
}
