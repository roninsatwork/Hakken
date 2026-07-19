import { describe, expect, it } from "vitest";
import type { MovementMotionFrame } from "./movementMotionFrame";
import {
  buildLiveMovementSourceFrame,
  getMovementCameraConfidenceRecoveryCue,
  resolveMovementStartReadiness,
  type MovementStartReadiness,
} from "./movementSourceFrame";
import {
  getMovementSetupRecoveryCue,
  getMovementStartReadinessMessage,
} from "./movementSetupRecoveryCue";
import { buildMovementTruthSkeleton } from "./movementTruthSkeleton";
import type { TrackingLandmark } from "./movementTrackingCalibration";

const makePose = (): TrackingLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  }));

function comfortablePose() {
  const pose = makePose();
  pose[0] = { x: 0.5, y: 0.28, z: 0, visibility: 0.9 };
  pose[7] = { x: 0.42, y: 0.3, z: 0, visibility: 0.9 };
  pose[8] = { x: 0.58, y: 0.3, z: 0, visibility: 0.9 };
  pose[11] = { x: 0.38, y: 0.44, z: 0, visibility: 0.9 };
  pose[12] = { x: 0.62, y: 0.44, z: 0, visibility: 0.9 };
  pose[13] = { x: 0.34, y: 0.56, z: 0, visibility: 0.9 };
  pose[14] = { x: 0.66, y: 0.56, z: 0, visibility: 0.9 };
  pose[15] = { x: 0.32, y: 0.68, z: 0, visibility: 0.9 };
  pose[16] = { x: 0.68, y: 0.68, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.88, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.88, z: 0, visibility: 0.8 };
  pose[29] = { x: 0.43, y: 0.9, z: 0.02, visibility: 0.8 };
  pose[30] = { x: 0.57, y: 0.9, z: 0.02, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.92, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.92, z: 0, visibility: 0.8 };
  return pose;
}

function weakFeetPose() {
  const pose = comfortablePose();
  [27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, visibility: 0.08 };
  });
  return pose;
}

function croppedFeetPose() {
  const pose = comfortablePose();
  [27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, y: 1.02 };
  });
  return pose;
}

function motionFrameFromPose(pose: TrackingLandmark[]) {
  const sourceFrame = buildLiveMovementSourceFrame({
    capturedAt: 1000,
    poseLandmarks: pose,
  });

  return {
    cameraConfidence: sourceFrame.cameraConfidence,
    startReadiness: sourceFrame.startReadiness,
    truthSkeleton: buildMovementTruthSkeleton(sourceFrame),
  } as MovementMotionFrame;
}

describe("movementSetupRecoveryCue", () => {
  it("prioritizes blocked spine setup before camera or truth skeleton cues", () => {
    expect(getMovementSetupRecoveryCue({
      motionFrame: motionFrameFromPose(weakFeetPose()),
      spineReadiness: "blocked",
    })).toBe("Step back until head, shoulders, and hips are visible.");
  });

  it("prioritizes needs-attention spine setup before camera or truth skeleton cues", () => {
    expect(getMovementSetupRecoveryCue({
      motionFrame: motionFrameFromPose(weakFeetPose()),
      spineReadiness: "needs-attention",
    })).toBe("Keep head, shoulders, and hips visible.");
  });

  it("uses camera recovery guidance for genuinely cropped geometry", () => {
    expect(getMovementSetupRecoveryCue({
      motionFrame: motionFrameFromPose(croppedFeetPose()),
      spineReadiness: "ready",
    })).toBe("Step back so your whole body is visible.");
  });

  it("does not turn low-confidence in-frame feet into positioning guidance", () => {
    expect(getMovementSetupRecoveryCue({
      motionFrame: motionFrameFromPose(weakFeetPose()),
      spineReadiness: "ready",
    })).toBeNull();
  });

  it("suppresses confidence-only truth positioning guidance once geometry is ready", () => {
    const motionFrame = motionFrameFromPose(comfortablePose());
    motionFrame.truthSkeleton.segmentConfidence.leftLowerArm = 0.1;
    motionFrame.truthSkeleton.segmentConfidence.leftUpperArm = 0.1;
    motionFrame.truthSkeleton.segmentConfidence.rightLowerArm = 0.1;
    motionFrame.truthSkeleton.segmentConfidence.rightUpperArm = 0.1;

    expect(getMovementSetupRecoveryCue({
      motionFrame,
      spineReadiness: "ready",
    })).toBeNull();
  });

  it("omits guidance when setup is ready", () => {
    expect(getMovementSetupRecoveryCue({
      motionFrame: motionFrameFromPose(comfortablePose()),
      spineReadiness: "ready",
    })).toBeNull();
  });
});

function readinessWith({
  blockedReasons = [],
  promptEvents = [],
}: Partial<Pick<MovementStartReadiness, "blockedReasons" | "promptEvents">>) {
  const sourceFrame = buildLiveMovementSourceFrame({
    capturedAt: 1000,
    poseLandmarks: comfortablePose(),
  });
  const readiness = resolveMovementStartReadiness({
    cameraConfidence: sourceFrame.cameraConfidence,
    requirements: {},
  });

  return {
    ...readiness,
    blockedReasons,
    promptEvents,
  };
}

describe("movementStartReadinessMessage", () => {
  it("prioritizes spine start blockers", () => {
    expect(getMovementStartReadinessMessage({
      blockedReasons: ["spine-blocked"],
      cameraRecoveryCue: getMovementCameraConfidenceRecoveryCue(
        motionFrameFromPose(weakFeetPose()).cameraConfidence,
      ),
      readiness: readinessWith({ promptEvents: ["show-your-feet"] }),
    })).toBe("Line up your spine first.");
  });

  it("uses prompt fallback copy when confidence has no geometry recovery cue", () => {
    expect(getMovementStartReadinessMessage({
      cameraRecoveryCue: getMovementCameraConfidenceRecoveryCue(
        motionFrameFromPose(weakFeetPose()).cameraConfidence,
      ),
      readiness: readinessWith({ promptEvents: ["show-your-feet"] }),
    })).toBe("Show your feet.");
  });

  it.each([
    ["show-your-whole-body", "Show your whole body."],
    ["show-your-feet", "Show your feet."],
    ["show-your-hands", "Show your hands."],
    ["hold-still-for-calibration", "Hold still while the camera gets ready."],
    ["walk-back-into-frame", "Walk back into frame."],
  ] as const)("maps %s prompt events", (promptEvent, message) => {
    expect(getMovementStartReadinessMessage({
      readiness: readinessWith({ promptEvents: [promptEvent] }),
    })).toBe(message);
  });

  it("uses generic visibility copy for unknown blockers", () => {
    expect(getMovementStartReadinessMessage({
      readiness: readinessWith({ blockedReasons: ["leftFoot-missing"] }),
    })).toBe("Move where I can see you.");
  });

  it("uses ready copy when no blockers or prompts are active", () => {
    expect(getMovementStartReadinessMessage({
      readiness: readinessWith({}),
    })).toBe("Get ready.");
  });

  it("handles missing readiness", () => {
    expect(getMovementStartReadinessMessage({
      readiness: null,
    })).toBe("Move where I can see you.");
  });
});
