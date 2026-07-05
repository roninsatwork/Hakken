import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarDemoFallbackRuntimePose } from "./movementAvatarDemoFallbackRuntime";

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
