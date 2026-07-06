import type { VRM } from "@pixiv/three-vrm";
import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createMovementAvatarFrameAccessRuntime } from "./movementAvatarFrameAccessRuntime";

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
