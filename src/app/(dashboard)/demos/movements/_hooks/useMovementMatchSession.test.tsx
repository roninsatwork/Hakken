import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMovementMatchSession } from "./useMovementMatchSession";

describe("useMovementMatchSession", () => {
  it("tracks lobby, avatar, and playback state", () => {
    const { result, rerender } = renderHook(
      ({ isVisionReady }: { isVisionReady: boolean }) =>
        useMovementMatchSession({ isVisionReady }),
      { initialProps: { isVisionReady: false } },
    );

    expect(result.current.isLobby).toBe(true);
    expect(result.current.playerAvatarName).toBe("Jane");
    expect(result.current.instructorAvatarName).toBe("Charlotte");

    act(() => result.current.startMatch());
    act(() => result.current.togglePlaying());

    expect(result.current.isLobby).toBe(false);
    expect(result.current.isPlaying).toBe(false);

    rerender({ isVisionReady: true });

    act(() => {
      result.current.setPlayerAvatarUrl("/models/VIPE_Hero__949.vrm");
      result.current.setInstructorAvatarUrl("/models/VIPE_Hero__2575.vrm");
      result.current.togglePlaying();
    });

    expect(result.current.playerAvatarName).toBe("Tom");
    expect(result.current.instructorAvatarName).toBe("Rachel");
    expect(result.current.isPlaying).toBe(true);
  });

  it("resets scoring and instructor playback for lobby exits and rematches", () => {
    const resetInstructorPlayback = vi.fn();
    const resetScoring = vi.fn();
    const { result, rerender } = renderHook(
      ({ isVisionReady }: { isVisionReady: boolean }) =>
        useMovementMatchSession({ isVisionReady }),
      { initialProps: { isVisionReady: true } },
    );

    act(() => result.current.startMatch());
    act(() =>
      result.current.resetMatch({
        returnToLobby: true,
        resetInstructorPlayback,
        resetScoring,
      }),
    );

    expect(result.current.isLobby).toBe(true);
    expect(result.current.isPlaying).toBe(false);
    expect(resetInstructorPlayback).toHaveBeenCalledTimes(1);
    expect(resetScoring).toHaveBeenCalledTimes(1);

    rerender({ isVisionReady: false });

    act(() =>
      result.current.resetMatch({
        startPlaying: true,
        resetInstructorPlayback,
        resetScoring,
      }),
    );

    expect(result.current.isLobby).toBe(false);
    expect(result.current.isPlaying).toBe(false);
  });
});
