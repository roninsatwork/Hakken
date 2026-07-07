import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { resolveMovementAvatarFrameScenePreparationRuntime } from "./movementAvatarFrameScenePreparationRuntime";

describe("movementAvatarFrameScenePreparationRuntime", () => {
  it("updates scene matrices and returns player frame scene values", () => {
    const hipsNode = new THREE.Object3D();
    const updateMatrixWorld = vi.fn();

    const runtime = resolveMovementAvatarFrameScenePreparationRuntime({
      avatarRole: "player",
      lookupBone: (boneName) => boneName === "hips" ? hipsNode : null,
      scene: { updateMatrixWorld },
    });

    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
    expect(runtime.fallbackSlerp).toBe(0.5);
    expect(runtime.hipsNode).toBe(hipsNode);
    expect(runtime.updatedSceneMatrixWorld).toBe(true);
  });

  it("uses instructor fallback and skips missing scenes safely", () => {
    const runtime = resolveMovementAvatarFrameScenePreparationRuntime({
      avatarRole: "instructor",
      lookupBone: () => null,
      scene: null,
    });

    expect(runtime.fallbackSlerp).toBe(0.3);
    expect(runtime.hipsNode).toBeNull();
    expect(runtime.updatedSceneMatrixWorld).toBe(false);
  });
});
