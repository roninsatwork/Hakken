import { createHash } from "node:crypto";

function stableStringify(value) {
  if (typeof value === "undefined") return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
    .join(",")}}`;
}

function sourceSample(sample) {
  const tracking = sample?.tracking ?? {};
  return {
    bodyConfidence: sample?.bodyConfidence ?? {},
    camera: sample?.camera ?? null,
    capturedAt: sample?.capturedAt ?? null,
    tracking: {
      pose: tracking.pose ?? [],
      worldPose: tracking.worldPose ?? [],
    },
  };
}

/**
 * Returns the immutable human-recording payload used to compare replay runs.
 * Solver decisions, fallbacks, rendered telemetry, and generated verdicts are
 * deliberately excluded: all of them may legitimately change after a code fix.
 */
export function replaySourcePayload(session) {
  return {
    captureStartReadiness: session?.captureStartReadiness ?? null,
    durationMs: session?.durationMs ?? null,
    endedAt: session?.endedAt ?? null,
    fps: session?.fps ?? null,
    id: session?.id ?? null,
    movementId: session?.movementId ?? null,
    samples: Array.isArray(session?.samples) ? session.samples.map(sourceSample) : [],
    startedAt: session?.startedAt ?? null,
  };
}

export function sourceHashForReplaySession(session) {
  return `sha256:${createHash("sha256")
    .update(stableStringify(replaySourcePayload(session)))
    .digest("hex")}`;
}

export function inspectReplayTelemetryFrames({
  frameCount,
  frames,
  hasDebug = (frame) => Boolean(frame?.debug),
  isRendered = (frame) => Boolean(frame?.debug?.avatarVisual),
}) {
  const safeFrameCount = Number.isInteger(frameCount) && frameCount > 0 ? frameCount : 0;
  const sourceFrames = Array.isArray(frames) ? frames : [];
  const expectedIndexes = new Set(Array.from({ length: safeFrameCount }, (_, index) => index));
  const framesByIndex = new Map();
  const invalidFrameEntries = [];

  sourceFrames.forEach((frame, position) => {
    if (!Number.isInteger(frame?.frameIndex)) {
      invalidFrameEntries.push(position);
      return;
    }
    const entries = framesByIndex.get(frame.frameIndex) ?? [];
    entries.push(frame);
    framesByIndex.set(frame.frameIndex, entries);
  });

  const duplicateFrameIndexes = Array.from(framesByIndex.entries())
    .filter(([, entries]) => entries.length > 1)
    .map(([frameIndex]) => frameIndex)
    .sort((left, right) => left - right);
  const unexpectedFrameIndexes = Array.from(framesByIndex.keys())
    .filter((frameIndex) => !expectedIndexes.has(frameIndex))
    .sort((left, right) => left - right);
  const missingFrameIndexes = Array.from(expectedIndexes)
    .filter((frameIndex) => !framesByIndex.has(frameIndex))
    .sort((left, right) => left - right);
  const uniqueExpectedFrames = Array.from(expectedIndexes)
    .map((frameIndex) => framesByIndex.get(frameIndex)?.[0] ?? null)
    .filter(Boolean);
  const missingDebugFrameIndexes = uniqueExpectedFrames
    .filter((frame) => !hasDebug(frame))
    .map((frame) => frame.frameIndex);
  const missingRenderedFrameIndexes = uniqueExpectedFrames
    .filter((frame) => !isRendered(frame))
    .map((frame) => frame.frameIndex);

  return {
    complete: safeFrameCount > 0 &&
      invalidFrameEntries.length === 0 &&
      duplicateFrameIndexes.length === 0 &&
      unexpectedFrameIndexes.length === 0 &&
      missingFrameIndexes.length === 0 &&
      missingDebugFrameIndexes.length === 0 &&
      missingRenderedFrameIndexes.length === 0,
    compared: uniqueExpectedFrames.filter(isRendered).length,
    duplicateFrameIndexes,
    frameCount: safeFrameCount,
    invalidFrameEntries,
    missingDebugFrameIndexes,
    missingFrameIndexes,
    missingRenderedFrameIndexes,
    rendered: uniqueExpectedFrames.filter(isRendered).length,
    unexpectedFrameIndexes,
    uniqueExpectedFrames,
  };
}
