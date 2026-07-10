import type { VRM } from "@pixiv/three-vrm";
import type * as THREE from "three";
import { type MovementAvatarFrameRuntimeContext, resolveMovementAvatarFrameRuntimeContext } from "./movementAvatarFrameRuntimeContext";
import { resolveMovementAvatarBoneEaseOptions } from "./movementAvatarPipeline";
import { type MovementAvatarSolvedFrameRuntime, resolveMovementAvatarSolvedFrameRuntime } from "./movementAvatarSolverRuntime";
import {
  applyVrmDemoFallbackPoseToBones,
  createVrmNormalizedBoneLookup,
  type VrmMotionRef,
  type VrmQuaternionBoneLike,
} from "./vrmRigging";

// --- movementAvatarDemoFallbackRuntime ---

export function applyMovementAvatarDemoFallbackRuntimePose({
  lookupBone,
  slerp,
}: {
  lookupBone: (boneName: string) => VrmQuaternionBoneLike | null | undefined;
  slerp: number;
}) {
  return applyVrmDemoFallbackPoseToBones({
    lookupBone,
    slerp,
  });
}

// --- movementAvatarFrameAccessRuntime ---

export type MovementAvatarFrameAccessRole = "instructor" | "player";

export function createMovementAvatarFrameAccessRuntime({
  avatarRole,
  getVrm,
}: {
  avatarRole: MovementAvatarFrameAccessRole;
  getVrm: () => VRM | null | undefined;
}) {
  const lookupBone = createVrmNormalizedBoneLookup(getVrm);
  const boneEaseOptions = resolveMovementAvatarBoneEaseOptions({
    avatarRole,
  });

  return {
    avatarRole,
    boneEaseOptions,
    lookupBone,
    applyDemoFallbackPose(factor = boneEaseOptions.demoFallbackSlerp) {
      return applyMovementAvatarDemoFallbackRuntimePose({
        lookupBone,
        slerp: factor,
      });
    },
  };
}

// --- movementAvatarReadyFrameRuntime ---

type MovementAvatarReadySolvedFrameRuntime = Extract<
  MovementAvatarSolvedFrameRuntime,
  { status: "ready" }
>;

export type MovementAvatarReadyFrameRuntime =
  | {
    status: "fallback-demo-pose";
  }
  | {
    status: "ready";
    solvedFrameRuntime: MovementAvatarReadySolvedFrameRuntime;
  }
  | {
    status: "skip-frame";
  };

export function resolveMovementAvatarReadyFrameRuntime({
  hasHumanoid,
  solvedFrameRuntime,
}: {
  hasHumanoid: boolean;
  solvedFrameRuntime: MovementAvatarSolvedFrameRuntime;
}): MovementAvatarReadyFrameRuntime {
  if (solvedFrameRuntime.status === "missing-input") {
    return {
      status: "fallback-demo-pose",
    };
  }

  if (solvedFrameRuntime.status !== "ready" || !hasHumanoid) {
    return {
      status: "skip-frame",
    };
  }

  return {
    solvedFrameRuntime,
    status: "ready",
  };
}

// --- movementAvatarFrameEntryRuntime ---

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

