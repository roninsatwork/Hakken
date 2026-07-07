import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";
import {
  createMovementAvatarFrameAccessRuntime,
  type MovementAvatarFrameAccessRole,
} from "./movementAvatarFrameAccessRuntime";
import {
  resolveMovementAvatarFrameRuntimeContext,
  type MovementAvatarFrameRuntimeContext,
} from "./movementAvatarFrameRuntimeContext";
import {
  resolveMovementAvatarReadyFrameRuntime,
  type MovementAvatarReadyFrameRuntime,
} from "./movementAvatarReadyFrameRuntime";
import {
  resolveMovementAvatarSolvedFrameRuntime,
} from "./movementAvatarSolverRuntime";
import type { VrmMotionRef } from "./vrmRigging";

type MovementAvatarFrameAccessRuntime = ReturnType<typeof createMovementAvatarFrameAccessRuntime>;

export type MovementAvatarFrameEntryRuntime =
  | {
    status: "fallback-demo-pose";
    fallbackApplication: ReturnType<MovementAvatarFrameAccessRuntime["applyDemoFallbackPose"]>;
  }
  | {
    status: "ready";
    accessRuntime: MovementAvatarFrameAccessRuntime;
    context: MovementAvatarFrameRuntimeContext;
    readyFrameRuntime: Extract<MovementAvatarReadyFrameRuntime, { status: "ready" }>;
  }
  | {
    status: "skip-frame";
  };

export function resolveMovementAvatarFrameEntryRuntime({
  avatarRoot,
  avatarRole,
  delta,
  isPlaying,
  motionRef,
  showPausedPose,
  usesPlayerMotionPath,
  vrm,
}: {
  avatarRoot: THREE.Group | null | undefined;
  avatarRole: MovementAvatarFrameAccessRole;
  delta: number;
  isPlaying: boolean;
  motionRef: VrmMotionRef;
  showPausedPose: boolean;
  usesPlayerMotionPath: boolean;
  vrm: VRM | null | undefined;
}): MovementAvatarFrameEntryRuntime {
  const context = resolveMovementAvatarFrameRuntimeContext({
    avatarRoot,
    delta,
    vrm,
  });
  if (!context) {
    return {
      status: "skip-frame",
    };
  }

  const accessRuntime = createMovementAvatarFrameAccessRuntime({
    avatarRole,
    getVrm: () => context.vrm,
  });
  const solvedFrameRuntime = resolveMovementAvatarSolvedFrameRuntime({
    isPlaying,
    motionRef,
    showPausedPose,
    usesPlayerMotionPath,
  });
  const readyFrameRuntime = resolveMovementAvatarReadyFrameRuntime({
    hasHumanoid: Boolean(context.vrm.humanoid),
    solvedFrameRuntime,
  });

  if (readyFrameRuntime.status === "fallback-demo-pose") {
    return {
      fallbackApplication: accessRuntime.applyDemoFallbackPose(),
      status: "fallback-demo-pose",
    };
  }

  if (readyFrameRuntime.status !== "ready") {
    return {
      status: "skip-frame",
    };
  }

  return {
    accessRuntime,
    context,
    readyFrameRuntime,
    status: "ready",
  };
}
