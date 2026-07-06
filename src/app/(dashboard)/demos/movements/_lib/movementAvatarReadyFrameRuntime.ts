import type { MovementAvatarSolvedFrameRuntime } from "./movementAvatarSolverRuntime";

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
