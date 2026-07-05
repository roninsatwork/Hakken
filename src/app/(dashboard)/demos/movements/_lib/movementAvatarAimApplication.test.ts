import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  applyMovementAvatarAimVector,
  applyMovementAvatarAimVectorToObjects,
} from "./movementAvatarAimApplication";

function visibleLandmark(overrides: Partial<{ x: number; y: number; z: number; visibility: number }> = {}) {
  return {
    x: 0,
    y: 0,
    z: 0,
    visibility: 0.9,
    ...overrides,
  };
}

function createBonePair() {
  const parent = new THREE.Object3D();
  const bone = new THREE.Object3D();
  const child = new THREE.Object3D();

  parent.add(bone);
  bone.add(child);
  child.position.set(0, -1, 0);
  parent.updateMatrixWorld(true);

  return { bone, child, parent };
}

describe("movement avatar aim application", () => {
  it("aims a bone toward a target landmark direction", () => {
    const { bone, child } = createBonePair();
    const result = applyMovementAvatarAimVector({
      bone,
      child,
      slerp: 1,
      start: visibleLandmark(),
      target: visibleLandmark({ x: 1 }),
      zScale: 0.1,
    });

    expect(result).toMatchObject({
      shouldStoreLastGood: true,
      status: "applied",
    });
    expect(result!.finalLocalQuaternion.angleTo(bone.quaternion)).toBeCloseTo(0);
    expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeGreaterThan(0.01);
  });

  it("holds the last good quaternion when visibility is low", () => {
    const { bone, child } = createBonePair();
    const lastGoodQuaternion = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0.2, 0.1, -0.3),
    );

    const result = applyMovementAvatarAimVector({
      bone,
      child,
      lastGoodQuaternion,
      slerp: 1,
      start: visibleLandmark({ visibility: 0.1 }),
      target: visibleLandmark({ x: 1 }),
      zScale: 0.1,
    });

    expect(result).toMatchObject({
      shouldStoreLastGood: false,
      status: "held-last-good",
    });
    expect(bone.quaternion.angleTo(lastGoodQuaternion)).toBeCloseTo(0);
  });

  it("uses fallback rotation when visibility is low and no last good quaternion exists", () => {
    const { bone, child } = createBonePair();
    const fallbackEuler = new THREE.Euler(0, 0, 1.2);

    const result = applyMovementAvatarAimVector({
      bone,
      child,
      fallbackEuler,
      slerp: 1,
      start: visibleLandmark(),
      target: visibleLandmark({ visibility: 0.1 }),
      zScale: 0.1,
    });

    expect(result).toMatchObject({
      shouldStoreLastGood: false,
      status: "fallback",
    });
    expect(bone.quaternion.angleTo(new THREE.Quaternion().setFromEuler(fallbackEuler))).toBeCloseTo(0);
  });

  it("skips aim application for incomplete or tiny inputs", () => {
    const { bone, child } = createBonePair();

    expect(applyMovementAvatarAimVector({
      bone,
      child,
      slerp: 1,
      start: null,
      target: visibleLandmark({ x: 1 }),
      zScale: 0.1,
    })).toBeNull();

    expect(applyMovementAvatarAimVector({
      bone,
      child,
      slerp: 1,
      start: visibleLandmark(),
      target: visibleLandmark(),
      zScale: 0.1,
    })).toBeNull();

    expect(applyMovementAvatarAimVector({
      bone: new THREE.Object3D(),
      child,
      slerp: 1,
      start: visibleLandmark(),
      target: visibleLandmark({ x: 1 }),
      zScale: 0.1,
    })).toBeNull();
  });

  it("applies aim vectors through object lookup and stores last-good quaternions", () => {
    const { bone, child } = createBonePair();
    const stored: Array<{ boneName: string; quaternion: THREE.Quaternion }> = [];

    const result = applyMovementAvatarAimVectorToObjects({
      boneName: "rightUpperLeg",
      childName: "rightLowerLeg",
      lookupBone: (boneName) => {
        if (boneName === "rightUpperLeg") return bone;
        if (boneName === "rightLowerLeg") return child;
        return null;
      },
      slerp: 1,
      start: visibleLandmark(),
      storeLastGoodQuaternion: (boneName, quaternion) => {
        stored.push({ boneName, quaternion });
      },
      target: visibleLandmark({ x: 1 }),
      zScale: 0.1,
    });

    expect(result).toEqual({ applied: true, status: "applied" });
    expect(stored).toHaveLength(1);
    expect(stored[0].boneName).toBe("rightUpperLeg");
    expect(stored[0].quaternion.angleTo(bone.quaternion)).toBeCloseTo(0);
  });

  it("skips object aim application when lookup misses the target bones", () => {
    expect(applyMovementAvatarAimVectorToObjects({
      boneName: "rightUpperLeg",
      childName: "rightLowerLeg",
      lookupBone: () => null,
      slerp: 1,
      start: visibleLandmark(),
      target: visibleLandmark({ x: 1 }),
      zScale: 0.1,
    })).toEqual({ applied: false, status: "skipped" });
  });
});
