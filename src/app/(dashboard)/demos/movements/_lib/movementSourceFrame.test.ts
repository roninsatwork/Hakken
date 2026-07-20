import { describe, expect, it } from "vitest";
import type { MovementDebugReplayFrame } from "./movementDebugReplay";
import {
  buildLiveMovementSourceFrame,
  buildRecordedMovementSourceFrame,
  buildSyntheticMovementSourceFrame,
  getMovementCameraConfidenceRecoveryCue,
  resolveMovementCameraConfidence,
  resolveMovementStartGateDecision,
  resolveMovementStartReadiness,
  resolveMovementStrictWholeBodyVisibility,
} from "./movementSourceFrame";
import type { TrackingLandmark } from "./movementTrackingCalibration";

const makePose = (): TrackingLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.45 + index * 0.002,
    y: 0.45,
    z: 0,
    visibility: 0.9,
  }));

function withCorePose() {
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
  pose[17] = { x: 0.31, y: 0.69, z: 0, visibility: 0.9 };
  pose[18] = { x: 0.69, y: 0.69, z: 0, visibility: 0.9 };
  pose[19] = { x: 0.3, y: 0.7, z: 0, visibility: 0.9 };
  pose[20] = { x: 0.7, y: 0.7, z: 0, visibility: 0.9 };
  pose[21] = { x: 0.3, y: 0.7, z: 0, visibility: 0.9 };
  pose[22] = { x: 0.7, y: 0.7, z: 0, visibility: 0.9 };
  pose[23] = { x: 0.42, y: 0.68, z: 0, visibility: 0.9 };
  pose[24] = { x: 0.58, y: 0.68, z: 0, visibility: 0.9 };
  pose[25] = { x: 0.44, y: 0.82, z: 0, visibility: 0.85 };
  pose[26] = { x: 0.56, y: 0.82, z: 0, visibility: 0.85 };
  pose[27] = { x: 0.44, y: 0.94, z: 0, visibility: 0.8 };
  pose[28] = { x: 0.56, y: 0.94, z: 0, visibility: 0.8 };
  pose[29] = { x: 0.43, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[30] = { x: 0.57, y: 0.95, z: 0.02, visibility: 0.8 };
  pose[31] = { x: 0.43, y: 0.97, z: 0, visibility: 0.8 };
  pose[32] = { x: 0.57, y: 0.97, z: 0, visibility: 0.8 };
  return pose;
}

function squatPose() {
  const pose = withCorePose();
  pose[23] = { ...pose[23]!, y: 0.8 };
  pose[24] = { ...pose[24]!, y: 0.8 };
  pose[25] = { ...pose[25]!, y: 0.73 };
  pose[26] = { ...pose[26]!, y: 0.73 };
  return pose;
}

function sideBendPose() {
  const pose = withCorePose();
  pose[0] = { ...pose[0]!, x: 0.66 };
  pose[7] = { ...pose[7]!, x: 0.62 };
  pose[8] = { ...pose[8]!, x: 0.7 };
  pose[11] = { ...pose[11]!, x: 0.54 };
  pose[12] = { ...pose[12]!, x: 0.76 };
  return pose;
}

function legRaisePose() {
  const pose = withCorePose();
  pose[25] = { ...pose[25]!, y: 0.54 };
  pose[27] = { ...pose[27]!, y: 0.67 };
  pose[29] = { ...pose[29]!, y: 0.69 };
  pose[31] = { ...pose[31]!, y: 0.69 };
  return pose;
}

function weakFeetPose() {
  const pose = withCorePose();
  [27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, visibility: 0.08 };
  });
  return pose;
}

function comfortableCameraPose() {
  const pose = withCorePose();
  [27, 28].forEach((index) => {
    pose[index] = { ...pose[index]!, y: 0.88 };
  });
  [29, 30].forEach((index) => {
    pose[index] = { ...pose[index]!, y: 0.9 };
  });
  [31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, y: 0.92 };
  });
  return pose;
}

function weakHeadPose() {
  const pose = comfortableCameraPose();
  [0, 7, 8].forEach((index) => {
    pose[index] = { ...pose[index]!, visibility: 0.08 };
  });
  return pose;
}

function croppedFeetPose() {
  const pose = withCorePose();
  [31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, y: 0.99 };
  });
  return pose;
}

function farCameraPose() {
  return withCorePose().map((landmark) => ({
    ...landmark,
    y: 0.48 + (landmark.y - 0.48) * 0.3,
  }));
}

function replayFrame(pose: TrackingLandmark[]): MovementDebugReplayFrame {
  return {
    bodyConfidence: {},
    capturedAt: 1234,
    fallbacks: {},
    tracking: {
      pose,
      worldPose: pose,
    },
  };
}

describe("movement source frame contracts", () => {
  it("represents live, recorded, and synthetic frames with the same source shape", () => {
    [withCorePose(), squatPose(), sideBendPose(), legRaisePose()].forEach((pose) => {
      const live = buildLiveMovementSourceFrame({ capturedAt: 1, poseLandmarks: pose });
      const recorded = buildRecordedMovementSourceFrame(replayFrame(pose), {
        movementId: "movement-1",
        sessionId: "session-1",
      });
      const synthetic = buildSyntheticMovementSourceFrame({
        blendshapes: [{ categoryName: "mouthSmileLeft", score: 0.7 }],
        capturedAt: 2,
        poseLandmarks: pose,
      });

      expect(live.sourceOrigin).toBe("live-webcam");
      expect(recorded.sourceOrigin).toBe("recorded-replay");
      expect(synthetic.sourceOrigin).toBe("synthetic-proof");
      expect(live.landmarks.pose).toHaveLength(33);
      expect(recorded.landmarks.pose).toHaveLength(33);
      expect(synthetic.landmarks.pose).toHaveLength(33);
      expect(recorded.movementId).toBe("movement-1");
      expect(recorded.sessionId).toBe("session-1");
      expect(synthetic.landmarks.blendshapes).toEqual([
        { categoryName: "mouthSmileLeft", score: 0.7 },
      ]);
      expect(live.cameraConfidence.scoreAllowed).toBe(true);
      expect(recorded.cameraConfidence.scoreAllowed).toBe(true);
      expect(synthetic.cameraConfidence.scoreAllowed).toBe(true);
    });
  });

  it("snapshots source payloads so later adapter mutation cannot rewrite source truth", () => {
    const pose = comfortableCameraPose();
    const worldPose = pose.map((landmark) => ({ ...landmark, z: (landmark.z ?? 0) + 0.1 }));
    const hands = {
      left: { landmarks: [{ x: 0.2, y: 0.3, z: 0.1, visibility: 0.8 }] },
    };
    const blendshapes = [{ categoryName: "mouthSmileLeft", score: 0.7 }];
    const sourceFrame = buildLiveMovementSourceFrame({
      blendshapes,
      capturedAt: 1200,
      hands,
      poseLandmarks: pose,
      worldPoseLandmarks: worldPose,
    });

    pose[0] = { x: 0.99, y: 0.99, z: 0.99, visibility: 0.01 };
    worldPose[0] = { x: 0.88, y: 0.88, z: 0.88, visibility: 0.02 };
    hands.left!.landmarks![0] = { x: 0.77, y: 0.77, z: 0.77, visibility: 0.03 };
    blendshapes[0] = { categoryName: "jawOpen", score: 1 };

    expect(sourceFrame.landmarks.pose).not.toBe(pose);
    expect(sourceFrame.landmarks.worldPose).not.toBe(worldPose);
    expect(sourceFrame.landmarks.hands).not.toBe(hands);
    expect(sourceFrame.landmarks.blendshapes).not.toBe(blendshapes);
    expect(sourceFrame.landmarks.pose[0]).toMatchObject({ x: 0.5, y: 0.28, visibility: 0.9 });
    expect(sourceFrame.landmarks.worldPose[0]).toMatchObject({ x: 0.5, y: 0.28, z: 0.1 });
    expect(sourceFrame.landmarks.hands?.left?.landmarks?.[0]).toMatchObject({
      x: 0.2,
      y: 0.3,
      z: 0.1,
      visibility: 0.8,
    });
    expect(sourceFrame.landmarks.blendshapes).toEqual([
      { categoryName: "mouthSmileLeft", score: 0.7 },
    ]);
  });

  it("keeps low-confidence feet honest without treating in-frame coordinates as cropping", () => {
    const pose = weakFeetPose();
    const confidence = resolveMovementCameraConfidence({
      capturedAt: 2000,
      poseLandmarks: pose,
    });
    const fullBodyReadiness = resolveMovementStartReadiness({
      cameraConfidence: confidence,
      poseLandmarks: pose,
      requirements: { mode: "full-body" },
    });
    const upperBodyReadiness = resolveMovementStartReadiness({
      cameraConfidence: confidence,
      poseLandmarks: pose,
      requirements: { mode: "upper-body" },
    });

    expect(confidence.state).toBe("partial");
    expect(confidence.scoreAllowed).toBe(true);
    expect(confidence.reasons).toContain("feet-weak");
    expect(confidence.messageEvents).not.toContain("show-your-feet");
    expect(fullBodyReadiness.state).toBe("ready");
    expect(fullBodyReadiness.canStartGame).toBe(true);
    expect(fullBodyReadiness.visibleBodyParts).toContain("leftFoot");
    expect(fullBodyReadiness.visibleBodyParts).toContain("rightFoot");
    expect(upperBodyReadiness.state).toBe("ready");
    expect(upperBodyReadiness.canStartGame).toBe(true);
  });

  it("strict whole-body visibility rejects hallucinated in-frame lower-body guesses", () => {
    const seatedPose = withCorePose();
    // Seated player: the pose model keeps guessing in-frame leg/foot positions
    // but marks them with low visibility confidence.
    for (const index of [25, 26, 27, 28, 29, 30, 31, 32]) {
      seatedPose[index] = { ...seatedPose[index]!, visibility: 0.2 };
    }

    const seated = resolveMovementStrictWholeBodyVisibility(seatedPose);
    expect(seated.wholeBodyVisible).toBe(false);
    expect(seated.missingBodyParts).toEqual(
      expect.arrayContaining(["leftLeg", "rightLeg", "leftFoot", "rightFoot"]),
    );

    const standing = resolveMovementStrictWholeBodyVisibility(withCorePose());
    expect(standing.wholeBodyVisible).toBe(true);
    expect(standing.missingBodyParts).toEqual([]);

    const missingFrame = resolveMovementStrictWholeBodyVisibility(null);
    expect(missingFrame.wholeBodyVisible).toBe(false);
  });

  it("still blocks genuinely cropped lower-body coordinates", () => {
    const pose = croppedFeetPose();
    const confidence = resolveMovementCameraConfidence({
      capturedAt: 2025,
      poseLandmarks: pose,
    });
    const readiness = resolveMovementStartReadiness({
      cameraConfidence: confidence,
      poseLandmarks: pose,
      requirements: { mode: "full-body" },
    });

    expect(confidence.messageEvents).toContain("step-back");
    expect(readiness.state).toBe("blocked");
    expect(readiness.canStartGame).toBe(false);
    expect(readiness.visibleBodyParts).not.toContain("leftFoot");
    expect(readiness.visibleBodyParts).not.toContain("rightFoot");
    expect(readiness.promptEvents).toContain("show-your-feet");
  });

  it("lets complete in-frame image/world structure start despite weak distal confidence", () => {
    const pose = withCorePose().map((landmark, index) => ({
      ...landmark,
      visibility: [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 23, 24].includes(index)
        ? 0.9
        : 0.05,
    }));
    const frame = buildLiveMovementSourceFrame({
      capturedAt: 2050,
      poseLandmarks: pose,
      requirements: { mode: "full-body" },
      worldPoseLandmarks: pose.map((landmark) => ({ ...landmark })),
    });

    expect(frame.cameraConfidence.state).toBe("uncertain");
    expect(frame.startReadiness.state).toBe("ready");
    expect(frame.startReadiness.canStartRecording).toBe(true);
    expect(frame.startReadiness.canStartGame).toBe(true);
    expect(resolveMovementStartGateDecision({
      readiness: frame.startReadiness,
      target: "recording",
    }).canStart).toBe(true);
    expect(resolveMovementStartGateDecision({
      readiness: frame.startReadiness,
      target: "game",
    }).canStart).toBe(true);
  });

  it("returns camera recovery cues for weak, cropped, and distant frames", () => {
    expect(getMovementCameraConfidenceRecoveryCue(resolveMovementCameraConfidence({
      capturedAt: 2100,
      poseLandmarks: comfortableCameraPose(),
    }))).toBeNull();
    expect(getMovementCameraConfidenceRecoveryCue(resolveMovementCameraConfidence({
      capturedAt: 2200,
      poseLandmarks: weakFeetPose(),
    }))).toBeNull();
    expect(getMovementCameraConfidenceRecoveryCue(resolveMovementCameraConfidence({
      capturedAt: 2300,
      poseLandmarks: croppedFeetPose(),
    }))).toMatchObject({
      event: "step-back",
      message: "Step back so your whole body is visible.",
    });
    expect(getMovementCameraConfidenceRecoveryCue(resolveMovementCameraConfidence({
      capturedAt: 2400,
      poseLandmarks: farCameraPose(),
    }))).toMatchObject({
      event: "step-closer",
      message: "Step closer so movement stays readable.",
    });
    expect(getMovementCameraConfidenceRecoveryCue(resolveMovementCameraConfidence({
      capturedAt: 2500,
      poseLandmarks: weakHeadPose(),
    }))).toMatchObject({
      message: "Keep head, shoulders, and hips in view.",
      state: "uncertain",
    });
  });

  it("blocks start during countdown and calibration without marking the source lost", () => {
    const frame = buildLiveMovementSourceFrame({
      capturedAt: 3000,
      poseLandmarks: withCorePose(),
      requirements: {
        calibrationQuality: 0.4,
        countdownMsRemaining: 1800,
      },
    });
    const afterCountdown = resolveMovementStartReadiness({
      cameraConfidence: frame.cameraConfidence,
      requirements: { calibrationQuality: 0.4 },
    });

    expect(frame.cameraConfidence.state).toBe("ready");
    expect(frame.startReadiness.state).toBe("countdown");
    expect(frame.startReadiness.promptEvents).toContain("get-ready");
    expect(afterCountdown.state).toBe("calibrating");
    expect(afterCountdown.promptEvents).toContain("hold-still-for-calibration");
  });

  it("resolves target-specific start gate decisions from one readiness policy", () => {
    const ready = resolveMovementStartReadiness({
      cameraConfidence: resolveMovementCameraConfidence({
        capturedAt: 3100,
        poseLandmarks: withCorePose(),
      }),
    });
    const countdown = resolveMovementStartReadiness({
      cameraConfidence: resolveMovementCameraConfidence({
        capturedAt: 3200,
        poseLandmarks: withCorePose(),
      }),
      requirements: { countdownMsRemaining: 1500 },
    });

    expect(resolveMovementStartGateDecision({
      readiness: ready,
      target: "game",
    })).toMatchObject({
      canStart: true,
      state: "ready",
      target: "game",
    });
    expect(resolveMovementStartGateDecision({
      readiness: ready,
      spineReadinessStatus: "needs-attention",
      target: "game",
    })).toMatchObject({
      blockedReasons: ["spine-needs-attention"],
      canStart: false,
      promptEvents: ["hold-still-for-calibration"],
      state: "blocked",
      target: "game",
    });
    expect(resolveMovementStartGateDecision({
      readiness: ready,
      spineReadinessStatus: "blocked",
      target: "game",
    })).toMatchObject({
      blockedReasons: ["spine-blocked"],
      canStart: false,
      promptEvents: ["hold-still-for-calibration"],
      state: "blocked",
      target: "game",
    });
    expect(resolveMovementStartGateDecision({
      readiness: ready,
      spineReadinessStatus: "needs-attention",
      target: "recording",
    })).toMatchObject({
      canStart: true,
      state: "ready",
      target: "recording",
    });
    expect(resolveMovementStartGateDecision({
      readiness: ready,
      target: "recording",
    })).toMatchObject({
      canStart: true,
      state: "ready",
      target: "recording",
    });
    expect(resolveMovementStartGateDecision({
      readiness: countdown,
      target: "game",
    })).toMatchObject({
      canStart: false,
      state: "countdown",
      target: "game",
    });
    expect(resolveMovementStartGateDecision({
      readiness: null,
      target: "recording",
    })).toMatchObject({
      blockedReasons: ["readiness-missing"],
      canStart: false,
      state: "missing-readiness",
      target: "recording",
    });
  });

  it("marks stale or missing source frames as unscoreable camera loss", () => {
    const stale = resolveMovementCameraConfidence({
      capturedAt: 2000,
      poseLandmarks: withCorePose(),
      previousCapturedAt: 1000,
      staleAfterMs: 400,
    });
    const missing = resolveMovementCameraConfidence({
      capturedAt: 2000,
      poseLandmarks: [],
    });

    expect(stale.state).toBe("lost");
    expect(stale.scoreAllowed).toBe(false);
    expect(stale.reasons).toContain("tracking-stale");
    expect(missing.state).toBe("lost");
    expect(missing.messageEvents).toContain("move-where-i-can-see-you");
  });
});
