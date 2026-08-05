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
  instructorSync = null,
  playerMotionFrame,
  previousPlayerMotionFrame = null,
  streak = 0,
}: {
  /**
   * 0-100 joint-angle agreement with the instructor. Null for lanes with no
   * instructor reference (replay simulation, solo practice), which fall back to
   * grading effort alone.
   */
  instructorSync?: number | null;
  playerMotionFrame: MovementMotionFrame;
  previousPlayerMotionFrame?: MovementMotionFrame | null;
  streak?: number;
}): MovementMatchScoringGameplaySummary {
  const gameplayEventFrame = resolveMovementGameplayEvents({
    instructorSync,
    motionFrame: playerMotionFrame,
    previousMotionFrame: previousPlayerMotionFrame,
    streak,
  });

  return {
    gameplayEventFrame,
    gameplaySummary: resolveMovementGameplayEventFrameSummary(gameplayEventFrame),
  };
}
