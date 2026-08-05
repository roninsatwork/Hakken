import type { MovementMotionFrame } from "./movementMotionFrame";

export type MovementGameplayEventType =
  | "effort-reward"
  | "clear-movement-match"
  | "bigger-movement-prompt"
  | "coach-match-prompt"
  | "tracking-uncertainty"
  | "recovery-after-lost-tracking"
  | "streak-celebration";

export type MovementGameplayMessage =
  | "great-effort"
  | "nice-clear-move"
  | "try-a-little-bigger"
  | "match-the-coach"
  | "move-where-i-can-see-you"
  | "step-back"
  | "step-closer"
  | "show-your-hands"
  | "show-your-feet"
  | "tracking-back"
  | "streak-celebration";

export type MovementGameplayEvent = {
  confidence: number;
  eventType: MovementGameplayEventType;
  message: MovementGameplayMessage;
  mirrorMode: MovementMotionFrame["mirrorMode"];
  readableMovementStrength: number;
  scoreAllowed: boolean;
  scoreDelta: number;
  sourceFrameId?: string;
};

export type MovementGameplayEventFrame = {
  /** 0-1 fullness of the movement, graded rather than pass/fail. */
  effortQuality: number;
  events: MovementGameplayEvent[];
  /** 0-1 agreement with the instructor, or null when there is no reference. */
  matchQuality: number | null;
  nextStreak: number;
  /** Display-lane strength, kept for presentation parity with the avatar. */
  readableMovementStrength: number;
  scoreAllowed: boolean;
  /** Source-lane strength the score is actually computed from. */
  scoredMovementStrength: number;
};

export type MovementGameplayEventFrameSummary = {
  feedbackMessage: MovementGameplayMessage | null;
  scoreDeltaTotal: number;
};

export type ResolveMovementGameplayEventsInput = {
  /** 0-100 joint-angle agreement with the instructor for this frame. */
  instructorSync?: number | null;
  motionFrame: MovementMotionFrame;
  previousMotionFrame?: MovementMotionFrame | null;
  streak?: number;
};

/** Anything below this reads as noise rather than an attempted movement. */
const MIN_MOVEMENT_STRENGTH = 0.1;
/** At or above this the movement is clear enough to score. */
const CLEAR_MOVEMENT_STRENGTH = 0.28;
/** Full effort credit; between clear and full the credit ramps. */
const FULL_MOVEMENT_STRENGTH = 0.6;
/** Credit a movement earns for only just clearing the threshold. */
const EFFORT_FLOOR = 0.4;
/** Below this agreement the player is told to follow the coach's shape. */
const WEAK_MATCH_QUALITY = 0.5;
const EFFORT_REWARD_POINTS = 5;
const CLEAR_MOVEMENT_POINTS = 10;
const STREAK_POINTS = 15;

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Graded rather than binary: a movement that only just clears the threshold and
 * a full-depth one used to pay identically, which left nothing to aim at.
 */
export function resolveMovementEffortQuality(strength: number) {
  if (strength < CLEAR_MOVEMENT_STRENGTH) return 0;

  const ramp = clamp01(
    (strength - CLEAR_MOVEMENT_STRENGTH) / (FULL_MOVEMENT_STRENGTH - CLEAR_MOVEMENT_STRENGTH),
  );
  return EFFORT_FLOOR + (1 - EFFORT_FLOOR) * ramp;
}

export function resolveMovementMatchQuality(instructorSync?: number | null) {
  return typeof instructorSync === "number" ? clamp01(instructorSync / 100) : null;
}

function event({
  confidence,
  eventType,
  message,
  motionFrame,
  readableMovementStrength,
  scoreDelta,
}: {
  confidence: number;
  eventType: MovementGameplayEventType;
  message: MovementGameplayMessage;
  motionFrame: MovementMotionFrame;
  readableMovementStrength: number;
  scoreDelta: number;
}): MovementGameplayEvent {
  return {
    confidence,
    eventType,
    message,
    mirrorMode: motionFrame.mirrorMode,
    readableMovementStrength,
    scoreAllowed: motionFrame.readability.scoreAllowed,
    scoreDelta,
    sourceFrameId: motionFrame.source.frameId,
  };
}

export function resolveMovementGameplayEvents({
  instructorSync = null,
  motionFrame,
  previousMotionFrame = null,
  streak = 0,
}: ResolveMovementGameplayEventsInput): MovementGameplayEventFrame {
  const readableMovementStrength = motionFrame.readability.readableMovementStrength;
  // Score from the source lane, not the display lane. The display lane exists to
  // make the avatar read well on screen and can diverge from the body that was
  // actually tracked; readability tracks that divergence as displayAmplification.
  const scoredMovementStrength = motionFrame.readability.scoreAllowed
    ? motionFrame.readability.rawMovementStrength
    : readableMovementStrength;
  const confidence = motionFrame.readability.confidence;
  const scoreAllowed = motionFrame.readability.scoreAllowed;
  const events: MovementGameplayEvent[] = [];
  const previousScoreAllowed = previousMotionFrame?.readability.scoreAllowed ?? true;

  if (!scoreAllowed) {
    const message = motionFrame.readability.messageEvents[0] ?? "move-where-i-can-see-you";
    events.push(event({
      confidence,
      eventType: "tracking-uncertainty",
      message,
      motionFrame,
      readableMovementStrength,
      scoreDelta: 0,
    }));

    return {
      effortQuality: 0,
      events,
      matchQuality: null,
      nextStreak: 0,
      readableMovementStrength,
      scoreAllowed,
      scoredMovementStrength,
    };
  }

  if (!previousScoreAllowed) {
    events.push(event({
      confidence,
      eventType: "recovery-after-lost-tracking",
      message: "tracking-back",
      motionFrame,
      readableMovementStrength,
      scoreDelta: 0,
    }));
  }

  const effortQuality = resolveMovementEffortQuality(scoredMovementStrength);

  if (effortQuality > 0) {
    // Matching the coach is only judged while the player is moving. Two people
    // standing still agree perfectly and that proves nothing.
    const matchQuality = resolveMovementMatchQuality(instructorSync);
    const scoredMatch = matchQuality ?? 1;
    const nextStreak = streak + 1;

    if (matchQuality !== null && matchQuality < WEAK_MATCH_QUALITY) {
      // Lead with the actionable cue: "great effort" while drifting away from
      // the coach's shape is the wrong thing to hear.
      events.push(event({
        confidence,
        eventType: "coach-match-prompt",
        message: "match-the-coach",
        motionFrame,
        readableMovementStrength,
        scoreDelta: 0,
      }));
    }

    events.push(event({
      confidence,
      eventType: "effort-reward",
      message: "great-effort",
      motionFrame,
      readableMovementStrength,
      scoreDelta: Math.round(EFFORT_REWARD_POINTS * effortQuality),
    }));
    events.push(event({
      confidence,
      eventType: "clear-movement-match",
      message: "nice-clear-move",
      motionFrame,
      readableMovementStrength,
      scoreDelta: Math.round(CLEAR_MOVEMENT_POINTS * effortQuality * scoredMatch),
    }));
    if (nextStreak > 0 && nextStreak % 5 === 0) {
      events.push(event({
        confidence,
        eventType: "streak-celebration",
        message: "streak-celebration",
        motionFrame,
        readableMovementStrength,
        scoreDelta: STREAK_POINTS,
      }));
    }

    return {
      effortQuality,
      events,
      matchQuality,
      nextStreak,
      readableMovementStrength,
      scoreAllowed,
      scoredMovementStrength,
    };
  }

  if (scoredMovementStrength >= MIN_MOVEMENT_STRENGTH) {
    events.push(event({
      confidence,
      eventType: "bigger-movement-prompt",
      message: "try-a-little-bigger",
      motionFrame,
      readableMovementStrength,
      scoreDelta: 0,
    }));
  }

  return {
    effortQuality: 0,
    events,
    matchQuality: null,
    nextStreak: 0,
    readableMovementStrength,
    scoreAllowed,
    scoredMovementStrength,
  };
}

export function resolveMovementGameplayEventFrameSummary(
  frame: MovementGameplayEventFrame | null | undefined,
): MovementGameplayEventFrameSummary {
  return {
    feedbackMessage: frame?.events.find((event) => event.message)?.message ?? null,
    scoreDeltaTotal: frame?.events.reduce((sum, event) => sum + event.scoreDelta, 0) ?? 0,
  };
}
