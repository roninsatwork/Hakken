#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  DEEP_CAPTURE_TEST_READINESS,
  createCompleteDeepCaptureFrames,
} from "../../src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureTestFixture";
import { buildMovementDenseCaptureFusion } from "../../src/app/(dashboard)/demos/movements/_lib/movementDenseCaptureFusion";
import { buildMovementDeepCaptureHandEvidence } from "../../src/app/(dashboard)/demos/movements/_lib/movementDeepCaptureEvidence";
import { makeMovementAvatarProofPose } from "../../src/app/(dashboard)/demos/movements/_lib/movementAvatarProofFixtures";
import { loadMovementReplayRecording } from "../../src/app/(dashboard)/demos/movements/_lib/movementRecordingReplay";
import { buildMovementRecordingPacket } from "../../src/app/(dashboard)/demos/movements/_lib/saveMovementRecording";
import { validateCompleteReplayGamePacket } from "./run-replay-mounted-game-packet-proof.mjs";

const outArgIndex = process.argv.indexOf("--out");
const outPath = path.resolve(
  outArgIndex >= 0 && process.argv[outArgIndex + 1]
    ? process.argv[outArgIndex + 1]!
    : "tmp/movement-replay-lab/deep-capture-browser-fixture/session.json",
);
const handProofArgIndex = process.argv.indexOf("--hand-proof");
const handProofPath = path.resolve(
  handProofArgIndex >= 0 && process.argv[handProofArgIndex + 1]
    ? process.argv[handProofArgIndex + 1]!
    : "tmp/movement-replay-lab/hand-fallback-browser-proof/report.json",
);
const handProof = JSON.parse(await readFile(handProofPath, "utf8")) as {
  detectorHandedness?: { label?: string; score?: number };
  mappedLandmarks?: Array<{ visibility?: number; x: number; y: number; z?: number }>;
  mappedWorldLandmarks?: Array<{ visibility?: number; x: number; y: number; z?: number }>;
  passed?: boolean;
  refinementInput?: { height: number; width: number };
};
if (
  handProof.passed !== true ||
  handProof.mappedLandmarks?.length !== 21 ||
  handProof.mappedWorldLandmarks?.length !== 21
) {
  throw new Error(`Browser hand proof does not contain complete genuine 21-point evidence: ${handProofPath}`);
}
const leftHandLandmarks = handProof.mappedLandmarks.map((point) => ({
  ...point,
  visibility: point.visibility ?? 1,
  z: point.z ?? 0,
}));
const leftHandWorldLandmarks = handProof.mappedWorldLandmarks.map((point) => ({
  ...point,
  visibility: point.visibility ?? 1,
  z: point.z ?? 0,
}));
const rightHandLandmarks = leftHandLandmarks.map((point) => ({ ...point, x: 1 - point.x }));
const rightHandWorldLandmarks = leftHandWorldLandmarks.map((point) => ({ ...point, x: -point.x }));

const frames = createCompleteDeepCaptureFrames(120).map((frame) => {
  const pose = makeMovementAvatarProofPose("standing");
  frame.landmarks = pose;
  frame.worldLandmarks = pose;
  const capturedAt = frame.capturedAt ?? frame.sourceTimestampMs ?? frame.timestamp ?? 0;
  const sourceTimestampMs = frame.sourceTimestampMs ?? frame.timestamp ?? capturedAt;
  const buildHandEvidence = (
    side: "left" | "right",
    landmarks: typeof leftHandLandmarks,
    worldLandmarks: typeof leftHandWorldLandmarks,
  ) => {
    const evidence = buildMovementDeepCaptureHandEvidence({
      assignment: "detector",
      camera: { frameHeight: 1086, frameWidth: 1448 },
      capturedAt,
      detector: {
        label: side === "left" ? "Left" : "Right",
        score: handProof.detectorHandedness?.score ?? 0.94,
      },
      landmarks,
      side,
      sourceTimestampMs,
      worldLandmarks,
    });
    if (!evidence || Object.keys(evidence.fingerJointAngles ?? {}).length !== 15) {
      throw new Error(`Browser hand geometry did not produce complete ${side} hand evidence.`);
    }
    return {
      ...evidence,
      refinement: {
        inferenceDurationMs: 0,
        inputHeight: handProof.refinementInput?.height ?? 512,
        inputWidth: handProof.refinementInput?.width ?? 512,
        profileId: "movement-deep-capture-refinement-v1" as const,
        source: "native-roi-second-pass" as const,
      },
    };
  };
  frame.hands = {
    left: { landmarks: leftHandLandmarks, worldLandmarks: leftHandWorldLandmarks },
    right: { landmarks: rightHandLandmarks, worldLandmarks: rightHandWorldLandmarks },
  };
  if (frame.deepCapture) {
    frame.deepCapture.hands = {
      left: buildHandEvidence("left", leftHandLandmarks, leftHandWorldLandmarks),
      right: buildHandEvidence("right", rightHandLandmarks, rightHandWorldLandmarks),
    };
  }
  if (frame.deepCapture?.denseBody) {
    frame.deepCapture.denseBody.fusion = buildMovementDenseCaptureFusion({
      anchors: frame.deepCapture.denseBody.anchors,
      poseLandmarks: pose,
      worldPoseLandmarks: pose,
    });
  }
  return frame;
});
const packet = await buildMovementRecordingPacket({
  captureStartReadiness: DEEP_CAPTURE_TEST_READINESS,
  frames,
  requireDeepCapturePacket: true,
});
const recordingId = "deep-capture-browser-fixture";
const replay = await loadMovementReplayRecording({
  _id: recordingId,
  captureFps: 30,
  createdAt: 1_000,
  poseData: JSON.stringify(packet),
  poseDataFormat: "storage-json-v3",
  title: "Deep Capture browser fixture",
});
replay.session.movementId = "px7fmtzet5smehkp94vd56ahcn8atf2g";
const failures = validateCompleteReplayGamePacket(replay.session, {
  requireDeepCapture: true,
});
if (failures.length > 0) {
  throw new Error(`Generated Deep Capture fixture failed preflight: ${failures.join("; ")}`);
}

await mkdir(path.dirname(outPath), { recursive: true });
await writeFile(outPath, `${JSON.stringify(replay.session, null, 2)}\n`);
console.log(`Wrote strict schema-v3 browser fixture (${frames.length} frames) to ${outPath}`);
