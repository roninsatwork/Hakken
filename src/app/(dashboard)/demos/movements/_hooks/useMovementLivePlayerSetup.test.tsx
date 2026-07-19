import { act, cleanup, renderHook } from "@testing-library/react";
import type { RefObject } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "../_lib/movementAvatarProofFixtures";
import type { VrmMotionRef } from "../_lib/vrmRigging";
import { useMovementLivePlayerSetup } from "./useMovementLivePlayerSetup";

describe("useMovementLivePlayerSetup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => (
      window.setTimeout(() => callback(performance.now()), 0)
    ));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("builds the Replay-equivalent neutral setup from the live prefix", () => {
    const playerLiveLmRef = { current: null } as RefObject<VrmMotionRef>;
    const { result } = renderHook(() => useMovementLivePlayerSetup({
      isVisionReady: true,
      playerLiveLmRef,
    }));

    for (let index = 0; index < 60; index += 1) {
      playerLiveLmRef.current = {
        ...makeMovementAvatarProofMotionPayload("standing"),
        capturedAt: index,
      };
      act(() => vi.runOnlyPendingTimers());
    }

    expect(result.current?.calibration).not.toBeNull();
    expect(result.current?.retargetSourceModel).not.toBeNull();
    expect(result.current?.provenance).toMatchObject({
      builder: "recorded-player-neutral-prefix-v1",
      frameLimit: 59,
    });
  });

  it("does not invent a setup before enough live evidence exists", () => {
    const playerLiveLmRef = {
      current: makeMovementAvatarProofMotionPayload("standing"),
    } as RefObject<VrmMotionRef>;
    const { result } = renderHook(() => useMovementLivePlayerSetup({
      isVisionReady: true,
      playerLiveLmRef,
    }));

    act(() => vi.runOnlyPendingTimers());

    expect(result.current).toBeNull();
  });

  it("keeps collecting until a weak initial prefix is replaced by trustworthy evidence", () => {
    const playerLiveLmRef = { current: null } as RefObject<VrmMotionRef>;
    const { result } = renderHook(() => useMovementLivePlayerSetup({
      isVisionReady: true,
      playerLiveLmRef,
    }));

    for (let index = 0; index < 60; index += 1) {
      const weakPayload = makeMovementAvatarProofMotionPayload("standing");
      playerLiveLmRef.current = {
        ...weakPayload,
        capturedAt: index,
        landmarks: weakPayload.landmarks?.map((landmark) => ({
          ...landmark,
          visibility: 0,
        })),
      };
      act(() => vi.runOnlyPendingTimers());
    }

    expect(result.current).toBeNull();

    for (let index = 60; index < 120; index += 1) {
      playerLiveLmRef.current = {
        ...makeMovementAvatarProofMotionPayload("standing"),
        capturedAt: index,
      };
      act(() => vi.runOnlyPendingTimers());
    }

    expect(result.current?.calibration?.quality).toBeGreaterThanOrEqual(0.55);
    expect(result.current?.retargetSourceModel).not.toBeNull();
  });
});
