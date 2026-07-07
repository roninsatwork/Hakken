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
  | "strongest-head-direction"
  | "strongest-root-travel"
  | "strongest-root-turn"
  | "strongest-side-bend"
  | "strongest-squat"
  | "strongest-standing-arm-raise"
  | "strongest-standing-reach"
  | "strongest-standing-twist";

export type MovementGameVisualParityProofFrame = {
  cases: MovementGameVisualParityProofCase[];
  displayedMovementStrength: number;
  displayLowerLabel: string;
  frameIndex: number;
  headPitch: number;
  headRoll: number;
  headYaw: number;
  leftKneeLift: number;
  mirrorMode: MovementMotionFrame["mirrorMode"];
  rawMovementStrength: number;
  readableMovementStrength: number;
  reasons: string[];
  rightKneeLift: number;
  rootHeadingYaw: number;
  rootTravelDistance: number;
  scoreAllowed: boolean;
  sideBend: number;
  sourceLowerLabel: string;
  squatDepth: number;
  supportPresentationArmSpecCount: number;
  supportPresentationMaxSpineTwist: number;
  supportPresentationOwner: string;
  supportPresentationSpineSpecCount: number;
};

export type MovementGameVisualParityProofOptions = {
  includeStandingUpperBodyTargets?: boolean;
  maxFrames?: number;
  minKneeLift?: number;
  minHeadDirection?: number;
  minRootTravel?: number;
  minRootTurnYaw?: number;
  minSideBend?: number;
  minSquatDepth?: number;
  minStandingArmSpecCount?: number;
  minStandingReachArmSpecCount?: number;
  minStandingTwist?: number;
};

const DEFAULT_MAX_FRAMES = 12;
const DEFAULT_MIN_KNEE_LIFT = 0.18;
const DEFAULT_MIN_HEAD_DIRECTION = 0.08;
const DEFAULT_MIN_ROOT_TRAVEL = 0.12;
const DEFAULT_MIN_ROOT_TURN_YAW = 0.45;
const DEFAULT_MIN_SIDE_BEND = 0.12;
const DEFAULT_MIN_SQUAT_DEPTH = 0.18;
const DEFAULT_MIN_STANDING_ARM_SPEC_COUNT = 1;
const DEFAULT_MIN_STANDING_REACH_ARM_SPEC_COUNT = 1;
const DEFAULT_MIN_STANDING_TWIST = 0.42;

function absolute(value: number | undefined) {
  return Math.abs(value ?? 0);
}

function maxSupportPresentationSpineTwist(motionFrame: MovementMotionFrame) {
  return Math.max(
    0,
    ...motionFrame.avatarDisplayDecision.supportPresentation.spineSpecs
      .map((spec) => absolute(spec.rotation.y)),
  );
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
  const displayHeadDecision = motionFrame.avatarDisplayHeadTarget.headDecision;
  const sourceDecision = motionFrame.avatarDecision;

  return {
    displayedMovementStrength: motionFrame.readability.displayedMovementStrength,
    displayLowerLabel: displayDecision.lowerLabel,
    frameIndex,
    headPitch: displayHeadDecision.headPitch,
    headRoll: displayHeadDecision.headRoll,
    headYaw: displayHeadDecision.headYaw,
    leftKneeLift: displayDecision.retargetFrame.kneeLift.left,
    mirrorMode: motionFrame.mirrorMode,
    rawMovementStrength: motionFrame.readability.rawMovementStrength,
    readableMovementStrength: motionFrame.readability.readableMovementStrength,
    rightKneeLift: displayDecision.retargetFrame.kneeLift.right,
    rootHeadingYaw: rootMotion?.headingYaw ?? 0,
    rootTravelDistance: rootMotion?.intent.travelDistance ?? 0,
    scoreAllowed: motionFrame.readability.scoreAllowed,
    sideBend: displayDecision.spineDrive.sideBend,
    sourceLowerLabel: sourceDecision.lowerLabel,
    squatDepth: Math.max(
      displayDecision.lowerBodyIntent.squatDepth,
      displayDecision.retargetFrame.squatDepth,
    ),
    supportPresentationArmSpecCount: displayDecision.supportPresentation.armSpecs.length,
    supportPresentationMaxSpineTwist: maxSupportPresentationSpineTwist(motionFrame),
    supportPresentationOwner: displayDecision.supportPresentation.owner,
    supportPresentationSpineSpecCount: displayDecision.supportPresentation.spineSpecs.length,
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
  const includeStandingUpperBodyTargets = options.includeStandingUpperBodyTargets ?? false;
  const minKneeLift = options.minKneeLift ?? DEFAULT_MIN_KNEE_LIFT;
  const minHeadDirection = options.minHeadDirection ?? DEFAULT_MIN_HEAD_DIRECTION;
  const minRootTravel = options.minRootTravel ?? DEFAULT_MIN_ROOT_TRAVEL;
  const minRootTurnYaw = options.minRootTurnYaw ?? DEFAULT_MIN_ROOT_TURN_YAW;
  const minSideBend = options.minSideBend ?? DEFAULT_MIN_SIDE_BEND;
  const minSquatDepth = options.minSquatDepth ?? DEFAULT_MIN_SQUAT_DEPTH;
  const minStandingArmSpecCount = options.minStandingArmSpecCount ?? DEFAULT_MIN_STANDING_ARM_SPEC_COUNT;
  const minStandingReachArmSpecCount =
    options.minStandingReachArmSpecCount ?? DEFAULT_MIN_STANDING_REACH_ARM_SPEC_COUNT;
  const minStandingTwist = options.minStandingTwist ?? DEFAULT_MIN_STANDING_TWIST;
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

  const strongestSideBend = findStrongestFrame(
    simulation,
    (motionFrame) => absolute(motionFrame.avatarDisplayDecision.spineDrive.sideBend),
  );
  if (strongestSideBend && strongestSideBend.value >= minSideBend) {
    addFrame(strongestSideBend.frameIndex, "strongest-side-bend", "strongest displayed side bend");
  }

  const strongestHeadDirection = findStrongestFrame(
    simulation,
    (motionFrame) => Math.max(
      absolute(motionFrame.avatarDisplayHeadTarget.headDecision.headPitch),
      absolute(motionFrame.avatarDisplayHeadTarget.headDecision.headRoll),
      absolute(motionFrame.avatarDisplayHeadTarget.headDecision.headYaw),
    ),
  );
  if (strongestHeadDirection && strongestHeadDirection.value >= minHeadDirection) {
    addFrame(strongestHeadDirection.frameIndex, "strongest-head-direction", "strongest displayed head direction");
  }

  if (includeStandingUpperBodyTargets) {
    const strongestStandingArmRaise = findStrongestFrame(
      simulation,
      (motionFrame) => (
        motionFrame.avatarDisplayDecision.supportPresentation.owner === "support-presentation-standing-arm-raise"
          ? motionFrame.avatarDisplayDecision.supportPresentation.armSpecs.length
          : 0
      ),
    );
    if (strongestStandingArmRaise && strongestStandingArmRaise.value >= minStandingArmSpecCount) {
      addFrame(
        strongestStandingArmRaise.frameIndex,
        "strongest-standing-arm-raise",
        "strongest displayed standing arm raise",
      );
    }

    const strongestStandingTwist = findStrongestFrame(
      simulation,
      (motionFrame) => (
        motionFrame.avatarDisplayDecision.supportPresentation.owner === "support-presentation-standing-twist"
          ? maxSupportPresentationSpineTwist(motionFrame)
          : 0
      ),
    );
    if (strongestStandingTwist && strongestStandingTwist.value >= minStandingTwist) {
      addFrame(
        strongestStandingTwist.frameIndex,
        "strongest-standing-twist",
        "strongest displayed standing twist",
      );
    }

    const strongestStandingReach = findStrongestFrame(
      simulation,
      (motionFrame) => {
        const presentation = motionFrame.avatarDisplayDecision.supportPresentation;
        if (
          presentation.owner !== "support-presentation-standing-arm-raise" &&
          presentation.owner !== "support-presentation-standing-twist"
        ) {
          return 0;
        }
        return presentation.armSpecs.length;
      },
    );
    if (strongestStandingReach && strongestStandingReach.value >= minStandingReachArmSpecCount) {
      addFrame(
        strongestStandingReach.frameIndex,
        "strongest-standing-reach",
        "strongest displayed standing reach",
      );
    }
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
