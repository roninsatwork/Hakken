import { describe, expect, it } from "vitest";
import { applyMovementAvatarLowerBodyFrameStateRefsRuntime } from "./movementAvatarLowerBodyFrameStateRefsRuntime";

describe("movementAvatarLowerBodyFrameStateRefsRuntime", () => {
  it("applies the next lower-body frame-state refs and returns the leg-raise hold decision", () => {
    const legRaiseHoldDecision = {
      lowerBodyDrive: { marker: "drive" },
      state: { depth: 0.62, expiresAt: 240, side: "left" },
      wasHeld: true,
    };
    const nextPlayerLegRaiseHoldState = {
      depth: 0.62,
      expiresAt: 240,
      side: "left",
    };
    const nextPlayerLowerBodyVisualState = {
      squatPresentationDepth: 0.35,
      visualRootDrop: 0.12,
    };
    const nextInstructorLowerBodyVisualState = {
      squatPresentationDepth: 0.18,
      visualRootDrop: 0.04,
    };
    const playerLegRaiseHoldRef = {
      current: { depth: 0, expiresAt: 0, side: null },
    };
    const playerLowerBodyStabilityRef = {
      current: { squatPresentationDepth: 0, visualRootDrop: 0 },
    };
    const instructorLowerBodyStabilityRef = {
      current: { squatPresentationDepth: 0, visualRootDrop: 0 },
    };

    const result = applyMovementAvatarLowerBodyFrameStateRefsRuntime({
      instructorLowerBodyStabilityRef: instructorLowerBodyStabilityRef as never,
      lowerBodyFrameStateRuntime: {
        lowerBodyRuntimeStateDecision: {
          legRaiseHoldDecision,
          nextInstructorLowerBodyVisualState,
          nextPlayerLegRaiseHoldState,
          nextPlayerLowerBodyVisualState,
        },
      } as never,
      playerLegRaiseHoldRef: playerLegRaiseHoldRef as never,
      playerLowerBodyStabilityRef: playerLowerBodyStabilityRef as never,
    });

    expect(playerLegRaiseHoldRef.current).toBe(nextPlayerLegRaiseHoldState);
    expect(playerLowerBodyStabilityRef.current).toBe(nextPlayerLowerBodyVisualState);
    expect(instructorLowerBodyStabilityRef.current).toBe(nextInstructorLowerBodyVisualState);
    expect(result).toEqual({
      legRaiseHoldDecision,
    });
  });
});
