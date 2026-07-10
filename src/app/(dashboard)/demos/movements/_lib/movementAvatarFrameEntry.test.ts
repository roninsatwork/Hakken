import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  applyMovementAvatarDemoFallbackRuntimePose,
  createMovementAvatarFrameAccessRuntime,
  resolveMovementAvatarFrameEntryRuntime,
  resolveMovementAvatarReadyFrameRuntime,
} from "./movementAvatarFrameEntry";
import { type MovementAvatarSolvedFrameRuntime, resolveMovementAvatarSolvedFrameRuntime } from "./movementAvatarSolverRuntime";

describe("movementAvatarDemoFallbackRuntime (merged)", () => {
  describe("movementAvatarDemoFallbackRuntime", () => {
    it("applies demo fallback pose targets through the runtime boundary", () => {
      const bones = new Map<string, { quaternion: THREE.Quaternion }>();
      bones.set("spine", { quaternion: new THREE.Quaternion() });
      bones.set("chest", { quaternion: new THREE.Quaternion() });
      bones.set("rightUpperArm", { quaternion: new THREE.Quaternion() });

      const result = applyMovementAvatarDemoFallbackRuntimePose({
        lookupBone: (boneName) => bones.get(boneName) ?? null,
        slerp: 0.35,
      });

      expect(result.applied).toBe(3);
      expect(bones.get("rightUpperArm")?.quaternion.w).toBeLessThan(1);
    });

    it("returns neutral application when no fallback bones are available", () => {
      expect(applyMovementAvatarDemoFallbackRuntimePose({
        lookupBone: () => null,
        slerp: 0.35,
      })).toEqual({ applied: 0 });
    });
  });
});

describe("movementAvatarFrameAccessRuntime (merged)", () => {
  function fakeVrmWithBones(bones: Record<string, THREE.Object3D>) {
    return {
      humanoid: {
        getNormalizedBoneNode: (boneName: string) => bones[boneName] ?? null,
      },
    } as unknown as VRM;
  }

  describe("movementAvatarFrameAccessRuntime", () => {
    it("creates role-specific bone easing and a normalized bone lookup", () => {
      const hips = new THREE.Object3D();
      const runtime = createMovementAvatarFrameAccessRuntime({
        avatarRole: "player",
        getVrm: () => fakeVrmWithBones({ hips }),
      });

      expect(runtime.avatarRole).toBe("player");
      expect(runtime.boneEaseOptions.demoFallbackSlerp).toBeGreaterThan(0);
      expect(runtime.lookupBone("hips")).toBe(hips);
      expect(runtime.lookupBone("leftFoot")).toBeNull();
    });

    it("applies the demo fallback pose through the shared VRM fallback runtime", () => {
      const spine = new THREE.Object3D();
      const rightUpperArm = new THREE.Object3D();
      const runtime = createMovementAvatarFrameAccessRuntime({
        avatarRole: "instructor",
        getVrm: () => fakeVrmWithBones({
          rightUpperArm,
          spine,
        }),
      });

      const result = runtime.applyDemoFallbackPose(1);

      expect(result.applied).toBe(2);
      expect(spine.quaternion.w).toBeLessThan(1);
      expect(rightUpperArm.quaternion.w).toBeLessThan(1);
    });
  });
});

describe("movementAvatarReadyFrameRuntime (merged)", () => {
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
      status: "ready",
      targetSolverLandmarks: [],
    };
  }

  describe("movementAvatarReadyFrameRuntime", () => {
    it("falls back to the demo pose when solver input is missing", () => {
      expect(resolveMovementAvatarReadyFrameRuntime({
        hasHumanoid: true,
        solvedFrameRuntime: { status: "missing-input" },
      })).toEqual({
        status: "fallback-demo-pose",
      });
    });

    it("skips ready solver frames until the VRM humanoid is available", () => {
      expect(resolveMovementAvatarReadyFrameRuntime({
        hasHumanoid: false,
        solvedFrameRuntime: readySolvedFrame(),
      })).toEqual({
        status: "skip-frame",
      });
    });

    it("returns the solved frame when it is ready and the humanoid exists", () => {
      const solvedFrameRuntime = readySolvedFrame();

      expect(resolveMovementAvatarReadyFrameRuntime({
        hasHumanoid: true,
        solvedFrameRuntime,
      })).toEqual({
        solvedFrameRuntime,
        status: "ready",
      });
    });
  });
});

describe("movementAvatarFrameEntryRuntime (merged)", () => {
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
});
