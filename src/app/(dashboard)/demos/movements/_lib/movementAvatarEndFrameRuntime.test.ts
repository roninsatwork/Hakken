import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { applyMovementAvatarEndFrameRuntime } from "./movementAvatarEndFrameRuntime";

describe("movementAvatarEndFrameRuntime", () => {
  it("applies blendshape expressions and hand rotations through one runtime boundary", () => {
    const expressionWrites: Array<{ name: string; value: number }> = [];
    const handBone = new THREE.Object3D();

    const result = applyMovementAvatarEndFrameRuntime({
      blendshapes: [
        { categoryName: "eyeBlinkLeft", displayName: "eyeBlinkLeft", index: 0, score: 0.2 },
        { categoryName: "jawOpen", displayName: "jawOpen", index: 1, score: 0.8 },
      ],
      expressionManager: {
        setValue: (name, value) => {
          expressionWrites.push({ name, value });
        },
      },
      hands: {
        left: {
          landmarks: Array.from({ length: 21 }, (_, index) => ({
            x: 0.2 + index * 0.001,
            y: 0.3,
            z: 0,
          })),
        },
      },
      isPlayer: true,
      lookupBone: () => handBone,
      mirrorForDisplay: false,
    });

    expect(result.appliedExpressions).toBe(3);
    expect(result.appliedHandRotations).toBeGreaterThanOrEqual(1);
    expect(expressionWrites).toEqual([
      { name: "blinkLeft", value: 0.2 },
      { name: "aa", value: 1 },
      { name: "happy", value: 0 },
    ]);
  });

  it("stays neutral when no expression manager or hands are available", () => {
    expect(applyMovementAvatarEndFrameRuntime({
      blendshapes: null,
      expressionManager: null,
      hands: null,
      isPlayer: true,
      lookupBone: () => null,
      mirrorForDisplay: false,
    })).toEqual({
      appliedExpressions: 0,
      appliedHandRotations: 0,
    });
  });
});
