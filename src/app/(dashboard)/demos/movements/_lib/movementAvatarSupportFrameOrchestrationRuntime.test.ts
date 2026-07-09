import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarSupportFrameOrchestrationRuntime } from "./movementAvatarSupportFrameOrchestrationRuntime";
import type {
  MovementAvatarSupportContactLockDecision,
  MovementAvatarSupportPresentationDecision,
} from "./movementAvatarPipeline";

function supportPresentation(
  overrides: Partial<Pick<
    MovementAvatarSupportPresentationDecision,
    "armSpecs" | "owner" | "shouldApply" | "specs" | "spineSpecs"
  >> = {},
): Pick<
  MovementAvatarSupportPresentationDecision,
  "armSpecs" | "owner" | "shouldApply" | "specs" | "spineSpecs"
> {
  return {
    armSpecs: [],
    owner: "support-presentation-test",
    shouldApply: true,
    specs: [],
    spineSpecs: [],
    ...overrides,
  };
}

function contactLocks(
  overrides: Partial<MovementAvatarSupportContactLockDecision> = {},
): MovementAvatarSupportContactLockDecision {
  return {
    anchors: [],
    boneCorrectionScale: 0,
    maxBoneCorrection: 0,
    maxCorrection: 0,
    owner: "support-contact-test",
    rootCorrectionScale: 0,
    shouldApply: false,
    slerp: 0,
    status: "inactive",
    ...overrides,
  };
}

describe("movementAvatarSupportFrameOrchestrationRuntime", () => {
  it("returns the support owner when support presentation applies", () => {
    const rightUpperLeg = new THREE.Object3D();

    const result = applyMovementAvatarSupportFrameOrchestrationRuntime({
      avatarRoot: new THREE.Object3D(),
      contactLocks: contactLocks(),
      currentLowerBodyOwner: "previous-owner",
      floorY: -1,
      lookupBone: (bone) => bone === "rightUpperLeg" ? rightUpperLeg : null,
      scene: new THREE.Object3D(),
      supportPresentation: supportPresentation({
        owner: "support-owner",
        shouldApply: true,
        specs: [{
          bone: "rightUpperLeg",
          rotation: { x: 0.1, y: 0, z: 0 },
          slerp: 1,
        }],
      }),
    });

    expect(result.lowerBodyOwner).toBe("support-owner");
    expect(result.supportFrameRuntime.nextLowerBodyOwner).toBe("support-owner");
  });

  it("keeps the current owner when support presentation is inactive", () => {
    const result = applyMovementAvatarSupportFrameOrchestrationRuntime({
      avatarRoot: new THREE.Object3D(),
      contactLocks: contactLocks(),
      currentLowerBodyOwner: "previous-owner",
      floorY: -1,
      lookupBone: () => null,
      scene: new THREE.Object3D(),
      supportPresentation: supportPresentation({
        owner: "support-owner",
        shouldApply: false,
      }),
    });

    expect(result.lowerBodyOwner).toBe("previous-owner");
    expect(result.supportFrameRuntime.nextLowerBodyOwner).toBe("previous-owner");
  });
});
