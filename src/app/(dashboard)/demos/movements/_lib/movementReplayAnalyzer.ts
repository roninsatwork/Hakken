import {
  extractOwner,
  summarizeMovementDebugReplaySession,
  type MovementDebugReplayFrame,
  type MovementDebugReplayRetarget,
  type MovementDebugReplaySession,
  type MovementDebugReplaySummary,
} from "./movementDebugReplay";
import {
  isMovementAvatarLowerBodyTrackingReady,
  resolveMovementAvatarLowerBodyDrive,
} from "./movementAvatarLowerBody";
import {
  averageMovementRetargetSourceModels,
  buildMovementRetargetSourceModel,
  getRecordedLowerBodySegmentMotionDepth,
  solveMovementRetargetFrame,
  type MovementRetargetSourceModel,
} from "./movementRetargeting";
import {
  averageMovementCalibrations,
  buildMovementCalibration,
  getMovementBodyConfidence,
  getMovementLowerBodyIntent,
  type TrackingLandmark,
} from "./movementTrackingCalibration";

export type MovementReplayFailureCode =
  | "avatar_head_spine_diverged"
  | "avatar_output_diverged"
  | "avatar_upper_body_diverged"
  | "feet_neutral_while_leg_motion_present"
  | "false_knee_raise_candidate"
  | "lower_body_owner_flicker"
  | "retarget_quality_drop"
  | "source_feet_weak"
  | "source_lower_body_out_of_frame"
  | "squat_hold_too_sticky"
  | "squat_not_detected"
  | "stand_recovery_missing"
  | "visual_match_low";

export type MovementReplayFailure = {
  code: MovementReplayFailureCode;
  detail: string;
  frameIndex?: number;
  severity: "error" | "warning";
};

export type MovementReplayAnalysis = {
  failures: MovementReplayFailure[];
  metrics: {
    averageOutOfFrameCount: number;
    averageAvatarLowerBodyDirectionError: number;
    averageRetargetQuality: number;
    avatarVisualFrameCount: number;
    lowerBodyOwnerTransitions: number;
    maxOutOfFrameCount: number;
    maxStandRecoveryHold: number;
    ownerTransitionsPerSecond: number;
    strongFullBodyFrameCount: number;
    visualMatchScore: number;
    visualMotionCoverage: number;
    visualReliableFrameCount: number;
  };
  pass: boolean;
  sessionId: string;
  summary: MovementDebugReplaySummary;
};

type MovementReplayCurrentDecision = {
  bodyConfidence: Record<string, number>;
  feetOwner: string;
  lowerLabel: string;
  lowerOwner: string;
  retarget: MovementDebugReplayRetarget;
};

const STRONG_CONFIDENCE = 0.65;
const AVATAR_LOWER_BODY_DIRECTION_REVIEW_THRESHOLD = 0.52;
const AVATAR_UPPER_BODY_DIRECTION_REVIEW_THRESHOLD = 0.18;
const SOURCE_OUT_OF_FRAME_REVIEW_COUNT = 3;
const VISUAL_MATCH_REVIEW_THRESHOLD = 0.85;

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function isNonNull<T>(value: T | null | undefined): value is T {
  return Boolean(value);
}

function frameConfidence(
  frame: MovementDebugReplayFrame,
  currentDecision: MovementReplayCurrentDecision | undefined,
) {
  return currentDecision?.bodyConfidence ?? frame.bodyConfidence;
}

function minConfidence(
  frame: MovementDebugReplayFrame,
  keys: string[],
  currentDecision?: MovementReplayCurrentDecision,
) {
  const confidence = frameConfidence(frame, currentDecision);
  return Math.min(...keys.map((key) => confidence[key] ?? 0));
}

function averageConfidence(
  frame: MovementDebugReplayFrame,
  keys: string[],
  currentDecision?: MovementReplayCurrentDecision,
) {
  const confidence = frameConfidence(frame, currentDecision);
  return average(keys.map((key) => confidence[key] ?? 0));
}

function lowerOwner(frame: MovementDebugReplayFrame) {
  return extractOwner(frame.fallbacks, "lower");
}

function feetOwner(frame: MovementDebugReplayFrame) {
  return extractOwner(frame.fallbacks, "feet");
}

function lowerLabel(frame: MovementDebugReplayFrame) {
  return frame.fallbacks.lowerBody?.split(/\s+/)[0] ?? "unknown";
}

function hasStrongFullBody(
  frame: MovementDebugReplayFrame,
  currentDecision?: MovementReplayCurrentDecision,
) {
  return minConfidence(
    frame,
    ["hips", "leftKnee", "rightKnee", "leftFoot", "rightFoot"],
    currentDecision,
  ) >= STRONG_CONFIDENCE;
}

function hasLegMotion(frame: MovementDebugReplayFrame, currentDecision?: MovementReplayCurrentDecision) {
  const retarget = currentDecision?.retarget ?? frame.retarget;
  return Math.max(
    retarget?.squatDepth ?? 0,
    retarget?.leftKneeLift ?? 0,
    retarget?.rightKneeLift ?? 0,
    retarget?.lowerBodySegmentMotion ?? 0,
    retarget?.hipDrop ?? 0,
  ) >= 0.22;
}

function hasStoredSquat(frame: MovementDebugReplayFrame, currentDecision?: MovementReplayCurrentDecision) {
  const retarget = currentDecision?.retarget ?? frame.retarget;
  const lower = lowerLabel(frame);
  return lower.includes("squat") ||
    (currentDecision?.lowerLabel.includes("squat") ?? false) ||
    (retarget?.squatDepth ?? 0) >= 0.22 ||
    (retarget?.visualRootDrop ?? 0) >= 0.22 ||
    (currentDecision?.lowerOwner ?? lowerOwner(frame)).includes("squat");
}

function hasNeutralSource(frame: MovementDebugReplayFrame, currentDecision?: MovementReplayCurrentDecision) {
  const retarget = currentDecision?.retarget ?? frame.retarget;
  return Math.max(
    retarget?.squatDepth ?? 0,
    retarget?.hipDrop ?? 0,
    retarget?.leftKneeLift ?? 0,
    retarget?.rightKneeLift ?? 0,
  ) < 0.12;
}

function isReliableVisualFrame(
  frame: MovementDebugReplayFrame,
  currentDecision?: MovementReplayCurrentDecision,
) {
  const quality = currentDecision?.retarget.sourceQuality ?? frame.retarget?.sourceQuality ?? 0;
  return hasStrongFullBody(frame, currentDecision) &&
    quality >= 0.55 &&
    (frame.poseBounds?.outOfFrameCount ?? 0) < 4 &&
    (frame.poseBounds?.maxY ?? 0) <= 1.08;
}

function isLowerMotionRepresented({
  currentDecision,
  frame,
}: {
  currentDecision?: MovementReplayCurrentDecision;
  frame: MovementDebugReplayFrame;
}) {
  const owner = currentDecision?.lowerOwner ?? lowerOwner(frame);
  const feet = currentDecision?.feetOwner ?? feetOwner(frame);
  if (owner.includes("neutral")) return false;
  return owner.includes("squat") || owner.includes("retarget") || feet !== "neutral";
}

function transitionCount(values: string[]) {
  return values.reduce((count, value, index) => (
    index > 0 && value !== values[index - 1] ? count + 1 : count
  ), 0);
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function clamp(value: number, min = 0, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function avatarLowerBodyDirectionError(frame: MovementDebugReplayFrame) {
  const compared = frame.avatarVisual?.comparedLowerBodySegments ?? 0;
  const error = frame.avatarVisual?.averageLowerBodyDirectionError;
  if (compared < 4 || typeof error !== "number" || !Number.isFinite(error)) return null;
  return error;
}

function avatarUpperBodyDirectionError(frame: MovementDebugReplayFrame) {
  const compared = frame.avatarVisual?.comparedUpperBodySegments ?? 0;
  const error = frame.avatarVisual?.averageUpperBodyDirectionError;
  if (compared < 3 || typeof error !== "number" || !Number.isFinite(error)) return null;
  return error;
}

function pushFailure(
  failures: MovementReplayFailure[],
  failure: MovementReplayFailure,
) {
  failures.push(failure);
}

function isCompressibleSourceWarning(failure: MovementReplayFailure) {
  return failure.severity === "warning" && (
    failure.code === "source_feet_weak" ||
    failure.code === "source_lower_body_out_of_frame"
  );
}

function sourceWarningLabel(code: MovementReplayFailureCode) {
  if (code === "source_feet_weak") return "source feet are weak";
  if (code === "source_lower_body_out_of_frame") return "source lower body is out of frame";
  return code;
}

function compressReplayFailures(failures: MovementReplayFailure[]) {
  const compressed: MovementReplayFailure[] = [];
  const sourceWarnings = failures
    .filter((failure) => isCompressibleSourceWarning(failure) && typeof failure.frameIndex === "number")
    .sort((left, right) => (
      left.code.localeCompare(right.code) ||
      (left.frameIndex ?? 0) - (right.frameIndex ?? 0)
    ));
  const consumed = new Set<MovementReplayFailure>();

  for (let index = 0; index < sourceWarnings.length; index += 1) {
    const first = sourceWarnings[index];
    if (!first || consumed.has(first) || typeof first.frameIndex !== "number") continue;

    const range = [first];
    consumed.add(first);
    let endFrame = first.frameIndex;

    for (let nextIndex = index + 1; nextIndex < sourceWarnings.length; nextIndex += 1) {
      const next = sourceWarnings[nextIndex];
      if (!next || next.code !== first.code || typeof next.frameIndex !== "number") continue;
      if (next.frameIndex !== endFrame + 1) break;
      range.push(next);
      consumed.add(next);
      endFrame = next.frameIndex;
    }

    const startFrame = first.frameIndex;
    const frameLabel = startFrame === endFrame
      ? `Frame ${startFrame}`
      : `Frames ${startFrame}-${endFrame}`;
    compressed.push({
      code: first.code,
      detail: `${frameLabel}: ${sourceWarningLabel(first.code)} across ${range.length} frame${range.length === 1 ? "" : "s"}.`,
      frameIndex: startFrame,
      severity: "warning",
    });
  }

  failures.forEach((failure) => {
    if (
      isCompressibleSourceWarning(failure) &&
      typeof failure.frameIndex === "number" &&
      consumed.has(failure)
    ) {
      return;
    }

    compressed.push(failure);
  });

  return compressed.sort((left, right) => {
    if (left.severity !== right.severity) return left.severity === "error" ? -1 : 1;
    if (typeof left.frameIndex === "number" && typeof right.frameIndex === "number") {
      return left.frameIndex - right.frameIndex;
    }
    if (typeof left.frameIndex === "number") return -1;
    if (typeof right.frameIndex === "number") return 1;
    return left.code.localeCompare(right.code);
  });
}

function toTrackingLandmarks(frame: MovementDebugReplayFrame): TrackingLandmark[] | null {
  return frame.tracking.pose.length >= 33 ? frame.tracking.pose : null;
}

function toReplayRetarget(
  retargetSourceModel: MovementRetargetSourceModel | null,
  retargetFrame: ReturnType<typeof solveMovementRetargetFrame>,
): MovementDebugReplayRetarget {
  return {
    appliedLowerBody: retargetFrame.debug.solvedSegments.filter((name) => (
      name === "leftThigh" ||
      name === "leftShin" ||
      name === "rightThigh" ||
      name === "rightShin" ||
      name === "leftFoot" ||
      name === "rightFoot"
    )).length,
    appliedUpperBody: retargetFrame.debug.solvedSegments.filter((name) => (
      name === "spine" ||
      name === "leftUpperArm" ||
      name === "leftLowerArm" ||
      name === "rightUpperArm" ||
      name === "rightLowerArm"
    )).length,
    hipDrop: retargetFrame.hipDrop,
    leftFootContact: retargetFrame.contacts.leftFoot,
    leftKneeLift: retargetFrame.kneeLift.left,
    lowerBodySegmentMotion: getRecordedLowerBodySegmentMotionDepth({
      calibration: retargetSourceModel,
      frame: retargetFrame,
    }),
    rightFootContact: retargetFrame.contacts.rightFoot,
    rightKneeLift: retargetFrame.kneeLift.right,
    solvedSegments: retargetFrame.debug.solvedSegments.length,
    sourceQuality: retargetFrame.debug.sourceQuality,
    squatDepth: retargetFrame.squatDepth,
    totalLowerBody: 6,
    totalUpperBody: 5,
    totalSegments: 11,
    visualRootDrop: 0,
  };
}

function buildCurrentDecisions(session: MovementDebugReplaySession): Array<MovementReplayCurrentDecision | undefined> {
  const frameLandmarks = session.samples.map(toTrackingLandmarks);
  const landmarkFrames = frameLandmarks.filter((landmarks): landmarks is TrackingLandmark[] => Boolean(landmarks));
  if (landmarkFrames.length === 0) return session.samples.map(() => undefined);

  const calibration = averageMovementCalibrations(
    landmarkFrames
      .map((poseLandmarks) => buildMovementCalibration({ poseLandmarks }))
      .filter(isNonNull),
  );
  const retargetSourceModel = averageMovementRetargetSourceModels(
    landmarkFrames
      .map((poseLandmarks) => buildMovementRetargetSourceModel({ poseLandmarks }))
      .filter(isNonNull),
  );

  return frameLandmarks.map((poseLandmarks) => {
    if (!poseLandmarks) return undefined;

    const bodyConfidence = getMovementBodyConfidence(poseLandmarks);
    const lowerBodyIntent = getMovementLowerBodyIntent({
      calibration,
      poseLandmarks,
    });
    const retargetFrame = solveMovementRetargetFrame({
      calibration: retargetSourceModel,
      poseLandmarks,
    });
    const lowerBodyTrackingReady = isMovementAvatarLowerBodyTrackingReady({
      bodyConfidence,
      isPlayer: true,
      lowerBodyIntent,
    });
    const lowerBodyDrive = resolveMovementAvatarLowerBodyDrive({
      hasLiveBodyCalibration: Boolean(calibration),
      isPlayer: true,
      lowerBodyIntent,
      lowerBodyTrackingReady,
      retargetContactsBothFeet: retargetFrame.contacts.leftFoot && retargetFrame.contacts.rightFoot,
      retargetSquatDepth: retargetFrame.squatDepth,
    });
    const solvedLowerSegments = retargetFrame.debug.solvedSegments.filter((name) => (
      name === "leftThigh" ||
      name === "leftShin" ||
      name === "rightThigh" ||
      name === "rightShin"
    )).length;
    const solvedFootSegments = retargetFrame.debug.solvedSegments.filter((name) => (
      name === "leftFoot" ||
      name === "rightFoot"
    )).length;
    const canUseRetargetLegRaise =
      lowerBodyDrive.shouldDrivePlayerLegRaise &&
      retargetFrame.debug.sourceQuality >= 0.65 &&
      retargetFrame.debug.solvedSegments.length >= 8;
    const retargetOwnsLowerBody =
      solvedLowerSegments >= 4 &&
      retargetFrame.debug.sourceQuality >= 0.45;
    const lowerOwner = !lowerBodyTrackingReady || !lowerBodyDrive.shouldApplyLowerBody
      ? "neutral"
      : lowerBodyDrive.shouldDrivePlayerSquat
        ? "player-stable-squat"
        : lowerBodyDrive.shouldDrivePlayerLegRaise && !canUseRetargetLegRaise
          ? `player-${lowerBodyDrive.playerLegRaiseSide}-leg-raise`
          : retargetOwnsLowerBody
            ? "player-retarget"
            : "neutral";
    const feetOwner = lowerBodyDrive.shouldDrivePlayerSquat ||
      (lowerOwner === "player-retarget" && solvedFootSegments > 0)
      ? "recorded-retarget"
      : "neutral";

    return {
      bodyConfidence,
      feetOwner,
      lowerLabel: lowerBodyIntent.label,
      lowerOwner,
      retarget: toReplayRetarget(retargetSourceModel, retargetFrame),
    };
  });
}

export function analyzeMovementDebugReplaySession(
  session: MovementDebugReplaySession,
): MovementReplayAnalysis {
  const failures: MovementReplayFailure[] = [];
  const frames = session.samples;
  const currentDecisions = buildCurrentDecisions(session);
  const outOfFrameCounts = frames.map((frame) => frame.poseBounds?.outOfFrameCount ?? 0);
  const retargetQualities = frames
    .map((frame, index) => currentDecisions[index]?.retarget.sourceQuality ?? frame.retarget?.sourceQuality)
    .filter((quality): quality is number => typeof quality === "number");
  const lowerOwners = frames.map((frame, index) => currentDecisions[index]?.lowerOwner ?? lowerOwner(frame));
  const lowerBodyOwnerTransitions = transitionCount(lowerOwners);
  const durationSeconds = Math.max(session.durationMs / 1000, 0.001);
  const strongFullBodyFrameCount = frames.filter((frame, index) => (
    hasStrongFullBody(frame, currentDecisions[index])
  )).length;
  const visualReliableFrameCount = frames.filter((frame, index) => (
    isReliableVisualFrame(frame, currentDecisions[index])
  )).length;
  const lowerMotionFrames = frames
    .map((frame, index) => ({ currentDecision: currentDecisions[index], frame }))
    .filter(({ currentDecision, frame }) => hasLegMotion(frame, currentDecision));
  const representedLowerMotionFrameCount = lowerMotionFrames.filter(isLowerMotionRepresented).length;
  const visualMotionCoverage = lowerMotionFrames.length === 0
    ? 1
    : representedLowerMotionFrameCount / lowerMotionFrames.length;
  const reliableFrameRatio = frames.length === 0 ? 0 : visualReliableFrameCount / frames.length;
  const ownerStabilityScore = clamp(1 - (lowerBodyOwnerTransitions / durationSeconds) / 1.25);
  const avatarDirectionErrors = frames
    .map(avatarLowerBodyDirectionError)
    .filter((error): error is number => typeof error === "number");
  const averageAvatarLowerBodyDirectionError = average(avatarDirectionErrors);
  const avatarOutputScore = avatarDirectionErrors.length === 0
    ? null
    : clamp(1 - averageAvatarLowerBodyDirectionError / 0.75);
  const heuristicVisualMatchScore = clamp(
    reliableFrameRatio * 0.38 +
    average(retargetQualities) * 0.26 +
    visualMotionCoverage * 0.26 +
    ownerStabilityScore * 0.1,
  );
  const visualMatchScore = avatarOutputScore === null
    ? heuristicVisualMatchScore
    : clamp(heuristicVisualMatchScore * 0.7 + avatarOutputScore * 0.3);

  frames.forEach((frame, index) => {
    const currentDecision = currentDecisions[index];
    const retarget = currentDecision?.retarget ?? frame.retarget;
    const footConfidence = averageConfidence(frame, ["leftFoot", "rightFoot"], currentDecision);
    const kneeConfidence = averageConfidence(frame, ["leftKnee", "rightKnee"], currentDecision);
    const owner = currentDecision?.lowerOwner ?? lowerOwner(frame);
    const feet = currentDecision?.feetOwner ?? feetOwner(frame);
    const label = currentDecision?.lowerLabel ?? lowerLabel(frame);
    const avatarDirectionError = avatarLowerBodyDirectionError(frame);
    const avatarUpperBodyError = avatarUpperBodyDirectionError(frame);

    if (
      (frame.poseBounds?.outOfFrameCount ?? 0) >= SOURCE_OUT_OF_FRAME_REVIEW_COUNT ||
      (frame.poseBounds?.maxY ?? 0) > 1.08
    ) {
      pushFailure(failures, {
        code: "source_lower_body_out_of_frame",
        detail: `Frame ${index} has ${frame.poseBounds?.outOfFrameCount ?? 0} landmarks out of frame.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (footConfidence < 0.35 && kneeConfidence >= 0.45) {
      pushFailure(failures, {
        code: "source_feet_weak",
        detail: `Frame ${index} has knee confidence ${kneeConfidence.toFixed(2)} but foot confidence ${footConfidence.toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if ((retarget?.sourceQuality ?? 1) < 0.45) {
      pushFailure(failures, {
        code: "retarget_quality_drop",
        detail: `Frame ${index} retarget quality is ${(retarget?.sourceQuality ?? 0).toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (
      avatarDirectionError !== null &&
      avatarDirectionError > AVATAR_LOWER_BODY_DIRECTION_REVIEW_THRESHOLD
    ) {
      pushFailure(failures, {
        code: "avatar_output_diverged",
        detail: `Frame ${index} avatar lower-body direction error is ${avatarDirectionError.toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (
      avatarUpperBodyError !== null &&
      avatarUpperBodyError > AVATAR_UPPER_BODY_DIRECTION_REVIEW_THRESHOLD
    ) {
      pushFailure(failures, {
        code: "avatar_upper_body_diverged",
        detail: `Frame ${index} avatar upper-body direction error is ${avatarUpperBodyError.toFixed(2)}.`,
        frameIndex: index,
        severity: "warning",
      });
    }

    if (
      hasStrongFullBody(frame, currentDecision) &&
      hasLegMotion(frame, currentDecision) &&
      feet === "neutral" &&
      !owner.includes("neutral")
    ) {
      pushFailure(failures, {
        code: "feet_neutral_while_leg_motion_present",
        detail: `Frame ${index} has strong leg motion and lower owner "${owner}" but feet owner is neutral.`,
        frameIndex: index,
        severity: "error",
      });
    }

    if (
      label.includes("knee-raise") &&
      hasStrongFullBody(frame, currentDecision) &&
      footConfidence >= STRONG_CONFIDENCE &&
      (retarget?.sourceQuality ?? 0) >= STRONG_CONFIDENCE &&
      feet === "neutral"
    ) {
      pushFailure(failures, {
        code: "false_knee_raise_candidate",
        detail: `Frame ${index} is "${label}" with strong full-body data but neutral feet.`,
        frameIndex: index,
        severity: "error",
      });
    }

    if (
      hasStrongFullBody(frame, currentDecision) &&
      (retarget?.hipDrop ?? 0) >= 0.22 &&
      (retarget?.squatDepth ?? 0) < 0.12 &&
      owner.includes("neutral")
    ) {
      pushFailure(failures, {
        code: "squat_not_detected",
        detail: `Frame ${index} has hip drop ${(retarget?.hipDrop ?? 0).toFixed(2)} but squat depth is not detected.`,
        frameIndex: index,
        severity: "error",
      });
    }
  });

  const hadSquat = frames.some((frame, index) => hasStoredSquat(frame, currentDecisions[index]));
  let maxStandRecoveryHold = 0;
  if (hadSquat) {
    frames.forEach((frame, index) => {
      const currentDecision = currentDecisions[index];
      const retarget = currentDecision?.retarget ?? frame.retarget;
      if (!hasNeutralSource(frame, currentDecision)) return;
      const owner = currentDecision?.lowerOwner ?? lowerOwner(frame);
      const visualRootDrop = retarget?.visualRootDrop ?? 0;
      const plantedIk = retarget?.plantedSquatIkDepth ?? 0;
      const holdAmount = Math.max(visualRootDrop, plantedIk);
      maxStandRecoveryHold = Math.max(maxStandRecoveryHold, holdAmount);

      if (owner.includes("squat") || holdAmount >= 0.18) {
        pushFailure(failures, {
          code: "stand_recovery_missing",
          detail: `Frame ${index} source looks neutral but lower owner is "${owner}" and hold is ${holdAmount.toFixed(2)}.`,
          frameIndex: index,
          severity: "error",
        });
      }
    });
  }

  if (lowerBodyOwnerTransitions / durationSeconds > 1.25 && lowerBodyOwnerTransitions >= 2) {
    pushFailure(failures, {
      code: "lower_body_owner_flicker",
      detail: `Lower-body owner changed ${lowerBodyOwnerTransitions} times in ${durationSeconds.toFixed(2)}s.`,
      severity: "warning",
    });
  }

  if (visualMatchScore < VISUAL_MATCH_REVIEW_THRESHOLD) {
    pushFailure(failures, {
      code: "visual_match_low",
      detail: `Visual match score is ${Math.round(visualMatchScore * 100)}%. Reliable frames ${visualReliableFrameCount}/${frames.length}, motion coverage ${Math.round(visualMotionCoverage * 100)}%.`,
      severity: "warning",
    });
  }

  const finalFailures = compressReplayFailures(failures);
  const summary = {
    ...summarizeMovementDebugReplaySession(session, finalFailures.length),
    lowerBodyOwners: unique(lowerOwners),
  };

  return {
    failures: finalFailures,
    metrics: {
      averageOutOfFrameCount: average(outOfFrameCounts),
      averageAvatarLowerBodyDirectionError,
      averageRetargetQuality: average(retargetQualities),
      avatarVisualFrameCount: avatarDirectionErrors.length,
      lowerBodyOwnerTransitions,
      maxOutOfFrameCount: outOfFrameCounts.length ? Math.max(...outOfFrameCounts) : 0,
      maxStandRecoveryHold,
      ownerTransitionsPerSecond: lowerBodyOwnerTransitions / durationSeconds,
      strongFullBodyFrameCount,
      visualMatchScore,
      visualMotionCoverage,
      visualReliableFrameCount,
    },
    pass: !finalFailures.some((failure) => failure.severity === "error"),
    sessionId: session.id,
    summary,
  };
}

export function analyzeMovementDebugReplaySessions(
  sessions: MovementDebugReplaySession[],
): MovementReplayAnalysis[] {
  return sessions.map(analyzeMovementDebugReplaySession);
}
