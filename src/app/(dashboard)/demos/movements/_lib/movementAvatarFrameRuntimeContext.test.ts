import { describe, expect, it, vi } from "vitest";
import { resolveMovementAvatarFrameRuntimeContext } from "./movementAvatarFrameRuntimeContext";

describe("movementAvatarFrameRuntimeContext", () => {
  it("skips frame runtime when the avatar root is missing", () => {
    const vrm = { update: vi.fn() };

    expect(resolveMovementAvatarFrameRuntimeContext({
      avatarRoot: null,
      delta: 0.016,
      vrm: vrm as never,
    })).toBeNull();
    expect(vrm.update).not.toHaveBeenCalled();
  });

  it("skips frame runtime when the VRM is missing", () => {
    const avatarRoot = {};

    expect(resolveMovementAvatarFrameRuntimeContext({
      avatarRoot: avatarRoot as never,
      delta: 0.016,
      vrm: null,
    })).toBeNull();
  });

  it("updates the VRM once and returns the frame context", () => {
    const avatarRoot = {};
    const vrm = { update: vi.fn() };

    expect(resolveMovementAvatarFrameRuntimeContext({
      avatarRoot: avatarRoot as never,
      delta: 0.032,
      vrm: vrm as never,
    })).toEqual({
      avatarRoot,
      vrm,
    });
    expect(vrm.update).toHaveBeenCalledTimes(1);
    expect(vrm.update).toHaveBeenCalledWith(0.032);
  });
});
