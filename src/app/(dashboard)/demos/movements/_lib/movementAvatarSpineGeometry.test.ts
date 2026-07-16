import { describe, expect, it } from "vitest";
import {
  movementAvatarForwardPresentationDrive,
  MOVEMENT_AVATAR_FORWARD_ROTATION_WEIGHT,
  resolveMovementAvatarSourceForwardLean,
} from "./movementAvatarSpineGeometry";

describe("movement avatar spine source geometry", () => {
  it("does not convert a shorter vertical torso projection into forward rotation", () => {
    expect(resolveMovementAvatarSourceForwardLean({
      current: { x: 0, y: -0.32, z: 0 },
      neutral: { x: 0, y: -0.5, z: 0 },
    })).toBe(0);
  });

  it("preserves the absolute sagittal source angle across the distributed spine chain", () => {
    const sourceLean = resolveMovementAvatarSourceForwardLean({
      current: { x: 0.021567, y: -0.51206, z: -0.074248 },
      neutral: { x: 0, y: -0.52, z: 0 },
    });
    const drive = movementAvatarForwardPresentationDrive(sourceLean);

    expect(Math.abs(sourceLean)).toBeCloseTo(0.1435, 3);
    expect(Math.abs(drive)).toBeLessThan(0.12);
    expect(drive * MOVEMENT_AVATAR_FORWARD_ROTATION_WEIGHT).toBeCloseTo(sourceLean, 8);
  });
});
