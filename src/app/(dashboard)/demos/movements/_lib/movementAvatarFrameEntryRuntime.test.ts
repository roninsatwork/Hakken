import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { resolveMovementAvatarFrameEntryRuntime } from "./movementAvatarFrameEntryRuntime";
import {
  resolveMovementAvatarSolvedFrameRuntime,
  type MovementAvatarSolvedFrameRuntime,
} from "./movementAvatarSolverRuntime";

vi.mock("./movementAvatarSolverRuntime", async () => {
  const actual = await vi.importActual<typeof import("./movementAvatarSolverRuntime")>(
    "./movementAvatarSolverRuntime",
  );

  return {
    ...actual,
    resolveMovementAvatarSolvedFrameRuntime: vi.fn(),
  };
});

function vrm({ hasHumanoid = true }: { hasHumanoid?: boolean } = {}): VRM & { update: ReturnType<typeof vi.fn> } {
  return {
    humanoid: hasHumanoid
      ? {
          getNormalizedBoneNode: () => null,
        }
      : null,
    update: vi.fn(),
  } as unknown as VRM & { update: ReturnType<typeof vi.fn> };
}

function readySolvedFrame(): Extract<MovementAvatarSolvedFrameRuntime, { status: "ready" }> {
  return {
    displayPreparedInput: {} as never,
    faceLandmarks: undefined,
    forceStandby: false,
    imageLandmarks: [],
    mirrorPlayerDisplay: false,
    payload: null,
    rawPreparedInput: {} as never,
    rigBlendshapes: null as never,
    rigHands: null as never,
    solverLandmarks: [],
    status: "ready",
    targetSolverLandmarks: [],
  };
}

describe("movementAvatarFrameEntryRuntime", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips without updating when the frame context is missing", () => {
    const avatarVrm = vrm();

    expect(resolveMovementAvatarFrameEntryRuntime({
      avatarRole: "player",
      avatarRoot: null,
      delta: 0.016,
      isPlaying: true,
      motionRef: null as never,
      showPausedPose: false,
      usesPlayerMotionPath: true,
      vrm: avatarVrm,
    })).toEqual({
      status: "skip-frame",
    });
    expect(avatarVrm.update).not.toHaveBeenCalled();
    expect(resolveMovementAvatarSolvedFrameRuntime).not.toHaveBeenCalled();
  });

  it("updates the VRM and applies demo fallback when source input is missing", () => {
    vi.mocked(resolveMovementAvatarSolvedFrameRuntime).mockReturnValue({
      status: "missing-input",
    });
    const avatarVrm = vrm();

    const result = resolveMovementAvatarFrameEntryRuntime({
      avatarRole: "instructor",
      avatarRoot: new THREE.Group(),
      delta: 0.032,
      isPlaying: true,
      motionRef: null as never,
      showPausedPose: false,
      usesPlayerMotionPath: false,
      vrm: avatarVrm,
    });

    expect(avatarVrm.update).toHaveBeenCalledWith(0.032);
    expect(result).toMatchObject({
      fallbackApplication: {
        applied: 0,
      },
      status: "fallback-demo-pose",
    });
  });

  it("returns ready context and frame access when the solved frame is usable", () => {
    const solvedFrameRuntime = readySolvedFrame();
    vi.mocked(resolveMovementAvatarSolvedFrameRuntime).mockReturnValue(solvedFrameRuntime);
    const avatarRoot = new THREE.Group();
    const avatarVrm = vrm();

    const result = resolveMovementAvatarFrameEntryRuntime({
      avatarRole: "player",
      avatarRoot,
      delta: 0.016,
      isPlaying: true,
      motionRef: null as never,
      showPausedPose: true,
      usesPlayerMotionPath: true,
      vrm: avatarVrm,
    });

    expect(result.status).toBe("ready");
    if (result.status !== "ready") throw new Error("expected ready frame");
    expect(result.context).toEqual({
      avatarRoot,
      vrm: avatarVrm,
    });
    expect(result.accessRuntime.avatarRole).toBe("player");
    expect(result.readyFrameRuntime.solvedFrameRuntime).toBe(solvedFrameRuntime);
  });

  it("skips solved frames until the VRM humanoid is available", () => {
    vi.mocked(resolveMovementAvatarSolvedFrameRuntime).mockReturnValue(readySolvedFrame());

    expect(resolveMovementAvatarFrameEntryRuntime({
      avatarRole: "player",
      avatarRoot: new THREE.Group(),
      delta: 0.016,
      isPlaying: true,
      motionRef: null as never,
      showPausedPose: false,
      usesPlayerMotionPath: true,
      vrm: vrm({ hasHumanoid: false }),
    })).toEqual({
      status: "skip-frame",
    });
  });
});
