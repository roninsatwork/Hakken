import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarSupportContactRuntimeFrame,
  applyMovementAvatarSupportContactRuntimeLocks,
} from "./movementAvatarSupportContactRuntime";
import type { MovementAvatarSupportContactLockDecision } from "./movementAvatarPipeline";

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

describe("movementAvatarSupportContactRuntime", () => {
  it("returns neutral application when runtime objects or locks are unavailable", () => {
    const result = applyMovementAvatarSupportContactRuntimeLocks({
      avatarRoot: null,
      contactLocks: contactLocks(),
      floorY: -1,
      lookupBone: () => null,
      scene: new THREE.Object3D(),
    });

    expect(result).toEqual({
      applied: false,
      appliedAnchors: 0,
      appliedBoneCorrection: 0,
      appliedRootCorrection: 0,
      supportContactCorrection: 0,
    });
    expect(applyMovementAvatarSupportContactRuntimeLocks({
      avatarRoot: new THREE.Object3D(),
      contactLocks: contactLocks({ shouldApply: false }),
      floorY: -1,
      lookupBone: () => null,
      scene: new THREE.Object3D(),
    })).toEqual(result);
  });

  it("applies active support contact locks through the shared object application helper", () => {
    const scene = new THREE.Object3D();
    const avatarRoot = new THREE.Object3D();
    const hips = new THREE.Object3D();
    scene.add(avatarRoot);
    avatarRoot.add(hips);
    hips.position.y = -0.5;
    scene.updateMatrixWorld(true);

    const result = applyMovementAvatarSupportContactRuntimeLocks({
      avatarRoot,
      contactLocks: contactLocks(),
      floorY: -1,
      lookupBone: (bone) => bone === "hips" ? hips : null,
      scene,
    });

    expect(result.applied).toBe(true);
    expect(result.appliedAnchors).toBe(1);
    expect(result.supportContactCorrection).toBeGreaterThan(0);
    expect(avatarRoot.position.y).not.toBe(0);
  });

  it("returns frame telemetry for support-contact debug context", () => {
    const scene = new THREE.Object3D();
    const avatarRoot = new THREE.Object3D();
    const hips = new THREE.Object3D();
    scene.add(avatarRoot);
    avatarRoot.add(hips);
    hips.position.y = -0.5;
    scene.updateMatrixWorld(true);

    const result = applyMovementAvatarSupportContactRuntimeFrame({
      avatarRoot,
      contactLocks: contactLocks({ owner: "runtime-frame-test" }),
      floorY: -1,
      lookupBone: (bone) => bone === "hips" ? hips : null,
      scene,
    });

    expect(result.application.applied).toBe(true);
    expect(result.telemetry).toEqual({
      anchorCount: result.application.appliedAnchors,
      correction: result.application.supportContactCorrection,
      owner: "runtime-frame-test",
    });
  });
});
