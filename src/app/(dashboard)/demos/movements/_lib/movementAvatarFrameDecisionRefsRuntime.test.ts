import { describe, expect, it } from "vitest";
import { applyMovementAvatarFrameDecisionRefsRuntime } from "./movementAvatarFrameDecisionRefsRuntime";

describe("movementAvatarFrameDecisionRefsRuntime", () => {
  it("applies the next exercise transition state before falling back without an avatar decision", () => {
    const nextExerciseTransitionState = { marker: "next-state" };
    const exerciseTransitionStateRef = {
      current: { marker: "previous" },
    };

    const result = applyMovementAvatarFrameDecisionRefsRuntime({
      exerciseTransitionStateRef: exerciseTransitionStateRef as never,
      frameDecisionRuntime: {
        avatarDecision: null,
        exerciseTransition: null,
        motionFrameInput: { owner: "presentation-standby" },
        nextExerciseTransitionState,
      } as never,
    });

    expect(exerciseTransitionStateRef.current).toBe(nextExerciseTransitionState);
    expect(result).toEqual({
      status: "fallback-demo-pose",
    });
  });

  it("falls back when the exercise transition is missing", () => {
    const exerciseTransitionStateRef = {
      current: null,
    };

    expect(applyMovementAvatarFrameDecisionRefsRuntime({
      exerciseTransitionStateRef: exerciseTransitionStateRef as never,
      frameDecisionRuntime: {
        avatarDecision: { bodyConfidence: {} },
        exerciseTransition: null,
        motionFrameInput: { owner: "movement-motion-frame" },
        nextExerciseTransitionState: { marker: "next" },
      } as never,
    })).toEqual({
      status: "fallback-demo-pose",
    });
  });

  it("returns ready frame decision values after applying the next exercise state", () => {
    const avatarDecision = { bodyConfidence: {} };
    const exerciseTransition = { key: "stable-upright" };
    const motionFrameInput = { owner: "movement-motion-frame" };
    const nextExerciseTransitionState = { marker: "next-state" };
    const exerciseTransitionStateRef = {
      current: null,
    };

    expect(applyMovementAvatarFrameDecisionRefsRuntime({
      exerciseTransitionStateRef: exerciseTransitionStateRef as never,
      frameDecisionRuntime: {
        avatarDecision,
        exerciseTransition,
        motionFrameInput,
        nextExerciseTransitionState,
      } as never,
    })).toEqual({
      avatarDecision,
      exerciseTransition,
      motionFrameInput,
      status: "ready",
    });
    expect(exerciseTransitionStateRef.current).toBe(nextExerciseTransitionState);
  });
});
