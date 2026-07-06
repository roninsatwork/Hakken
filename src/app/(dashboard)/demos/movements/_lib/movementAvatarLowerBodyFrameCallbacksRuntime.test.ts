import { describe, expect, it, vi } from "vitest";
import { createMovementAvatarLowerBodyFrameCallbacksRuntime } from "./movementAvatarLowerBodyFrameCallbacksRuntime";

describe("movementAvatarLowerBodyFrameCallbacksRuntime", () => {
  it("returns null when no last-good quaternion exists for the bone", () => {
    const callbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
      lastGoodQuaternionRef: {
        current: {},
      },
      scene: {
        updateMatrixWorld: vi.fn(),
      } as never,
    });

    expect(callbacks.getLastGoodQuaternion("leftUpperLeg")).toBeNull();
  });

  it("stores and returns last-good quaternions by bone name", () => {
    const quaternion = {};
    const lastGoodQuaternionRef = {
      current: {},
    };
    const callbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
      lastGoodQuaternionRef: lastGoodQuaternionRef as never,
      scene: {
        updateMatrixWorld: vi.fn(),
      } as never,
    });

    callbacks.storeLastGoodQuaternion("rightLowerLeg", quaternion as never);

    expect(lastGoodQuaternionRef.current).toEqual({
      rightLowerLeg: quaternion,
    });
    expect(callbacks.getLastGoodQuaternion("rightLowerLeg")).toBe(quaternion);
  });

  it("updates the scene world matrix recursively", () => {
    const updateMatrixWorld = vi.fn();
    const callbacks = createMovementAvatarLowerBodyFrameCallbacksRuntime({
      lastGoodQuaternionRef: {
        current: {},
      },
      scene: {
        updateMatrixWorld,
      } as never,
    });

    callbacks.updateWorldMatrix();

    expect(updateMatrixWorld).toHaveBeenCalledTimes(1);
    expect(updateMatrixWorld).toHaveBeenCalledWith(true);
  });
});
