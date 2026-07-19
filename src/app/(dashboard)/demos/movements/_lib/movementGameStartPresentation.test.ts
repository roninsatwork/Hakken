import { describe, expect, it } from "vitest";
import type { MovementStartReadiness } from "./movementSourceFrame";
import { getMovementGameStartInstruction } from "./movementGameStartPresentation";

const ALL_REQUIRED_BODY_PARTS: MovementStartReadiness["requiredBodyParts"] = [
  "head",
  "torso",
  "leftArm",
  "rightArm",
  "leftLeg",
  "rightLeg",
  "leftFoot",
  "rightFoot",
];

function readinessWith(
  overrides: Partial<MovementStartReadiness> = {},
): MovementStartReadiness {
  return {
    blockedReasons: [],
    calibrationQuality: 0.9,
    canStartGame: true,
    canStartRecording: true,
    countdownMsRemaining: 0,
    promptEvents: [],
    requiredBodyParts: ALL_REQUIRED_BODY_PARTS,
    state: "ready",
    visibleBodyParts: ALL_REQUIRED_BODY_PARTS,
    ...overrides,
  };
}

describe("getMovementGameStartInstruction", () => {
  it("gives a concrete whole-body action before tracking exists", () => {
    expect(getMovementGameStartInstruction({
      hasAutomaticSetup: false,
      readiness: null,
    })).toBe("Move into view so the camera can see your whole body.");
  });

  it("tells a distant player exactly how to reveal missing legs and feet", () => {
    expect(getMovementGameStartInstruction({
      hasAutomaticSetup: false,
      readiness: readinessWith({
        canStartGame: false,
        state: "blocked",
        visibleBodyParts: ["head", "torso", "leftArm", "rightArm"],
      }),
    })).toBe("Step back until your head and both feet are visible.");
  });

  it("asks the player to keep the detected position while automatic setup finishes", () => {
    expect(getMovementGameStartInstruction({
      hasAutomaticSetup: false,
      readiness: readinessWith(),
    })).toBe("Perfect — stay there while the camera finishes setting up.");
  });

  it("confirms the detected full-body position before countdown", () => {
    expect(getMovementGameStartInstruction({
      hasAutomaticSetup: true,
      readiness: readinessWith(),
    })).toBe("Perfect — stay there.");
  });
});
