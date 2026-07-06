import type { MovementGamePathSimulation } from "./movementGamePathSimulation";
import type { MovementMotionFrame } from "./movementMotionFrame";
import type { MovementRootMotionFrame } from "./movementRootMotion";

export type MovementGameVisualParityProofCase =
  | "baseline"
  | "first-scoring-frame"
  | "first-source-display-divergence"
  | "first-tracking-help-frame"
  | "strongest-left-leg-lift"
  | "strongest-right-leg-lift"
  | "strongest-root-travel"
  | "strongest-root-turn"
  | "strongest-squat";

export type MovementGameVisualParityProofFrame = {
  cases: MovementGameVisualParityProofCase[];
  displayedMovementStrength: number;
  displayLowerLabel: string;
  frameIndex: number;
  leftKneeLift: number;
  mirrorMode: MovementMotionFrame["mirrorMode"];
  rawMovementStrength: number;
  readableMovementStrength: number;
  reasons: string[];
  rightKneeLift: number;
  rootHeadingYaw: number;
  rootTravelDistance: number;
  scoreAllowed: boolean;
  sourceLowerLabel: string;
  squatDepth: number;
};

export type MovementGameVisualParityProofOptions = {
  maxFrames?: number;
  minKneeLift?: number;
  minRootTravel?: number;
  minRootTurnYaw?: number;
  minSquatDepth?: number;
};

const DEFAULT_MAX_FRAMES = 12;
const DEFAULT_MIN_KNEE_LIFT = 0.18;
const DEFAULT_MIN_ROOT_TRAVEL = 0.12;
const DEFAULT_MIN_ROOT_TURN_YAW = 0.45;
const DEFAULT_MIN_SQUAT_DEPTH = 0.18;

function absolute(value: number | undefined) {
  return Math.abs(value ?? 0);
}

function metricFrame({
  frameIndex,
  motionFrame,
  rootMotion,
}: {
  frameIndex: number;
  motionFrame: MovementMotionFrame;
  rootMotion?: MovementRootMotionFrame;
}): Omit<MovementGameVisualParityProofFrame, "cases" | "reasons"> {
  const displayDecision = motionFrame.avatarDisplayDecision;
  const sourceDecision = motionFrame.avatarDecision;

  return {
    displayedMovementStrength: motionFrame.readability.displayedMovementStrength,
    displayLowerLabel: displayDecision.lowerLabel,
    frameIndex,
    leftKneeLift: displayDecision.retargetFrame.kneeLift.left,
    mirrorMode: motionFrame.mirrorMode,
    rawMovementStrength: motionFrame.readability.rawMovementStrength,
    readableMovementStrength: motionFrame.readability.readableMovementStrength,
    rightKneeLift: displayDecision.retargetFrame.kneeLift.right,
    rootHeadingYaw: rootMotion?.headingYaw ?? 0,
    rootTravelDistance: rootMotion?.intent.travelDistance ?? 0,
    scoreAllowed: motionFrame.readability.scoreAllowed,
    sourceLowerLabel: sourceDecision.lowerLabel,
    squatDepth: Math.max(
      displayDecision.lowerBodyIntent.squatDepth,
      displayDecision.retargetFrame.squatDepth,
    ),
  };
}

function findStrongestFrame(
  simulation: MovementGamePathSimulation,
  score: (motionFrame: MovementMotionFrame, rootMotion?: MovementRootMotionFrame) => number,
) {
  return simulation.motionFrames.reduce<{ frameIndex: number; value: number } | null>(
    (best, motionFrame, frameIndex) => {
      if (!motionFrame) return best;
      const value = score(motionFrame, simulation.rootMotion.frames[frameIndex]);
      if (!best || value > best.value) return { frameIndex, value };
      return best;
    },
    null,
  );
}

export function selectMovementGameVisualParityProofFrames(
  simulation: MovementGamePathSimulation,
  options: MovementGameVisualParityProofOptions = {},
): MovementGameVisualParityProofFrame[] {
  const maxFrames = options.maxFrames ?? DEFAULT_MAX_FRAMES;
  const minKneeLift = options.minKneeLift ?? DEFAULT_MIN_KNEE_LIFT;
  const minRootTravel = options.minRootTravel ?? DEFAULT_MIN_ROOT_TRAVEL;
  const minRootTurnYaw = options.minRootTurnYaw ?? DEFAULT_MIN_ROOT_TURN_YAW;
  const minSquatDepth = options.minSquatDepth ?? DEFAULT_MIN_SQUAT_DEPTH;
  const frames = new Map<number, MovementGameVisualParityProofFrame>();

  const addFrame = (
    frameIndex: number,
    proofCase: MovementGameVisualParityProofCase,
    reason: string,
  ) => {
    const motionFrame = simulation.motionFrames[frameIndex];
    if (!motionFrame) return;

    const existing = frames.get(frameIndex);
    if (existing) {
      if (!existing.cases.includes(proofCase)) existing.cases.push(proofCase);
      if (!existing.reasons.includes(reason)) existing.reasons.push(reason);
      return;
    }

    frames.set(frameIndex, {
      ...metricFrame({
        frameIndex,
        motionFrame,
        rootMotion: simulation.rootMotion.frames[frameIndex],
      }),
      cases: [proofCase],
      reasons: [reason],
    });
  };

  const firstMotionFrameIndex = simulation.motionFrames.findIndex(Boolean);
  if (firstMotionFrameIndex >= 0) {
    addFrame(firstMotionFrameIndex, "baseline", "first available Game motion frame");
  }

  const firstScoringFrame = simulation.gameplayEvents.findIndex((frame) => (
    frame?.events.some((event) => event.scoreDelta > 0) ?? false
  ));
  if (firstScoringFrame >= 0) {
    addFrame(firstScoringFrame, "first-scoring-frame", "first Game gameplay event with positive score");
  }

  const firstTrackingHelpFrame = simulation.gameplayEvents.findIndex((frame) => (
    frame?.events.some((event) => event.eventType === "tracking-uncertainty") ?? false
  ));
  if (firstTrackingHelpFrame >= 0) {
    addFrame(firstTrackingHelpFrame, "first-tracking-help-frame", "first Game tracking-help frame");
  }

  const firstSourceDisplayDivergence = simulation.motionFrames.findIndex((motionFrame) => {
    if (!motionFrame) return false;
    return motionFrame.avatarDecision.lowerLabel !== motionFrame.avatarDisplayDecision.lowerLabel;
  });
  if (firstSourceDisplayDivergence >= 0) {
    addFrame(
      firstSourceDisplayDivergence,
      "first-source-display-divergence",
      "first frame where source and display lower-body semantics differ",
    );
  }

  const strongestSquat = findStrongestFrame(simulation, (motionFrame) => Math.max(
    motionFrame.avatarDisplayDecision.lowerBodyIntent.squatDepth,
    motionFrame.avatarDisplayDecision.retargetFrame.squatDepth,
  ));
  if (strongestSquat && strongestSquat.value >= minSquatDepth) {
    addFrame(strongestSquat.frameIndex, "strongest-squat", "strongest displayed squat depth");
  }

  const strongestLeftLegLift = findStrongestFrame(
    simulation,
    (motionFrame) => motionFrame.avatarDisplayDecision.retargetFrame.kneeLift.left,
  );
  if (strongestLeftLegLift && strongestLeftLegLift.value >= minKneeLift) {
    addFrame(strongestLeftLegLift.frameIndex, "strongest-left-leg-lift", "strongest displayed left knee lift");
  }

  const strongestRightLegLift = findStrongestFrame(
    simulation,
    (motionFrame) => motionFrame.avatarDisplayDecision.retargetFrame.kneeLift.right,
  );
  if (strongestRightLegLift && strongestRightLegLift.value >= minKneeLift) {
    addFrame(strongestRightLegLift.frameIndex, "strongest-right-leg-lift", "strongest displayed right knee lift");
  }

  const strongestRootTurn = findStrongestFrame(
    simulation,
    (_motionFrame, rootMotion) => absolute(rootMotion?.headingYaw),
  );
  if (strongestRootTurn && strongestRootTurn.value >= minRootTurnYaw) {
    addFrame(strongestRootTurn.frameIndex, "strongest-root-turn", "strongest Game root heading yaw");
  }

  const strongestRootTravel = findStrongestFrame(
    simulation,
    (_motionFrame, rootMotion) => rootMotion?.intent.travelDistance ?? 0,
  );
  if (strongestRootTravel && strongestRootTravel.value >= minRootTravel) {
    addFrame(strongestRootTravel.frameIndex, "strongest-root-travel", "strongest Game root travel distance");
  }

  return [...frames.values()]
    .sort((left, right) => left.frameIndex - right.frameIndex)
    .slice(0, maxFrames)
    .map((frame) => ({
      ...frame,
      cases: [...frame.cases].sort(),
      reasons: [...frame.reasons].sort(),
    }));
}
