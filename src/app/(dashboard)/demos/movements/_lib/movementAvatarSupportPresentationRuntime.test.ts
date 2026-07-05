import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarSupportPresentationRuntimeToVrmBones,
  resolveMovementAvatarSupportPresentationRuntimeSpecs,
} from "./movementAvatarSupportPresentationRuntime";

const inactivePresentation = {
  armSpecs: [],
  owner: "support-presentation-none",
  shouldApply: false,
  specs: [],
  spineSpecs: [],
};

describe("movementAvatarSupportPresentationRuntime", () => {
  it("returns no specs for inactive support presentation", () => {
    expect(resolveMovementAvatarSupportPresentationRuntimeSpecs(inactivePresentation)).toEqual([]);
    expect(applyMovementAvatarSupportPresentationRuntimeToVrmBones({
      lookupBone: () => null,
      supportPresentation: inactivePresentation,
    })).toEqual({
      applied: 0,
      owner: null,
    });
  });

  it("flattens body, spine, and arm support presentation specs in application order", () => {
    const specs = resolveMovementAvatarSupportPresentationRuntimeSpecs({
      armSpecs: [{
        bone: "leftUpperArm",
        rotation: { x: 0, y: 0, z: 0.3 },
        slerp: 0.6,
      }],
      owner: "support-presentation-test",
      shouldApply: true,
      specs: [{
        bone: "rightUpperLeg",
        rotation: { x: 0.1, y: 0, z: 0 },
        slerp: 0.4,
      }],
      spineSpecs: [{
        bone: "spine",
        rotation: { x: 0.2, y: 0, z: 0 },
        slerp: 0.5,
      }],
    });

    expect(specs.map((spec) => spec.bone)).toEqual(["rightUpperLeg", "spine", "leftUpperArm"]);
  });

  it("applies flattened support presentation specs to available VRM bones", () => {
    const bones = {
      rightUpperLeg: new THREE.Object3D(),
      spine: new THREE.Object3D(),
    };

    const result = applyMovementAvatarSupportPresentationRuntimeToVrmBones({
      lookupBone: (bone) => bones[bone as keyof typeof bones],
      supportPresentation: {
        armSpecs: [{
          bone: "leftUpperArm",
          rotation: { x: 0.4, y: 0, z: 0 },
          slerp: 1,
        }],
        owner: "support-presentation-test",
        shouldApply: true,
        specs: [{
          bone: "rightUpperLeg",
          rotation: { x: 0.1, y: 0, z: 0 },
          slerp: 1,
        }],
        spineSpecs: [{
          bone: "spine",
          rotation: { x: 0.2, y: 0, z: 0 },
          slerp: 1,
        }],
      },
    });

    expect(result).toEqual({
      applied: 2,
      owner: "support-presentation-test",
    });
    expect(bones.rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(bones.spine.quaternion.w).toBeLessThan(1);
  });
});
