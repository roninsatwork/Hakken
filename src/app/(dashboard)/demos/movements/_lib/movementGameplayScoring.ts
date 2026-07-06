import {
  resolveMovementGameplayEventFrameSummary,
  resolveMovementGameplayEvents,
} from "./movementGameplayEvents";
import type { MovementMotionFrame } from "./movementMotionFrame";

export type MovementMatchScoringGameplaySummary = {
  gameplayEventFrame: ReturnType<typeof resolveMovementGameplayEvents>;
  gameplaySummary: ReturnType<typeof resolveMovementGameplayEventFrameSummary>;
};

export function resolveMovementMatchScoringGameplaySummary({
  playerMotionFrame,
  previousPlayerMotionFrame = null,
  streak = 0,
}: {
  playerMotionFrame: MovementMotionFrame;
  previousPlayerMotionFrame?: MovementMotionFrame | null;
  streak?: number;
}): MovementMatchScoringGameplaySummary {
  const gameplayEventFrame = resolveMovementGameplayEvents({
    motionFrame: playerMotionFrame,
    previousMotionFrame: previousPlayerMotionFrame,
    streak,
  });

  return {
    gameplayEventFrame,
    gameplaySummary: resolveMovementGameplayEventFrameSummary(gameplayEventFrame),
  };
}
