import { describe, expect, it } from "vitest";
import {
  createMovementAvatarLowerBodyVisualState,
  createMovementAvatarPlayerLegRaiseHoldState,
  resolveMovementAvatarLowerBodyRuntimeState,
} from "./movementAvatarRuntimeState";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";

function buildLowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
  return {
    groundedSquatDepth: 0,
    liveSquatDepth: 0,
    playerLegRaiseDepth: 0,
    playerLegRaiseSide: null,
    playerLowerBodyState: "neutral",
    playerSquatPresentationDepth: 0,
    shouldApplyLowerBody: false,
    shouldApplySolverTorso: false,
    shouldDrivePlayerLegRaise: false,
    shouldDrivePlayerSquat: false,
    visualRootDrop: 0,
    ...overrides,
  };
}

describe("movementAvatarRuntimeState", () => {
  it("creates neutral player leg-raise hold state", () => {
    expect(createMovementAvatarPlayerLegRaiseHoldState()).toEqual({
      depth: 0,
      expiresAt: 0,
      side: null,
    });
  });

  it("creates independent lower-body visual stability state", () => {
    const first = createMovementAvatarLowerBodyVisualState();
    const second = createMovementAvatarLowerBodyVisualState();

    first.squatPresentationDepth = 0.5;

    expect(second).toEqual({
      squatPresentationDepth: 0,
      visualRootDrop: 0,
    });
  });

  it("updates player leg-raise hold without taking over instructor visual state", () => {
    const instructorVisualState = createMovementAvatarLowerBodyVisualState();
    const decision = resolveMovementAvatarLowerBodyRuntimeState({
      avatarRole: "player",
      instructorLowerBodyVisualState: instructorVisualState,
      lowerBodyDrive: buildLowerBodyDrive({
        playerLegRaiseDepth: 0.44,
        playerLegRaiseSide: "left",
        playerLowerBodyState: "left-leg-raise",
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
      }),
      now: 100,
      playerLegRaiseHoldState: createMovementAvatarPlayerLegRaiseHoldState(),
      playerLowerBodyVisualState: createMovementAvatarLowerBodyVisualState(),
      recordedSquatPresentationDepth: 0,
    });

    expect(decision.lowerBodyDrive.playerLegRaiseDepth).toBeCloseTo(0.44);
    expect(decision.nextPlayerLegRaiseHoldState).toMatchObject({
      depth: 0.44,
      side: "left",
    });
    expect(decision.nextPlayerLegRaiseHoldState.expiresAt).toBeGreaterThan(100);
    expect(decision.nextInstructorLowerBodyVisualState).toBe(instructorVisualState);
  });

  it("updates instructor squat visual state without taking over player state", () => {
    const playerLegRaiseHoldState = {
      depth: 0.3,
      expiresAt: 140,
      side: "right" as const,
    };
    const playerVisualState = createMovementAvatarLowerBodyVisualState();
    const decision = resolveMovementAvatarLowerBodyRuntimeState({
      avatarRole: "instructor",
      instructorLowerBodyVisualState: createMovementAvatarLowerBodyVisualState(),
      lowerBodyDrive: buildLowerBodyDrive(),
      now: 100,
      playerLegRaiseHoldState,
      playerLowerBodyVisualState: playerVisualState,
      recordedSquatPresentationDepth: 0.5,
    });

    expect(decision.nextPlayerLegRaiseHoldState).toEqual({
      depth: 0,
      expiresAt: 0,
      side: null,
    });
    expect(decision.nextPlayerLowerBodyVisualState).toBe(playerVisualState);
    expect(decision.nextInstructorLowerBodyVisualState.squatPresentationDepth).toBeGreaterThan(0);
    expect(decision.lowerBodyVisualDecision.instructorSquatPresentationDepth).toBeGreaterThan(0);
  });
});
