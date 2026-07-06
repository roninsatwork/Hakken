import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarSupportFrameRuntime } from "./movementAvatarSupportFrameRuntime";
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
    specs: [{
      bone: "rightUpperLeg",
      rotation: { x: 0.1, y: 0, z: 0 },
      slerp: 1,
    }],
    spineSpecs: [],
    ...overrides,
  };
}

function contactLocks(
  overrides: Partial<MovementAvatarSupportContactLockDecision> = {},
): MovementAvatarSupportContactLockDecision {
  return {
    anchors: [{
      bone: "hips",
      label: "hips to floor",
      surface: "floor",
      targetOffsetFromFloor: 0.08,
      weight: 1,
    }],
    boneCorrectionScale: 0.35,
    maxBoneCorrection: 0.08,
    maxCorrection: 0.2,
    owner: "support-contact-test",
    rootCorrectionScale: 0.75,
    shouldApply: true,
    slerp: 0.5,
    status: "partial",
    ...overrides,
  };
}

describe("movementAvatarSupportFrameRuntime", () => {
  it("applies support presentation, contact locks, telemetry, and owner handoff", () => {
    const scene = new THREE.Object3D();
    const avatarRoot = new THREE.Object3D();
    const hips = new THREE.Object3D();
    const rightUpperLeg = new THREE.Object3D();
    scene.add(avatarRoot);
    avatarRoot.add(hips);
    avatarRoot.add(rightUpperLeg);
    hips.position.y = -0.5;
    scene.updateMatrixWorld(true);

    const result = applyMovementAvatarSupportFrameRuntime({
      avatarRoot,
      contactLocks: contactLocks({ owner: "support-contact-frame" }),
      currentLowerBodyOwner: "previous-owner",
      floorY: -1,
      lookupBone: (bone) => {
        if (bone === "hips") return hips;
        if (bone === "rightUpperLeg") return rightUpperLeg;
        return null;
      },
      scene,
      supportPresentation: supportPresentation({ owner: "support-presentation-frame" }),
    });

    expect(result.supportPresentationApplication).toEqual({
      applied: 1,
      owner: "support-presentation-frame",
    });
    expect(result.nextLowerBodyOwner).toBe("support-presentation-frame");
    expect(result.supportContactRuntimeApplication.application.applied).toBe(true);
    expect(result.supportContactTelemetry).toEqual({
      anchorCount: 1,
      correction: result.supportContactRuntimeApplication.application.supportContactCorrection,
      owner: "support-contact-frame",
    });
    expect(rightUpperLeg.quaternion.w).toBeLessThan(1);
    expect(avatarRoot.position.y).not.toBe(0);
  });

  it("keeps the existing lower-body owner when support presentation is inactive", () => {
    const result = applyMovementAvatarSupportFrameRuntime({
      avatarRoot: new THREE.Object3D(),
      contactLocks: contactLocks({ shouldApply: false }),
      currentLowerBodyOwner: "previous-owner",
      floorY: -1,
      lookupBone: () => null,
      scene: new THREE.Object3D(),
      supportPresentation: supportPresentation({
        owner: "support-presentation-none",
        shouldApply: false,
        specs: [],
      }),
    });

    expect(result.supportPresentationApplication).toEqual({
      applied: 0,
      owner: null,
    });
    expect(result.nextLowerBodyOwner).toBe("previous-owner");
    expect(result.supportContactRuntimeApplication.application.applied).toBe(false);
    expect(result.supportContactTelemetry).toEqual({
      anchorCount: 0,
      correction: 0,
      owner: "support-contact-test",
    });
  });
});
