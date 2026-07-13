import type { MovementDebugReplaySession } from "./movementDebugReplay";

function stableStringify(value: unknown): string {
  if (typeof value === "undefined") return "undefined";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;

  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
    .join(",")}}`;
}

function replaySourceSample(sample: MovementDebugReplaySession["samples"][number]) {
  return {
    bodyConfidence: sample.bodyConfidence ?? {},
    camera: sample.camera ?? null,
    capturedAt: sample.capturedAt ?? null,
    tracking: {
      pose: sample.tracking?.pose ?? [],
      worldPose: sample.tracking?.worldPose ?? [],
    },
  };
}

/**
 * Immutable human-recording content used to compare repair runs. Solver output,
 * fallbacks, verdicts, and rendered telemetry are deliberately excluded.
 */
export function replaySourcePayload(session: MovementDebugReplaySession) {
  return {
    captureStartReadiness: session.captureStartReadiness ?? null,
    durationMs: session.durationMs ?? null,
    endedAt: session.endedAt ?? null,
    fps: session.fps ?? null,
    id: session.id ?? null,
    movementId: session.movementId ?? null,
    samples: Array.isArray(session.samples) ? session.samples.map(replaySourceSample) : [],
    startedAt: session.startedAt ?? null,
  };
}

export async function sourceHashForReplaySession(session: MovementDebugReplaySession) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(stableStringify(replaySourcePayload(session))),
  );
  return `sha256:${Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")}`;
}
