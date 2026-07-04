import type { MovementMotionFrame } from "./movementMotionFrame";

export type MovementGameplayEventType =
  | "effort-reward"
  | "clear-movement-match"
  | "bigger-movement-prompt"
  | "tracking-uncertainty"
  | "recovery-after-lost-tracking"
  | "streak-celebration";

export type MovementGameplayMessage =
  | "great-effort"
  | "nice-clear-move"
  | "try-a-little-bigger"
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
  events: MovementGameplayEvent[];
  nextStreak: number;
  readableMovementStrength: number;
  scoreAllowed: boolean;
};

export type ResolveMovementGameplayEventsInput = {
  motionFrame: MovementMotionFrame;
  previousMotionFrame?: MovementMotionFrame | null;
  streak?: number;
};

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function getReadableMovementStrength(motionFrame: MovementMotionFrame) {
  const decision = motionFrame.avatarDecision;
  return clamp01(Math.max(
    decision.lowerBodyDrive.playerSquatPresentationDepth,
    decision.lowerBodyDrive.playerLegRaiseDepth,
    decision.lowerBodyDrive.liveSquatDepth,
    Math.abs(decision.spineDrive.sideBend),
    Math.abs(decision.spineDrive.forwardLean),
    Math.abs(decision.spineDrive.twist),
    decision.retargetFrame.squatDepth,
    decision.retargetFrame.kneeLift.left,
    decision.retargetFrame.kneeLift.right,
  ));
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
    scoreAllowed: motionFrame.source.cameraConfidence.scoreAllowed,
    scoreDelta,
    sourceFrameId: motionFrame.source.frameId,
  };
}

export function resolveMovementGameplayEvents({
  motionFrame,
  previousMotionFrame = null,
  streak = 0,
}: ResolveMovementGameplayEventsInput): MovementGameplayEventFrame {
  const readableMovementStrength = getReadableMovementStrength(motionFrame);
  const confidence = motionFrame.source.cameraConfidence.frameVisibility;
  const scoreAllowed = motionFrame.source.cameraConfidence.scoreAllowed;
  const events: MovementGameplayEvent[] = [];
  const previousScoreAllowed = previousMotionFrame?.source.cameraConfidence.scoreAllowed ?? true;

  if (!scoreAllowed) {
    const message = motionFrame.source.cameraConfidence.messageEvents[0] ?? "move-where-i-can-see-you";
    events.push(event({
      confidence,
      eventType: "tracking-uncertainty",
      message,
      motionFrame,
      readableMovementStrength,
      scoreDelta: 0,
    }));

    return {
      events,
      nextStreak: 0,
      readableMovementStrength,
      scoreAllowed,
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

  if (readableMovementStrength >= 0.28) {
    const nextStreak = streak + 1;
    events.push(event({
      confidence,
      eventType: "effort-reward",
      message: "great-effort",
      motionFrame,
      readableMovementStrength,
      scoreDelta: 5,
    }));
    events.push(event({
      confidence,
      eventType: "clear-movement-match",
      message: "nice-clear-move",
      motionFrame,
      readableMovementStrength,
      scoreDelta: 10,
    }));
    if (nextStreak > 0 && nextStreak % 5 === 0) {
      events.push(event({
        confidence,
        eventType: "streak-celebration",
        message: "streak-celebration",
        motionFrame,
        readableMovementStrength,
        scoreDelta: 15,
      }));
    }

    return {
      events,
      nextStreak,
      readableMovementStrength,
      scoreAllowed,
    };
  }

  if (readableMovementStrength >= 0.1) {
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
    events,
    nextStreak: 0,
    readableMovementStrength,
    scoreAllowed,
  };
}
