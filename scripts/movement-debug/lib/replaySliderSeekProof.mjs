import {
  RENDERED_FIDELITY_POLICY,
  classifyRenderedFidelitySample,
  isRenderedFidelityRepairOutcome,
} from "../../../src/lib/movements/renderedFidelityPolicy.mjs";

const ARM_SEGMENTS = [
  "leftUpperArm",
  "leftLowerArm",
  "rightUpperArm",
  "rightLowerArm",
];

function finiteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function quaternionAngularError(left, right) {
  const leftValues = [left?.x, left?.y, left?.z, left?.w];
  const rightValues = [right?.x, right?.y, right?.z, right?.w];
  if (![...leftValues, ...rightValues].every(Number.isFinite)) return null;
  const leftLength = Math.hypot(...leftValues);
  const rightLength = Math.hypot(...rightValues);
  if (leftLength <= 0.000001 || rightLength <= 0.000001) return null;
  const dot = leftValues.reduce((sum, value, index) => (
    sum + (value / leftLength) * (rightValues[index] / rightLength)
  ), 0);
  return 2 * Math.acos(Math.min(1, Math.max(-1, Math.abs(dot))));
}

function spineTargetError(debug) {
  const spineDrive = debug?.spineDrive;
  if (!spineDrive || spineDrive.owner?.endsWith("-spine-held")) return null;
  const errors = ["spine", "chest", "upperChest"].flatMap((bone) => (
    ["x", "y", "z"].flatMap((axis) => {
      const target = finiteNumber(spineDrive.targetRotations?.[bone]?.[axis]);
      const rendered = finiteNumber(debug.avatarSpine?.[bone]?.[axis]);
      return target === null || rendered === null ? [] : [Math.abs(target - rendered)];
    })
  ));
  return errors.length === 9 ? Math.max(...errors) : null;
}

export function parseReplaySliderSeekFrames(value, frameCount) {
  if (!value || frameCount <= 0) return [];
  return value
    .split(",")
    .map((entry) => Number.parseInt(entry.trim(), 10))
    .filter(Number.isFinite)
    .map((frameIndex) => Math.max(0, Math.min(frameIndex, frameCount - 1)));
}

export function replaySliderTargetRatio(frameIndex, frameCount) {
  if (frameCount <= 1) return 0;
  return Math.max(0, Math.min(frameIndex, frameCount - 1)) / (frameCount - 1);
}

export function buildReplaySliderSeekFidelity(debug) {
  const visualSegments = debug?.avatarVisual?.segments ?? {};
  const samples = ARM_SEGMENTS.map((segment) => {
    const visual = visualSegments[segment];
    const confidence = finiteNumber(visual?.confidence);
    const error = finiteNumber(visual?.sourceError);
    return {
      confidence,
      error,
      outcome: classifyRenderedFidelitySample({
        confidence,
        error,
        hasProof: Boolean(visual),
      }),
      segment,
    };
  });

  const spineError = spineTargetError(debug);
  const spineConfidence = finiteNumber(debug?.spineDrive?.confidence);
  samples.push({
    confidence: spineConfidence,
    error: spineError,
    outcome: classifyRenderedFidelitySample({
      confidence: spineConfidence,
      error: spineError,
      hasProof: spineError !== null,
    }),
    segment: "spine",
  });

  const headError = quaternionAngularError(
    debug?.avatarHead?.targetWorldQuaternion,
    debug?.avatarHead?.appliedWorldQuaternion,
  );
  const headConfidence = finiteNumber(debug?.headRaw?.confidence);
  samples.push({
    confidence: headConfidence,
    error: headError,
    outcome: classifyRenderedFidelitySample({
      confidence: headConfidence,
      error: headError,
      hasProof: headError !== null,
    }),
    segment: "head",
  });

  const repairSamples = samples.filter(({ outcome }) => isRenderedFidelityRepairOutcome(outcome));
  const trustworthySamples = samples.filter(({ confidence, error }) => (
    confidence !== null &&
    confidence >= RENDERED_FIDELITY_POLICY.trustworthyConfidence &&
    error !== null
  ));
  return {
    clean: repairSamples.length === 0 && trustworthySamples.length > 0,
    policy: RENDERED_FIDELITY_POLICY,
    repairSamples,
    samples,
    trustworthySampleCount: trustworthySamples.length,
  };
}

export function replaySliderSeekEventPasses({
  committedFrameIndex,
  fidelity,
  observedFrameIndex,
  playbackPaused,
  requestedFrameIndex,
  sliderValue,
  telemetryRefreshed,
}) {
  return (
    committedFrameIndex === requestedFrameIndex &&
    observedFrameIndex === requestedFrameIndex &&
    sliderValue === requestedFrameIndex &&
    playbackPaused === true &&
    telemetryRefreshed === true &&
    fidelity?.clean === true
  );
}
