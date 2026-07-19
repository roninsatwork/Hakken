export const MOVEMENT_GAME_START_FRESH_FRAME_DELAY_MS = 120;
export const MOVEMENT_GAME_START_FRESH_FRAME_INTERVAL_MS = 100;
export const MOVEMENT_GAME_START_FRESH_FRAME_ATTEMPT_LIMIT = 15;
export const MOVEMENT_GAME_START_STABLE_FRAME_COUNT = 5;

export type MovementGameStartStabilityState = {
  acceptedFrameCount: number;
  lastCapturedAt: number | null;
};

export function advanceMovementGameStartStability({
  canStart,
  capturedAt,
  state,
}: {
  canStart: boolean;
  capturedAt: number | null;
  state: MovementGameStartStabilityState;
}): MovementGameStartStabilityState {
  if (!canStart) {
    return {
      acceptedFrameCount: 0,
      lastCapturedAt: capturedAt,
    };
  }

  if (capturedAt === null || capturedAt === state.lastCapturedAt) return state;

  return {
    acceptedFrameCount: state.acceptedFrameCount + 1,
    lastCapturedAt: capturedAt,
  };
}

export function shouldContinueMovementGameStartFreshFrameCheck({
  attempt,
  didStart,
}: {
  attempt: number;
  didStart: boolean;
}) {
  return !didStart && attempt < MOVEMENT_GAME_START_FRESH_FRAME_ATTEMPT_LIMIT;
}
