import type { VRM } from "@pixiv/three-vrm";
import {
  appendMovementAvatarFootLockDebugLabel,
} from "./movementAvatarPipeline";
import type { MovementAvatarRootTransformApplication } from "./movementAvatarRootApplication";
import type { MovementAvatarRootTargetDecision } from "./movementAvatarRootTarget";
import { buildMovementAvatarExpressionVisualTelemetry, buildMovementAvatarHandsVisualTelemetry } from "./movementAvatarHandsFaceVisualTelemetry";
import {
  buildMovementAvatarVisualTelemetry,
} from "./movementAvatarVisualTelemetry";
import { buildMovementAvatarSpineVisualTelemetry } from "./movementAvatarAxialVisualTelemetry";
import type { MovementAvatarFootWorldRuntimeSnapshot } from "./movementAvatarFootingFrame";
import type {
  MovementAvatarRetargetRestMap,
  MovementAvatarRigMeasurements,
} from "./movementAvatarRestPose";
import type {
  MovementRetargetFrame,
} from "./movementRetargeting";
import type { MovementTrackingDebugState } from "./movementTrackingCalibration";
import type { TrackingLandmark } from "./movementTrackingCalibration";

export {
  buildMovementAvatarFrameTrackingDebugState,
  buildMovementAvatarRuntimeRetargetDebug,
  buildMovementAvatarTrackingDebugState,
  buildMovementAvatarTrackingFallbackContext,
  type MovementAvatarFrameTrackingDebugInput,
  type MovementAvatarTrackingFallbackContext,
} from "./movementAvatarTrackingDebugTelemetry";
export {
  buildMovementAvatarVisualTelemetry,
} from "./movementAvatarVisualTelemetry";
export { buildMovementAvatarSpineVisualTelemetry, mapMovementAvatarVisualSourceDirection } from "./movementAvatarAxialVisualTelemetry";

export type MovementAvatarRetargetDebugRegistry = Record<
  "instructor" | "player",
  NonNullable<MovementTrackingDebugState["retarget"]> & {
    avatarName: string;
    frameUpdatedAt: number;
  }
>;

export type MovementAvatarRetargetDebugRegistryWindow = {
  __hakkenMovementAvatarDebug?: Partial<Record<
    "instructor" | "player",
    MovementTrackingDebugState & {
      avatarName: string;
      frameUpdatedAt: number;
    }
  >>;
  __hakkenMovementRetargetDebug?: Partial<MovementAvatarRetargetDebugRegistry>;
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
  avatarRestMap,
  floorY,
  footLock,
  footWorldSnapshot,
  frameUpdatedAt,
  registryRole = avatarRole,
  registryWindow,
  retargetFrame,
  retargetSourceModel,
  rigMeasurements,
  sourceImageLandmarks,
  sourceWorldLandmarks,
  state,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  avatarRestMap?: MovementAvatarRetargetRestMap | null;
  floorY?: number;
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  footWorldSnapshot?: MovementAvatarFootWorldRuntimeSnapshot | null;
  frameUpdatedAt: number;
  // Which on-screen avatar this telemetry belongs to in the debug registry.
  // Distinct from avatarRole (motion semantics): the recorded instructor runs
  // the player motion lane but must still register as "instructor" so the
  // proof harnesses can find both avatars.
  registryRole?: "instructor" | "player";
  registryWindow?: MovementAvatarRetargetDebugRegistryWindow;
  retargetFrame: MovementRetargetFrame;
  retargetSourceModel?: import("./movementRetargeting").MovementRetargetSourceModel | null;
  rigMeasurements?: Partial<MovementAvatarRigMeasurements> | null;
  sourceImageLandmarks?: TrackingLandmark[] | null;
  sourceWorldLandmarks?: TrackingLandmark[] | null;
  state: MovementTrackingDebugState;
  vrm: VRM;
  zScale: number;
}): MovementTrackingDebugState {
  let nextState: MovementTrackingDebugState = {
    ...state,
    avatarExpressions: buildMovementAvatarExpressionVisualTelemetry(vrm),
    avatarHands: buildMovementAvatarHandsVisualTelemetry(vrm),
    avatarSpine: buildMovementAvatarSpineVisualTelemetry(vrm),
    avatarVisual: buildMovementAvatarVisualTelemetry({
      anatomicalMapping: avatarRole === "player" ? "opposite" : "identity",
      avatarRestMap,
      floorY,
      footWorldSnapshot,
      retargetFrame,
      retargetSourceModel,
      rigMeasurements,
      sourceImageLandmarks,
      sourceHeadAngles: state.headApplied,
      sourceWorldLandmarks,
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
      avatarRole: registryRole,
      frameUpdatedAt,
      registryWindow,
      retarget: nextState.retarget,
    });
  }
  if (registryWindow) {
    registryWindow.__hakkenMovementAvatarDebug = {
      ...registryWindow.__hakkenMovementAvatarDebug,
      [registryRole]: {
        ...nextState,
        avatarName,
        frameUpdatedAt,
      },
    };
  }

  return nextState;
}

export function applyMovementAvatarOptionalPostFrameDebugTelemetry({
  avatarName,
  avatarRole,
  avatarRestMap,
  floorY,
  footLock,
  footWorldSnapshot,
  frameUpdatedAt,
  registryRole,
  registryWindow,
  retargetFrame,
  retargetSourceModel,
  rigMeasurements,
  sourceImageLandmarks,
  sourceWorldLandmarks,
  state,
  vrm,
  zScale,
}: {
  avatarName: string;
  avatarRole: "instructor" | "player";
  avatarRestMap?: MovementAvatarRetargetRestMap | null;
  floorY?: number;
  footLock: {
    correction: number;
    drift: number;
    strength: number;
  };
  footWorldSnapshot?: MovementAvatarFootWorldRuntimeSnapshot | null;
  frameUpdatedAt: number;
  registryRole?: "instructor" | "player";
  registryWindow?: MovementAvatarRetargetDebugRegistryWindow;
  retargetFrame: MovementRetargetFrame;
  retargetSourceModel?: import("./movementRetargeting").MovementRetargetSourceModel | null;
  rigMeasurements?: Partial<MovementAvatarRigMeasurements> | null;
  sourceImageLandmarks?: TrackingLandmark[] | null;
  sourceWorldLandmarks?: TrackingLandmark[] | null;
  state: MovementTrackingDebugState | null | undefined;
  vrm: VRM | null | undefined;
  zScale: number;
}): MovementTrackingDebugState | null {
  if (!state || !vrm) return state ?? null;

  return applyMovementAvatarPostFrameDebugTelemetry({
    avatarName,
    avatarRole,
    avatarRestMap,
    floorY,
    footLock,
    footWorldSnapshot,
    frameUpdatedAt,
    registryRole,
    registryWindow,
    retargetFrame,
    retargetSourceModel,
    rigMeasurements,
    sourceImageLandmarks,
    sourceWorldLandmarks,
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
  registryWindow.__hakkenMovementRetargetDebug = {
    ...registryWindow.__hakkenMovementRetargetDebug,
    [avatarRole]: {
      ...retarget,
      avatarName,
      frameUpdatedAt,
    },
  };

  return registryWindow.__hakkenMovementRetargetDebug;
}
