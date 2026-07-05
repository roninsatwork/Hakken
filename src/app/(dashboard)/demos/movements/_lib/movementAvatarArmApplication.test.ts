import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarArmAimRequestToVrmBones,
  applyMovementAvatarArmApplication,
  applyMovementAvatarArmApplicationToVrmBones,
} from "./movementAvatarArmApplication";
import type { MovementAvatarArmDecision } from "./movementAvatarPipeline";
import type { VrmSolverLandmark } from "./vrmRigging";

function landmark(index: number): VrmSolverLandmark {
  return {
    visibility: 0.9,
    x: index,
    y: index + 0.1,
    z: index + 0.2,
  };
}

function armDecision(
  overrides: Partial<MovementAvatarArmDecision> = {},
): MovementAvatarArmDecision {
  return {
    endpointConfidence: 0.9,
    isTrackingReady: true,
    side: "right",
    unreadyFallback: "relax",
    ...overrides,
  };
}

function applicationInput(
  overrides: Partial<Parameters<typeof applyMovementAvatarArmApplication>[0]> = {},
): Parameters<typeof applyMovementAvatarArmApplication>[0] {
  return {
    applyAim: () => {},
    applyHandNeutral: () => {},
    armDecision: armDecision(),
    avatarRole: "player",
    elbowTarget: landmark(14),
    frontBias: 0.2,
    holdLastGood: () => {},
    playerArmLandmarks: Array.from({ length: 33 }, (_, index) => landmark(index)),
    relax: () => {},
    safeZScale: 0.24,
    shouldUseRetargetedUpperBody: false,
    side: "right",
    wristTarget: landmark(16),
    ...overrides,
  };
}

describe("movement avatar arm application", () => {
  it("skips local arm application when retargeted upper body owns the branch", () => {
    const events: string[] = [];

    const result = applyMovementAvatarArmApplication(applicationInput({
      applyAim: () => {
        events.push("aim");
      },
      shouldUseRetargetedUpperBody: true,
    }));

    expect(result).toEqual({
      appliedAimRequests: 0,
      handled: false,
      mode: "retarget-skipped",
    });
    expect(events).toEqual([]);
  });

  it("applies tracked arm aim requests and neutral hand easing", () => {
    const events: string[] = [];

    const result = applyMovementAvatarArmApplication(applicationInput({
      applyAim: (request) => {
        events.push(`${request.bone}->${request.child}:${request.options.frontBias}`);
      },
      applyHandNeutral: (side) => {
        events.push(`hand-neutral:${side}`);
      },
      frontBias: 0.2,
      side: "right",
    }));

    expect(result).toEqual({
      appliedAimRequests: 2,
      handled: true,
      mode: "tracked-aim",
    });
    expect(events).toEqual([
      "rightUpperArm->rightLowerArm:0.18000000000000002",
      "rightLowerArm->rightHand:0.22999999999999998",
      "hand-neutral:right",
    ]);
  });

  it("holds last-good rotations for unready arms when requested", () => {
    const events: string[] = [];

    const result = applyMovementAvatarArmApplication(applicationInput({
      armDecision: armDecision({
        isTrackingReady: false,
        side: "left",
        unreadyFallback: "hold-last-good",
      }),
      holdLastGood: (side) => {
        events.push(`hold:${side}`);
      },
      side: "left",
    }));

    expect(result).toEqual({
      appliedAimRequests: 0,
      handled: true,
      mode: "hold-last-good",
    });
    expect(events).toEqual(["hold:left"]);
  });

  it("relaxes unready arms when no last-good hold is requested", () => {
    const events: string[] = [];

    const result = applyMovementAvatarArmApplication(applicationInput({
      armDecision: armDecision({
        isTrackingReady: false,
        unreadyFallback: "relax",
      }),
      relax: (side) => {
        events.push(`relax:${side}`);
      },
    }));

    expect(result).toEqual({
      appliedAimRequests: 0,
      handled: true,
      mode: "relax",
    });
    expect(events).toEqual(["relax:right"]);
  });

  it("applies arm aim requests directly to VRM bones", () => {
    const parent = new THREE.Object3D();
    const rightUpperArm = new THREE.Object3D();
    const rightLowerArm = new THREE.Object3D();
    parent.add(rightUpperArm);
    rightUpperArm.add(rightLowerArm);
    rightLowerArm.position.set(0, -1, 0);
    parent.updateMatrixWorld(true);
    const stored: string[] = [];

    const result = applyMovementAvatarArmAimRequestToVrmBones({
      fallbackZScale: 0.1,
      lookupBone: (boneName) => {
        if (boneName === "rightUpperArm") return rightUpperArm;
        if (boneName === "rightLowerArm") return rightLowerArm;
        return null;
      },
      request: {
        bone: "rightUpperArm",
        child: "rightLowerArm",
        options: {
          frontBias: 0.2,
          minVectorLengthSq: 0.01,
          slerpOverride: 1,
          visibilityThreshold: 0.2,
        },
        source: landmark(12),
        target: landmark(14),
      },
      storeLastGoodQuaternion: (boneName) => {
        stored.push(boneName);
      },
    });

    expect(result).toEqual({ applied: true });
    expect(stored).toEqual(["rightUpperArm"]);
    expect(rightUpperArm.quaternion.w).toBeLessThan(1);
  });

  it("skips arm aim requests when VRM lookup misses", () => {
    expect(applyMovementAvatarArmAimRequestToVrmBones({
      fallbackZScale: 0.1,
      lookupBone: () => null,
      request: {
        bone: "rightUpperArm",
        child: "rightLowerArm",
        options: {
          minVectorLengthSq: 0.01,
          slerpOverride: 1,
          visibilityThreshold: 0.2,
        },
        source: landmark(12),
        target: landmark(14),
      },
    })).toEqual({ applied: false });
  });

  it("applies tracked arm application directly to VRM bones", () => {
    const parent = new THREE.Object3D();
    const rightUpperArm = new THREE.Object3D();
    const rightLowerArm = new THREE.Object3D();
    const rightHand = new THREE.Object3D();
    parent.add(rightUpperArm);
    rightUpperArm.add(rightLowerArm);
    rightLowerArm.add(rightHand);
    rightLowerArm.position.set(0, -1, 0);
    rightHand.position.set(0, -1, 0);
    parent.updateMatrixWorld(true);
    const bones: Record<string, THREE.Object3D> = {
      rightHand,
      rightLowerArm,
      rightUpperArm,
    };
    const lastGood: Record<string, THREE.Quaternion> = {};

    const result = applyMovementAvatarArmApplicationToVrmBones({
      armDecision: armDecision(),
      armRelaxedSlerp: 0.35,
      avatarRole: "player",
      elbowTarget: landmark(14),
      fallbackZScale: 0.1,
      frontBias: 0.2,
      handNeutralSlerp: 0.8,
      lastGood,
      lookupBone: (boneName) => bones[boneName],
      playerArmLandmarks: Array.from({ length: 33 }, (_, index) => landmark(index)),
      safeZScale: 0.24,
      shouldUseRetargetedUpperBody: false,
      side: "right",
      wristTarget: landmark(16),
    });

    expect(result).toEqual({
      appliedAimRequests: 2,
      handled: true,
      mode: "tracked-aim",
    });
    expect(lastGood.rightUpperArm).toBeInstanceOf(THREE.Quaternion);
    expect(lastGood.rightLowerArm).toBeInstanceOf(THREE.Quaternion);
    expect(rightUpperArm.quaternion.w).toBeLessThan(1);
  });

  it("applies last-good fallback directly to VRM bones for unready arms", () => {
    const leftUpperArm = new THREE.Object3D();
    const leftLowerArm = new THREE.Object3D();
    const leftHand = new THREE.Object3D();
    const storedUpperArm = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 0));
    const bones: Record<string, THREE.Object3D> = {
      leftHand,
      leftLowerArm,
      leftUpperArm,
    };

    const result = applyMovementAvatarArmApplicationToVrmBones({
      armDecision: armDecision({
        isTrackingReady: false,
        side: "left",
        unreadyFallback: "hold-last-good",
      }),
      armRelaxedSlerp: 0.35,
      avatarRole: "player",
      elbowTarget: undefined,
      fallbackZScale: 0.1,
      frontBias: 0.2,
      handNeutralSlerp: 0.8,
      lastGood: {
        leftUpperArm: storedUpperArm,
      },
      lookupBone: (boneName) => bones[boneName],
      playerArmLandmarks: Array.from({ length: 33 }, (_, index) => landmark(index)),
      safeZScale: 0.24,
      shouldUseRetargetedUpperBody: false,
      side: "left",
      wristTarget: undefined,
    });

    expect(result).toEqual({
      appliedAimRequests: 0,
      handled: true,
      mode: "hold-last-good",
    });
    expect(leftUpperArm.quaternion.w).toBeLessThan(1);
    expect(leftLowerArm.quaternion.w).toBe(1);
  });
});
