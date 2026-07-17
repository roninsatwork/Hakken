export const MOVEMENT_GAME_START_FRESH_FRAME_DELAY_MS = 120;
export const MOVEMENT_GAME_START_FRESH_FRAME_INTERVAL_MS = 100;
export const MOVEMENT_GAME_START_FRESH_FRAME_ATTEMPT_LIMIT = 15;

export function shouldContinueMovementGameStartFreshFrameCheck({
  attempt,
  didStart,
}: {
  attempt: number;
  didStart: boolean;
}) {
  return !didStart && attempt < MOVEMENT_GAME_START_FRESH_FRAME_ATTEMPT_LIMIT;
}
