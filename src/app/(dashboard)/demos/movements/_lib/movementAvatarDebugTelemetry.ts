import type { VRM } from "@pixiv/three-vrm";
import {
  appendMovementAvatarFootLockDebugLabel,
} from "./movementAvatarPipeline";
import type { MovementAvatarRootTransformApplication } from "./movementAvatarRootApplication";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";
import { buildMovementAvatarVisualTelemetry } from "./movementAvatarVisualTelemetry";
import type { MovementAvatarFootWorldRuntimeSnapshot } from "./movementAvatarFootingFrame";
import type {
  MovementRetargetFrame,
} from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";

export {
  buildMovementAvatarFrameTrackingDebugState,
  buildMovementAvatarRuntimeRetargetDebug,
  buildMovementAvatarTrackingDebugState,
  buildMovementAvatarTrackingFallbackContext,
  type MovementAvatarFrameTrackingDebugInput,
  type MovementAvatarTrackingFallbackContext,
} from "./movementAvatarTrackingDebugTelemetry";
export { buildMovementAvatarVisualTelemetry } from "./movementAvatarVisualTelemetry";

export type MovementAvatarRetargetDebugRegistry = Record<
  "instructor" | "player",
  NonNullable<MovementTrackingDebugState["retarget"]> & {
    avatarName: string;
    frameUpdatedAt: number;
  }
>;

export type MovementAvatarRetargetDebugRegistryWindow = {
  __sonaeMovementRetargetDebug?: Partial<MovementAvatarRetargetDebugRegistry>;
};

export function buildMovementAvatarRootDebug({
  orientationOwner,
  rootApplication,
  rootTarget,
}: {
  orientationOwner: string;
  rootApplication: MovementAvatarRootTransformApplication;
  rootTarget: MovementAvatarRootTargetDecision;
}): NonNullable<MovementTrackingDebugState["avatarRoot"]> {
  return {
    appliedPitch: Number(rootApplication.rotation.x.toFixed(4)),
    appliedRoll: Number(rootApplication.rotation.z.toFixed(4)),
    appliedYaw: Number(rootApplication.appliedYaw.toFixed(4)),
    appliedX: Number(rootApplication.position.x.toFixed(4)),
    appliedY: Number(rootApplication.position.y.toFixed(4)),
    appliedZ: Number(rootApplication.position.z.toFixed(4)),
    jumpResponseOwner: rootTarget.jumpResponse.owner,
    orientationOwner,
    stepResponseOwner: rootTarget.stepResponse.owner,
    stepResponseSide: rootTarget.stepResponse.side ?? "none",
    targetHeightDrop: Number(rootTarget.targetHeightDrop.toFixed(4)),
    targetJumpHeightOffset: Number(rootTarget.targetJumpHeightOffset.toFixed(4)),
    targetStepFootLiftOffset: Number(
      (rootTarget.stepResponse.shouldApply ? rootTarget.stepResponse.footLiftOffset : 0).toFixed(4),
    ),
    targetPitch: Number(rootTarget.targetPitch.toFixed(4)),
    targetRoll: Number(rootTarget.targetRoll.toFixed(4)),
    targetYaw: Number(rootTarget.rootHeadingYaw.toFixed(4)),
    targetX: Number(rootTarget.targetX.toFixed(4)),
    targetZ: Number(rootTarget.targetZ.toFixed(4)),
    source: rootTarget.source,
  };
}

export function applyMovementAvatarFootLockDebugToTrackingState({
  footLock,
  state,
}: {
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  state: MovementTrackingDebugState;
}): MovementTrackingDebugState {
  const retargetLabel = state.fallbacks.retarget;
  if (!retargetLabel) return state;

  return {
    ...state,
    fallbacks: {
      ...state.fallbacks,
      retarget: appendMovementAvatarFootLockDebugLabel(retargetLabel, footLock),
    },
    retarget: state.retarget
      ? {
        ...state.retarget,
        footLockCorrection: footLock.correction,
        footLockDrift: footLock.drift,
        footLockStrength: footLock.strength,
      }
      : state.retarget,
  };
}

export function applyMovementAvatarPostFrameDebugTelemetry({
  avatarName,
  avatarRole,
  floorY,
  footLock,
  footWorldSnapshot,
  frameUpdatedAt,
  registryWindow,
  retargetFrame,
  state,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  floorY?: number;
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  footWorldSnapshot?: MovementAvatarFootWorldRuntimeSnapshot | null;
  frameUpdatedAt: number;
  registryWindow?: MovementAvatarRetargetDebugRegistryWindow;
  retargetFrame: MovementRetargetFrame;
  state: MovementTrackingDebugState;
  vrm: VRM;
  zScale: number;
}): MovementTrackingDebugState {
  let nextState: MovementTrackingDebugState = {
    ...state,
    avatarVisual: buildMovementAvatarVisualTelemetry({
      floorY,
      footWorldSnapshot,
      retargetFrame,
      vrm,
      zScale,
    }),
  };

  if (nextState.fallbacks.retarget) {
    nextState = applyMovementAvatarFootLockDebugToTrackingState({
      footLock,
      state: nextState,
    });
  }

  if (registryWindow && nextState.retarget) {
    writeMovementAvatarRetargetDebugRegistry({
      avatarName,
      avatarRole,
      frameUpdatedAt,
      registryWindow,
      retarget: nextState.retarget,
    });
  }

  return nextState;
}

export function applyMovementAvatarOptionalPostFrameDebugTelemetry({
  avatarName,
  avatarRole,
  floorY,
  footLock,
  footWorldSnapshot,
  frameUpdatedAt,
  registryWindow,
  retargetFrame,
  state,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  floorY?: number;
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  footWorldSnapshot?: MovementAvatarFootWorldRuntimeSnapshot | null;
  frameUpdatedAt: number;
  registryWindow?: MovementAvatarRetargetDebugRegistryWindow;
  retargetFrame: MovementRetargetFrame;
  state: MovementTrackingDebugState | null | undefined;
  vrm: VRM | null | undefined;
  zScale: number;
}): MovementTrackingDebugState | null {
  if (!state || !vrm) return state ?? null;

  return applyMovementAvatarPostFrameDebugTelemetry({
    avatarName,
    avatarRole,
    floorY,
    footLock,
    footWorldSnapshot,
    frameUpdatedAt,
    registryWindow,
    retargetFrame,
    state,
    vrm,
    zScale,
  });
}

export function writeMovementAvatarRetargetDebugRegistry({
  avatarName,
  avatarRole,
  frameUpdatedAt,
  registryWindow,
  retarget,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  frameUpdatedAt: number;
  registryWindow: MovementAvatarRetargetDebugRegistryWindow;
  retarget: NonNullable<MovementTrackingDebugState["retarget"]>;
}) {
  registryWindow.__sonaeMovementRetargetDebug = {
    ...registryWindow.__sonaeMovementRetargetDebug,
    [avatarRole]: {
      ...retarget,
      avatarName,
      frameUpdatedAt,
    },
  };

  return registryWindow.__sonaeMovementRetargetDebug;
}
