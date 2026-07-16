import type { MovementDebugReplaySession } from "../../_lib/movementDebugReplay";
import type {
  MovementReplayAnalysis,
  MovementReplayFailure,
} from "../../_lib/movementReplayAnalyzer";
import type { MovementTrackingDebugState } from "../../_lib/movementTrackingCalibration";
import { RENDERED_FIDELITY_POLICY } from "@/src/lib/movements/renderedFidelityPolicy.mjs";
import {
  AVATAR_FOLLOW_ACTIVE_LEG_ERROR_THRESHOLD,
  AVATAR_FOLLOW_ARM_POSE_ERROR_THRESHOLD,
  AVATAR_FOLLOW_CURRENT_LOWER_REVIEW_THRESHOLD,
  AVATAR_FOLLOW_PLANTED_FOOT_CLEARANCE_THRESHOLD,
  AVATAR_FOLLOW_PLANTED_FOOT_ERROR_THRESHOLD,
  AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD,
  LIVE_HEAD_DAMPING_REVIEW_THRESHOLD,
  LIVE_SPINE_DRIVE_MOTION_THRESHOLD,
  LIVE_UPPER_BODY_REVIEW_THRESHOLD,
  SOURCE_OUT_OF_FRAME_REVIEW_COUNT,
  avatarPlantedFootClearance,
  avatarPlantedFootSide,
  formatAngleDegrees,
  headMotionMagnitude,
  maxAvatarSegmentError,
} from "./replayLabHelpers";

type ReplayFrame = MovementDebugReplaySession["samples"][number];
type GamePathFrame = MovementReplayAnalysis["gamePath"]["frames"][number];
type RootMotionFrame = MovementReplayAnalysis["rootMotion"]["frames"][number];

function maxSpineTargetRotationError(debug: MovementTrackingDebugState | null) {
  const targets = debug?.spineDrive?.targetRotations;
  if (!targets) return undefined;
  const errors = ["spine", "chest", "upperChest"].flatMap((bone) => (
    ["x", "y", "z"].flatMap((axis) => {
      const target = targets[bone as keyof typeof targets]?.[axis as "x" | "y" | "z"];
      const rendered = debug?.avatarSpine?.[bone as keyof NonNullable<typeof debug.avatarSpine>]?.[axis as "x" | "y" | "z"];
      return typeof target === "number" && typeof rendered === "number"
        ? [Math.abs(target - rendered)]
        : [];
    })
  ));
  return errors.length === 9 ? Math.max(...errors) : undefined;
}

export function getReplayLabLiveCurrentFrameFailures({
  armConfidence,
  currentAvatarDebug,
  currentFrame,
  currentFrameActiveLegMotion,
  currentFrameSourceReady,
  currentFrameStationaryFeetFloorSideBend,
  currentFrameUsesSeatedSupport,
  currentGamePathFrame,
  currentRootMotionFrame,
  footConfidence,
  legConfidence,
  replayFeetOwner,
  safeFrameIndex,
  torsoConfidence,
}: {
  armConfidence?: number;
  currentAvatarDebug: MovementTrackingDebugState | null;
  currentFrame?: ReplayFrame;
  currentFrameActiveLegMotion: boolean;
  currentFrameSourceReady: boolean;
  currentFrameStationaryFeetFloorSideBend: boolean;
  currentFrameUsesSeatedSupport: boolean;
  currentGamePathFrame?: GamePathFrame;
  currentRootMotionFrame?: RootMotionFrame;
  footConfidence?: number;
  legConfidence?: number;
  replayFeetOwner?: string;
  safeFrameIndex: number;
  torsoConfidence?: number;
}): MovementReplayFailure[] {
  const failures: MovementReplayFailure[] = [];
  const currentAvatarVisual = currentAvatarDebug?.avatarVisual;
  const currentRetarget = currentAvatarDebug?.retarget;
  const currentSpineDrive = currentAvatarDebug?.spineDrive;
  const upperBodyError = currentAvatarVisual?.averageUpperBodyDirectionError;
  const upperBodySegments = currentAvatarVisual?.comparedUpperBodySegments ?? 0;
  const lowerBodyError = currentAvatarVisual?.averageLowerBodyDirectionError;
  const lowerBodySegments = currentAvatarVisual?.comparedLowerBodySegments ?? 0;
  const outOfFrameCount = currentFrame?.poseBounds?.outOfFrameCount ?? 0;
  const maxY = currentFrame?.poseBounds?.maxY ?? 0;
  const sourceQuality = currentRetarget?.sourceQuality ?? currentFrame?.retarget?.sourceQuality ?? 1;
  const spineDriveMagnitude = Math.max(
    Math.abs(currentSpineDrive?.sideBend ?? 0),
    Math.abs(currentSpineDrive?.forwardLean ?? 0),
  );
  const rawHeadMagnitude = headMotionMagnitude(currentAvatarDebug?.headRaw);
  const appliedHeadMagnitude = headMotionMagnitude(currentAvatarDebug?.headApplied);
  const headDamping = rawHeadMagnitude - appliedHeadMagnitude;
  const armPoseError = maxAvatarSegmentError(currentAvatarVisual, [
    "leftUpperArm",
    "leftLowerArm",
    "rightUpperArm",
    "rightLowerArm",
  ]);
  const footPoseError = maxAvatarSegmentError(currentAvatarVisual, ["leftFoot", "rightFoot"]);
  const spineTargetRotationError = maxSpineTargetRotationError(currentAvatarDebug);
  const usesActiveSpineDrive = currentSpineDrive?.owner?.includes("spine-") ?? false;
  const spinePoseError = typeof spineTargetRotationError === "number"
    ? spineTargetRotationError
    : usesActiveSpineDrive
      ? undefined
      : maxAvatarSegmentError(currentAvatarVisual, ["spine"]);
  const spineFidelityConfidence = usesActiveSpineDrive
    ? currentSpineDrive?.confidence
    : torsoConfidence;
  const semantic = currentAvatarVisual?.semantic;

  if (semantic?.evidenceVersion) {
    if (
      (semantic.torso.confidence ?? 0) >= 0.45 &&
      typeof semantic.torso.sourceError === "number" &&
      semantic.torso.sourceError > RENDERED_FIDELITY_POLICY.passMax
    ) {
      failures.push({
        code: "avatar_spine_angle_diverged",
        detail: `Independent source-to-final torso direction error is ${semantic.torso.sourceError.toFixed(2)}; the rendered-fidelity limit is ${RENDERED_FIDELITY_POLICY.passMax.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: (semantic.torso.confidence ?? 0) >= 0.75 ? "error" : "warning",
      });
    }
    if (
      (semantic.headChain.confidence ?? 0) >= 0.45 &&
      typeof semantic.headChain.sourceError === "number" &&
      semantic.headChain.sourceError > RENDERED_FIDELITY_POLICY.passMax
    ) {
      failures.push({
        code: "avatar_head_alignment_diverged",
        detail: `Independent source-to-final head-chain direction error is ${semantic.headChain.sourceError.toFixed(2)}; the rendered-fidelity limit is ${RENDERED_FIDELITY_POLICY.passMax.toFixed(2)}.`,
        frameIndex: safeFrameIndex,
        severity: (semantic.headChain.confidence ?? 0) >= 0.75 ? "error" : "warning",
      });
    }
    const contactThreshold = typeof semantic.avatarScale === "number"
      ? semantic.avatarScale * RENDERED_FIDELITY_POLICY.contactClearanceMaxAvatarScaleRatio
      : undefined;
    for (const side of ["left", "right"] as const) {
      const foot = semantic.feet[side];
      if (!foot.sourcePlanted) continue;
      const sourceConfidence = foot.sourceConfidence ?? 0;
      if (sourceConfidence < RENDERED_FIDELITY_POLICY.limitedConfidence) continue;
      const contactValues = [
        foot.heelClearance,
        foot.soleClearance,
        foot.toeBaseClearance,
        foot.toeEndClearance,
      ];
      if (
        typeof contactThreshold !== "number" ||
        !contactValues.every((value) => typeof value === "number") ||
        typeof foot.planeAngleRadians !== "number"
      ) {
        failures.push({
          code: "visual_match_low",
          detail: `Independent ${side} planted-foot heel/sole/toe proof is incomplete.`,
          frameIndex: safeFrameIndex,
          severity: currentFrameSourceReady &&
            sourceConfidence >= RENDERED_FIDELITY_POLICY.trustworthyConfidence
            ? "error"
            : "warning",
        });
        continue;
      }
      const maxClearance = Math.max(...contactValues);
      if (
        maxClearance > contactThreshold ||
        Math.abs(foot.planeAngleRadians) > RENDERED_FIDELITY_POLICY.footPlaneMaxRadians
      ) {
        failures.push({
          code: "avatar_planted_foot_diverged",
          detail: `Independent ${side} heel/sole/toe contact is raised ${maxClearance.toFixed(3)} above the floor with foot-plane angle ${foot.planeAngleRadians.toFixed(2)} rad.`,
          frameIndex: safeFrameIndex,
          severity: sourceConfidence >= RENDERED_FIDELITY_POLICY.trustworthyConfidence
            ? "error"
            : "warning",
        });
      }
    }
  }

  if (outOfFrameCount >= SOURCE_OUT_OF_FRAME_REVIEW_COUNT || maxY > 1.08) {
    failures.push({
      code: "source_lower_body_out_of_frame",
      detail: `Current frame has ${outOfFrameCount} landmarks out of frame; review source tracking before trusting avatar alignment.`,
      frameIndex: safeFrameIndex,
      severity: "warning",
    });
  }

  if (
    typeof footConfidence === "number" &&
    typeof legConfidence === "number" &&
    footConfidence < 0.35 &&
    legConfidence >= 0.45
  ) {
    failures.push({
      code: "source_feet_weak",
      detail: `Current frame has leg confidence ${legConfidence.toFixed(2)} but foot confidence ${footConfidence.toFixed(2)}.`,
      frameIndex: safeFrameIndex,
      severity: "warning",
    });
  }

  if (sourceQuality < 0.45) {
    failures.push({
      code: "retarget_quality_drop",
      detail: `Current frame retarget quality is ${sourceQuality.toFixed(2)}.`,
      frameIndex: safeFrameIndex,
      severity: "warning",
    });
  }

  if (
    upperBodySegments >= 3 &&
    typeof upperBodyError === "number" &&
    upperBodyError > LIVE_UPPER_BODY_REVIEW_THRESHOLD
  ) {
    failures.push({
      code: "avatar_arm_pose_diverged",
      detail: `Live avatar upper-body direction error is ${upperBodyError.toFixed(2)} across ${upperBodySegments} segments; the rendered-fidelity limit is ${LIVE_UPPER_BODY_REVIEW_THRESHOLD.toFixed(2)}.`,
      frameIndex: safeFrameIndex,
      severity: currentFrameSourceReady ? "error" : "warning",
    });
  }

  if (
    typeof armPoseError === "number" &&
    typeof armConfidence === "number" &&
    armConfidence >= 0.45 &&
    armPoseError > AVATAR_FOLLOW_ARM_POSE_ERROR_THRESHOLD
  ) {
    failures.push({
      code: "avatar_arm_pose_diverged",
      detail: `Avatar arm pose max segment error is ${armPoseError.toFixed(2)} with source arm confidence ${armConfidence.toFixed(2)}; the rendered-fidelity limit is ${AVATAR_FOLLOW_ARM_POSE_ERROR_THRESHOLD.toFixed(2)}.`,
      frameIndex: safeFrameIndex,
      severity: currentFrameSourceReady && armConfidence >= 0.75 ? "error" : "warning",
    });
  }

  if (usesActiveSpineDrive && typeof spineTargetRotationError !== "number") {
    failures.push({
      code: "spine_vertical_reference_missing",
      detail: "Active spine drive is missing final target-rotation telemetry, so spine fidelity is proof-limited.",
      frameIndex: safeFrameIndex,
      severity: currentFrameSourceReady ? "error" : "warning",
    });
  }

  if (
    currentFrameSourceReady &&
    typeof spineFidelityConfidence === "number" &&
    spineFidelityConfidence >= 0.45 &&
    typeof spinePoseError === "number" &&
    spinePoseError > AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD
  ) {
    failures.push({
      code: "avatar_spine_angle_diverged",
      detail: usesActiveSpineDrive
        ? `Avatar spine target-rotation error is ${spinePoseError.toFixed(2)} rad with source torso confidence ${spineFidelityConfidence.toFixed(2)}; the rendered-fidelity limit is ${AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD.toFixed(2)} rad.`
        : `Avatar spine segment error is ${spinePoseError.toFixed(2)} with source torso confidence ${spineFidelityConfidence.toFixed(2)}; the rendered-fidelity limit is ${AVATAR_FOLLOW_SPINE_ANGLE_ERROR_THRESHOLD.toFixed(2)}.`,
      frameIndex: safeFrameIndex,
      severity: spineFidelityConfidence >= 0.75 ? "error" : "warning",
    });
  }

  if (
    currentSpineDrive?.owner === "recorded-spine-model" &&
    currentAvatarDebug?.headRaw.source === "face" &&
    spineDriveMagnitude >= LIVE_SPINE_DRIVE_MOTION_THRESHOLD &&
    rawHeadMagnitude >= 0.12 &&
    headDamping > LIVE_HEAD_DAMPING_REVIEW_THRESHOLD
  ) {
    failures.push({
      code: "avatar_head_alignment_diverged",
      detail: `Recorded spine motion is visible (bend ${currentSpineDrive.sideBend.toFixed(2)}, lean ${currentSpineDrive.forwardLean.toFixed(2)}) but head motion is damped from ${formatAngleDegrees(rawHeadMagnitude)} to ${formatAngleDegrees(appliedHeadMagnitude)}.`,
      frameIndex: safeFrameIndex,
      severity: currentFrameSourceReady ? "error" : "warning",
    });
  }

  if (
    currentAvatarDebug?.headRaw.source === "pose" &&
    currentAvatarDebug.headRaw.confidence >= 0.75 &&
    Math.abs(currentAvatarDebug.headRaw.yaw) >= 0.65 &&
    Math.abs(currentAvatarDebug.headApplied.yaw) < 0.08
  ) {
    failures.push({
      code: "avatar_head_alignment_diverged",
      detail: `Recorded pose head yaw is strong (${formatAngleDegrees(currentAvatarDebug.headRaw.yaw)}) but avatar applied yaw is nearly neutral (${formatAngleDegrees(currentAvatarDebug.headApplied.yaw)}).`,
      frameIndex: safeFrameIndex,
      severity: currentFrameSourceReady ? "error" : "warning",
    });
  }

  if (
    currentAvatarDebug?.headRaw.source === "pose" &&
    currentAvatarDebug.headRaw.confidence >= 0.75 &&
    Math.abs(currentAvatarDebug.headRaw.yaw) >= 0.35 &&
    Math.sign(currentAvatarDebug.headRaw.yaw) !== Math.sign(currentAvatarDebug.headApplied.yaw) &&
    Math.abs(currentAvatarDebug.headApplied.yaw) >= 0.08
  ) {
    failures.push({
      code: "avatar_head_alignment_diverged",
      detail: `Recorded pose head yaw and avatar applied yaw point in opposite directions (${formatAngleDegrees(currentAvatarDebug.headRaw.yaw)} vs ${formatAngleDegrees(currentAvatarDebug.headApplied.yaw)}).`,
      frameIndex: safeFrameIndex,
      severity: currentFrameSourceReady ? "error" : "warning",
    });
  }

  const plantedFootClearance = avatarPlantedFootClearance(
    currentAvatarVisual,
    avatarPlantedFootSide(
      currentRootMotionFrame?.intent.plantedFoot,
      currentAvatarDebug?.avatarLegRaise?.side,
    ),
  );

  if (
    currentFrameSourceReady &&
    currentGamePathFrame?.supportIntentKey === "feet-floor" &&
    typeof footPoseError === "number" &&
    footPoseError > AVATAR_FOLLOW_PLANTED_FOOT_ERROR_THRESHOLD &&
    (
      !currentFrameStationaryFeetFloorSideBend ||
      typeof plantedFootClearance !== "number" ||
      plantedFootClearance > AVATAR_FOLLOW_PLANTED_FOOT_CLEARANCE_THRESHOLD
    )
  ) {
    failures.push({
      code: "avatar_planted_foot_diverged",
      detail: `Avatar planted-foot segment error is ${footPoseError.toFixed(2)} while source support is feet-floor.`,
      frameIndex: safeFrameIndex,
      severity: "error",
    });
  }

  if (
    currentFrameSourceReady &&
    currentGamePathFrame?.supportIntentKey === "feet-floor" &&
    typeof plantedFootClearance === "number" &&
    plantedFootClearance > AVATAR_FOLLOW_PLANTED_FOOT_CLEARANCE_THRESHOLD
  ) {
    failures.push({
      code: "avatar_planted_foot_diverged",
      detail: `Avatar planted foot is ${plantedFootClearance.toFixed(2)} above the floor while source support is feet-floor.`,
      frameIndex: safeFrameIndex,
      severity: "error",
    });
  }

  if (
    currentFrameSourceReady &&
    currentGamePathFrame?.supportIntentKey === "feet-floor" &&
    currentFrameActiveLegMotion &&
    lowerBodySegments < 4 &&
    typeof replayFeetOwner === "string" &&
    replayFeetOwner.startsWith("recorded")
  ) {
    failures.push({
      code: "avatar_planted_foot_diverged",
      detail: `Source has active leg motion on feet-floor support, but Replay Lab reports feet owner as ${replayFeetOwner} instead of a planted/locked support owner.`,
      frameIndex: safeFrameIndex,
      severity: "error",
    });
  }

  const activeLegVisualDiverged = Boolean(
    currentFrameSourceReady &&
      currentFrameActiveLegMotion &&
      lowerBodySegments >= 4 &&
      typeof lowerBodyError === "number" &&
      lowerBodyError > AVATAR_FOLLOW_ACTIVE_LEG_ERROR_THRESHOLD,
  );

  if (activeLegVisualDiverged) {
    failures.push({
      code: "avatar_output_diverged",
      detail: `Current frame has active leg motion but rendered avatar lower-body direction error is ${lowerBodyError?.toFixed(2)}.`,
      frameIndex: safeFrameIndex,
      semanticCode: "leg-lift-missing",
      severity: "error",
    });
  } else if (
    lowerBodySegments >= 4 &&
    typeof lowerBodyError === "number" &&
    lowerBodyError > AVATAR_FOLLOW_CURRENT_LOWER_REVIEW_THRESHOLD
  ) {
    failures.push({
      code: "avatar_output_diverged",
      detail: `Live avatar lower-body direction error is ${lowerBodyError.toFixed(2)} across ${lowerBodySegments} segments.`,
      frameIndex: safeFrameIndex,
      severity: "warning",
    });
  }

  if (currentFrameSourceReady && currentFrameActiveLegMotion && currentFrameUsesSeatedSupport) {
    failures.push({
      code: "avatar_output_diverged",
      detail: `Source is ready with active leg motion, but avatar support is seated (${currentGamePathFrame?.supportIntentLabel ?? "unknown"} · ${currentGamePathFrame?.supportPresentationOwner ?? "unknown"}).`,
      frameIndex: safeFrameIndex,
      semanticCode: "movement-visible-but-unscored",
      severity: "error",
    });
  }

  if (currentFrameActiveLegMotion && lowerBodySegments === 0 && currentAvatarVisual) {
    failures.push({
      code: "avatar_output_diverged",
      detail: "Current frame has active leg motion but no comparable rendered avatar lower-body segments.",
      frameIndex: safeFrameIndex,
      semanticCode: "leg-lift-missing",
      severity: "warning",
    });
  }

  return failures;
}
