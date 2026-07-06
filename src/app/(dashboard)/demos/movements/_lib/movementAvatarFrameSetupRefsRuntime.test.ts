import { describe, expect, it } from "vitest";
import { applyMovementAvatarFrameSetupRefsRuntime } from "./movementAvatarFrameSetupRefsRuntime";

describe("movementAvatarFrameSetupRefsRuntime", () => {
  it("applies setup and retarget source model refs from the frame setup runtime", () => {
    const nextSetupState = { marker: "setup" };
    const nextRetargetSourceModel = { marker: "model" };
    const setupStateRef = {
      current: null,
    };
    const retargetSourceModelRef = {
      current: null,
    };

    const result = applyMovementAvatarFrameSetupRefsRuntime({
      frameSetupRuntime: {
        activeCalibration: { quality: 0.8 },
        autoCalibrationKind: "upright",
        nextRetargetSourceModel,
        nextSetupState,
      } as never,
      retargetSourceModelRef: retargetSourceModelRef as never,
      setupStateRef: setupStateRef as never,
    });

    expect(setupStateRef.current).toBe(nextSetupState);
    expect(retargetSourceModelRef.current).toBe(nextRetargetSourceModel);
    expect(result).toEqual({
      activeCalibration: { quality: 0.8 },
      autoCalibrationKind: "upright",
    });
  });

  it("allows the retarget source model ref to be cleared", () => {
    const setupStateRef = {
      current: null,
    };
    const retargetSourceModelRef = {
      current: { marker: "previous" },
    };

    applyMovementAvatarFrameSetupRefsRuntime({
      frameSetupRuntime: {
        activeCalibration: null,
        autoCalibrationKind: null,
        nextRetargetSourceModel: null,
        nextSetupState: { marker: "setup" },
      } as never,
      retargetSourceModelRef: retargetSourceModelRef as never,
      setupStateRef: setupStateRef as never,
    });

    expect(retargetSourceModelRef.current).toBeNull();
  });
});
