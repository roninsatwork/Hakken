import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarSolvedFrameRuntime,
  resolveMovementAvatarSolverRuntimeInput,
} from "./movementAvatarSolverRuntime";
import type { VrmPoseLandmark } from "./vrmRigging";

function buildPose(overrides: Partial<VrmPoseLandmark>[] = []): VrmPoseLandmark[] {
  return Array.from({ length: 33 }, (_, index) => ({
    x: index / 100,
    y: index / 80,
    z: index / 120,
    visibility: 0.9,
    ...overrides[index],
  }));
}

function buildFace(): VrmPoseLandmark[] {
  const face = Array.from({ length: 264 }, () => ({
    x: 0.5,
    y: 0.5,
    z: 0,
    visibility: 0.9,
  }));
  face[1] = { x: 0.62, y: 0.45, z: 0, visibility: 0.9 };
  face[33] = { x: 0.44, y: 0.42, z: 0, visibility: 0.9 };
  face[263] = { x: 0.58, y: 0.47, z: 0, visibility: 0.9 };
  return face;
}

describe("movementAvatarSolverRuntime", () => {
  it("returns null when the motion input has too few landmarks", () => {
    expect(resolveMovementAvatarSolverRuntimeInput({
      isPlaying: true,
      motionRef: buildPose().slice(0, 10),
      showPausedPose: false,
      usesPlayerMotionPath: true,
    })).toBeNull();
  });

  it("reuses instructor prepared input and target solver landmarks", () => {
    const pose = buildPose();
    const faceLandmarks = buildFace();
    const runtimeInput = resolveMovementAvatarSolverRuntimeInput({
      isPlaying: false,
      motionRef: {
        faceLandmarks,
        pose,
      },
      showPausedPose: false,
      usesPlayerMotionPath: false,
    });

    expect(runtimeInput).not.toBeNull();
    expect(runtimeInput?.payload).toEqual({ faceLandmarks, pose });
    expect(runtimeInput?.mirrorPlayerDisplay).toBe(false);
    expect(runtimeInput?.displayPreparedInput).toBe(runtimeInput?.rawPreparedInput);
    expect(runtimeInput?.targetSolverLandmarks).toBe(runtimeInput?.rawPreparedInput.solverLandmarks);
    expect(runtimeInput?.displayPreparedInput.forceStandby).toBe(true);
    expect(runtimeInput?.displayPreparedInput.imageLandmarks[11].visibility).toBe(0);
    expect(runtimeInput?.displayPreparedInput.faceLandmarks?.[1]?.x).toBeCloseTo(0.38);
    expect(runtimeInput?.displayPreparedInput.faceLandmarks?.[33]?.x).toBeCloseTo(0.42);
    expect(runtimeInput?.displayPreparedInput.faceLandmarks?.[263]?.x).toBeCloseTo(0.56);
  });

  it("keeps player source input separate from mirrored display target", () => {
    const pose = buildPose();
    const runtimeInput = resolveMovementAvatarSolverRuntimeInput({
      isPlaying: true,
      motionRef: pose,
      showPausedPose: false,
      usesPlayerMotionPath: true,
    });

    expect(runtimeInput).not.toBeNull();
    expect(runtimeInput?.payload).toBeNull();
    expect(runtimeInput?.mirrorPlayerDisplay).toBe(true);
    expect(runtimeInput?.displayPreparedInput).not.toBe(runtimeInput?.rawPreparedInput);
    expect(runtimeInput?.rawPreparedInput.imageLandmarks[11].x).toBeCloseTo(0.11);
    expect(runtimeInput?.displayPreparedInput.imageLandmarks[11].x).toBeCloseTo(0.88);
    expect(runtimeInput?.targetSolverLandmarks).not.toBe(runtimeInput?.rawPreparedInput.solverLandmarks);
  });

  it("returns explicit missing-input status for unsolved frames with too few landmarks", () => {
    expect(resolveMovementAvatarSolvedFrameRuntime({
      isPlaying: true,
      motionRef: buildPose().slice(0, 10),
      showPausedPose: false,
      usesPlayerMotionPath: true,
    })).toEqual({
      status: "missing-input",
    });
  });

  it("solves and exposes prepared frame fields for the avatar renderer", () => {
    const pose = buildPose();
    const faceLandmarks = buildFace();
    const runtime = resolveMovementAvatarSolvedFrameRuntime({
      isPlaying: true,
      motionRef: {
        faceLandmarks,
        pose,
      },
      showPausedPose: false,
      solvePose: (kalidokitSolverLandmarks, imageLandmarks) => ({
        Hips: {
          position: { x: 0, y: 1, z: 0 },
          rotation: { x: 0, y: 0, z: 0 },
        },
        Spine: {
          x: imageLandmarks[11]?.x ?? 0,
          y: kalidokitSolverLandmarks[11]?.y ?? 0,
          z: 0,
        },
      }),
      usesPlayerMotionPath: true,
    });

    expect(runtime.status).toBe("ready");
    if (runtime.status !== "ready") return;
    expect(runtime.riggedPose.Spine?.x).toBeCloseTo(0.88);
    expect(runtime.riggedPose.Spine?.y).toBeCloseTo(-0.46875);
    expect(runtime.imageLandmarks).toBe(runtime.displayPreparedInput.imageLandmarks);
    expect(runtime.faceLandmarks).toBe(runtime.displayPreparedInput.faceLandmarks);
    expect(runtime.faceLandmarks?.[1]?.x).toBeCloseTo(0.38);
    expect(runtime.solverLandmarks).toBe(runtime.rawPreparedInput.solverLandmarks);
    expect(runtime.rigHands).toBe(runtime.displayPreparedInput.rigHands);
    expect(runtime.targetSolverLandmarks).not.toBe(runtime.rawPreparedInput.solverLandmarks);
  });

  it("returns solve-failed when pose solving throws", () => {
    expect(resolveMovementAvatarSolvedFrameRuntime({
      isPlaying: true,
      motionRef: buildPose(),
      showPausedPose: false,
      solvePose: () => {
        throw new Error("solver failed");
      },
      usesPlayerMotionPath: false,
    })).toEqual({
      status: "solve-failed",
    });
  });

  it("returns empty-pose when pose solving produces no rig", () => {
    expect(resolveMovementAvatarSolvedFrameRuntime({
      isPlaying: true,
      motionRef: buildPose(),
      showPausedPose: false,
      solvePose: () => null,
      usesPlayerMotionPath: false,
    })).toEqual({
      status: "empty-pose",
    });
  });
});
