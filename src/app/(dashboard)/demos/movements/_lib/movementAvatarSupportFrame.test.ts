import * as THREE from "three";
import {
  describe,
  expect,
  it,
} from "vitest";
import type { MovementAvatarSupportContactLockDecision, MovementAvatarSupportPresentationDecision } from "./movementAvatarPipeline";
import {
  applyMovementAvatarSupportContactRuntimeFrame,
  applyMovementAvatarSupportContactRuntimeLocks,
  applyMovementAvatarSupportFrameOrchestrationRuntime,
  applyMovementAvatarSupportFrameRuntime,
  applyMovementAvatarSupportPresentationRuntimeToVrmBones,
  resolveMovementAvatarSupportPresentationRuntimeSpecs,
} from "./movementAvatarSupportFrame";

describe("movementAvatarSupportContactRuntime (merged)", () => {
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
});

describe("movementAvatarSupportPresentationRuntime (merged)", () => {
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
});

describe("movementAvatarSupportFrameRuntime (merged)", () => {
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
});

describe("movementAvatarSupportFrameOrchestrationRuntime (merged)", () => {
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
});
