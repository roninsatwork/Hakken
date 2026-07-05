import { describe, expect, it } from "vitest";
import {
  parseMovementDebugReplaySessions,
  summarizeMovementDebugReplaySession,
  type MovementDebugReplayFrame,
  type MovementDebugReplaySession,
} from "./movementDebugReplay";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementReplaySessionFromRecording } from "./movementRecordingReplay";
import { resolveMovementGameplayEventFrameSummary } from "./movementGameplayEvents";
import { analyzeMovementDebugReplaySession } from "./movementReplayAnalyzer";
import {
  buildMovementRecordedProofManifest,
  summarizeMovementRecordedProofGate,
} from "./movementRecordedProofManifest";
import type { MovementStartReadiness } from "./movementSourceFrame";
import type { TrackingLandmark } from "./movementTrackingCalibration";

const captureStartReadiness: MovementStartReadiness = {
  blockedReasons: [],
  calibrationQuality: 0.91,
  canStartGame: true,
  canStartRecording: true,
  countdownMsRemaining: 0,
  promptEvents: [],
  requiredBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
  state: "ready",
  visibleBodyParts: ["head", "torso", "leftFoot", "rightFoot"],
};

const blockedCaptureStartReadiness: MovementStartReadiness = {
  ...captureStartReadiness,
  blockedReasons: ["leftFoot-missing"],
  canStartGame: false,
  canStartRecording: false,
  promptEvents: ["show-your-whole-body", "show-your-feet"],
  state: "blocked",
  visibleBodyParts: ["head", "torso", "rightFoot"],
};

function frame(overrides: Partial<MovementDebugReplayFrame> = {}): MovementDebugReplayFrame {
  return {
    bodyConfidence: {
      head: 0.98,
      hips: 0.98,
      leftFoot: 0.92,
      leftKnee: 0.95,
      rightFoot: 0.92,
      rightKnee: 0.95,
      torso: 0.98,
    },
    capturedAt: 1000,
    fallbacks: {
      lowerBody: "neutral",
      owners: "head player-calibrated; torso player-spine-model; lower neutral; feet neutral",
      retarget: "q0.90 s0.00 hip0.00 knee 0.00/0.00 feet --",
    },
    poseBounds: {
      maxX: 0.65,
      maxY: 0.95,
      minX: 0.35,
      minY: 0.1,
      outOfFrameCount: 0,
    },
    retarget: {
      appliedLowerBody: 0,
      appliedUpperBody: 0,
      hipDrop: 0,
      leftFootContact: false,
      leftKneeLift: 0,
      plantedSquatIkDepth: 0,
      rightFootContact: false,
      rightKneeLift: 0,
      sourceQuality: 0.9,
      squatDepth: 0,
      totalLowerBody: 6,
      totalUpperBody: 5,
      totalSegments: 11,
      visualRootDrop: 0,
    },
    tracking: {
      pose: [],
      worldPose: [],
    },
    ...overrides,
  };
}

function session(samples: MovementDebugReplayFrame[]): MovementDebugReplaySession {
  return {
    baselineSummary: "full-body-auto-baseline:4",
    durationMs: 1600,
    endedAt: 2600,
    id: "session-1",
    movementId: "movement-1",
    sampleCount: samples.length,
    samples,
    startedAt: 1000,
    trigger: "debug-auto-baseline",
    warningSummary: "none",
  };
}

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

function scalePoseInFrame(
  pose: TrackingLandmark[],
  scale: number,
  origin = { x: 0.5, y: 0.28, z: 0 },
) {
  return pose.map((landmark) => ({
    ...landmark,
    x: origin.x + (landmark.x - origin.x) * scale,
    y: origin.y + (landmark.y - origin.y) * scale,
    z: origin.z + ((landmark.z ?? 0) - origin.z) * scale,
  }));
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
  [0, 7, 8, 11, 12, 13, 14, 15, 16].forEach((index) => {
    pose[index] = { ...pose[index]!, x: pose[index]!.x + 0.12 };
  });
  return pose;
}

function withWeakFeetPose() {
  const pose = withCorePose();
  [27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, visibility: 0.05 };
  });
  return pose;
}

function withLostTrackingPose() {
  return withCorePose().map((landmark) => ({
    ...landmark,
    visibility: 0.05,
  }));
}

function trackingFrame(pose: TrackingLandmark[]) {
  return frame({
    tracking: {
      pose,
      worldPose: pose,
    },
  });
}

function worldTurnPose(yaw: number, offset = { x: 0, z: 0 }) {
  const pose = withCorePose().map((landmark) => ({ ...landmark }));
  const sideX = Math.cos(yaw);
  const sideZ = Math.sin(yaw);
  const shoulderHalfWidth = 0.12;
  const hipHalfWidth = 0.08;

  pose[11] = { x: offset.x - sideX * shoulderHalfWidth, y: 0.44, z: offset.z - sideZ * shoulderHalfWidth, visibility: 0.95 };
  pose[12] = { x: offset.x + sideX * shoulderHalfWidth, y: 0.44, z: offset.z + sideZ * shoulderHalfWidth, visibility: 0.95 };
  pose[23] = { x: offset.x - sideX * hipHalfWidth, y: 0.68, z: offset.z - sideZ * hipHalfWidth, visibility: 0.95 };
  pose[24] = { x: offset.x + sideX * hipHalfWidth, y: 0.68, z: offset.z + sideZ * hipHalfWidth, visibility: 0.95 };
  pose[27] = { x: offset.x - sideX * hipHalfWidth, y: 0.94, z: offset.z + 0.04, visibility: 0.9 };
  pose[28] = { x: offset.x + sideX * hipHalfWidth, y: 0.94, z: offset.z + 0.04, visibility: 0.9 };
  pose[29] = { x: offset.x - sideX * hipHalfWidth, y: 0.95, z: offset.z - 0.02, visibility: 0.9 };
  pose[30] = { x: offset.x + sideX * hipHalfWidth, y: 0.95, z: offset.z - 0.02, visibility: 0.9 };
  pose[31] = { x: offset.x - sideX * hipHalfWidth, y: 0.97, z: offset.z + 0.12, visibility: 0.9 };
  pose[32] = { x: offset.x + sideX * hipHalfWidth, y: 0.97, z: offset.z + 0.12, visibility: 0.9 };

  return pose;
}

describe("movement debug replay parsing", () => {
  it("parses Convex data rows with samplesJson into replay sessions", () => {
    const sessions = parseMovementDebugReplaySessions([
      {
        _id: "abc",
        baselineSummary: "full-body-auto-baseline:2",
        captureStartReadiness,
        durationMs: 900,
        endedAt: 1900,
        movementId: "movement-1",
        sampleCount: 1,
        samplesJson: JSON.stringify([
          frame({
            avatarVisual: {
              averageLowerBodyDirectionError: 0.12,
              comparedLowerBodySegments: 6,
              segments: {
                leftThigh: {
                  direction: { x: 0, y: -1, z: 0 },
                  length: 0.4,
                  sourceDirection: { x: 0, y: -1, z: 0 },
                  sourceError: 0.12,
                },
              },
            },
            startReadiness: captureStartReadiness,
            camera: {
              aspectRatio: 4 / 3,
              trackHeight: 960,
              trackWidth: 1280,
              videoHeight: 960,
              videoWidth: 1280,
            },
          }),
        ]),
        startedAt: 1000,
        trigger: "debug-auto-baseline",
        warningSummary: "none",
      },
    ]);

    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.id).toBe("abc");
    expect(sessions[0]?.captureStartReadiness).toEqual(captureStartReadiness);
    expect(sessions[0]?.samples[0]?.startReadiness).toEqual(captureStartReadiness);
    expect(sessions[0]?.samples[0]?.avatarVisual?.comparedLowerBodySegments).toBe(6);
    expect(sessions[0]?.samples[0]?.camera?.trackWidth).toBe(1280);

    const summary = summarizeMovementDebugReplaySession(sessions[0]!);
    expect(summary.cameraModes).toEqual(["1280x960 ar1.33"]);
    expect(summary.averageRetargetQuality).toBeCloseTo(0.9);
  });

  it("converts full movement recording frames into replay sessions", () => {
    const pose = Array.from({ length: 33 }, (_, index) => ({
      x: 0.4 + index * 0.002,
      y: 0.2 + index * 0.01,
      z: 0,
      visibility: 0.9,
    }));
    const sessionFromRecording = buildMovementReplaySessionFromRecording(
      {
        _id: "movement-recording-1",
        createdAt: 1000,
        durationMs: 66,
        poseData: "[]",
        title: "Full squat recording",
      },
      [
        { timestamp: 0, landmarks: pose, worldLandmarks: pose },
        { timestamp: 33, landmarks: pose, worldLandmarks: pose },
      ],
      30,
      {
        captureStartReadiness,
      },
    );

    expect(sessionFromRecording.id).toBe("movement-recording-1");
    expect(sessionFromRecording.captureStartReadiness).toEqual(captureStartReadiness);
    expect(sessionFromRecording.trigger).toBe("saved-movement-recording");
    expect(sessionFromRecording.sampleCount).toBe(2);
    expect(sessionFromRecording.samples[0]?.tracking.pose).toHaveLength(33);
    expect(sessionFromRecording.samples[0]?.poseBounds?.outOfFrameCount).toBe(0);
  });
});

describe("movement replay analyzer", () => {
  it("exposes simulated game-path frames for replay/game parity checks", () => {
    const neutralPose = withCorePose();
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(neutralPose),
      trackingFrame(scalePoseInFrame(neutralPose, 0.68)),
      trackingFrame(scalePoseInFrame(squatPose(), 0.68)),
    ]));

    expect(analysis.gamePath.calibrationQuality).toBeGreaterThan(0.8);
    expect(analysis.gamePath.retargetSourceQuality).toBeGreaterThan(0.8);
    expect(analysis.gamePath.parity.divergenceFrameCount).toBe(1);
    expect(analysis.gamePath.parity.wrapperDivergenceFrameCount).toBe(0);
    expect(analysis.gamePath.wrapperFrames).toHaveLength(3);
    expect(analysis.gamePath.gameplayEvents).toHaveLength(3);
    expect(analysis.gamePath.sourceFrames).toHaveLength(3);
    expect(analysis.gamePath.sourceFrames[0]).toMatchObject({
      cameraState: "ready",
      scoreAllowed: true,
      sourceOrigin: "recorded-replay",
      sourceStatus: "decoded",
      startReadinessState: "ready",
    });
    expect(analysis.metrics.cameraConfidenceReadyFrameCount).toBe(3);
    expect(analysis.metrics.cameraHelpEventCount).toBeGreaterThanOrEqual(1);
    expect(analysis.metrics.cameraScoreAllowedFrameCount).toBe(3);
    expect(analysis.metrics.startReadinessReadyFrameCount).toBe(3);
    expect(analysis.metrics.replayGameWrapperFrameCount).toBe(3);
    expect(analysis.metrics.replayGameWrapperDivergenceFrameCount).toBe(0);
    expect(analysis.gamePath.frames[1]).toMatchObject({
      lowerLabel: "neutral",
      shouldDrivePlayerSquat: false,
      squatDepth: 0,
      visualRootDrop: 0,
    });
    expect(analysis.gamePath.frames[2]).toMatchObject({
      feetOwner: "recorded-retarget",
      lowerBodyTargetShouldHoldPlayerSquat: true,
      lowerBodyTargetStage: "player-squat",
      lowerLabel: "squat",
      lowerOwner: "player-stable-squat",
      shouldDrivePlayerSquat: true,
    });
    expect(analysis.gamePath.frames[2]?.lowerBodyTargetPlayerRetargetMotion).toBeGreaterThan(0.55);
    expect(analysis.gamePath.frames[2]?.squatDepth).toBeGreaterThan(0.55);
    expect(analysis.gamePath.gameplayEvents[2]?.events.map((event) => event.eventType)).toContain("clear-movement-match");
    expect(analysis.metrics.gameplayClearMovementEventCount).toBeGreaterThan(0);
    expect(analysis.metrics.gameplayScoreDeltaTotal).toBeGreaterThan(0);
    expect(analysis.metrics.gameplayTrackingUncertaintyEventCount).toBe(0);
  });

  it("reports unscoreable camera confidence and blocked readiness in replay analysis", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(withWeakFeetPose()),
      trackingFrame(withLostTrackingPose()),
    ]));

    expect(analysis.gamePath.sourceFrames.map((frame) => frame.cameraState)).toEqual([
      "ready",
      "partial",
      "lost",
    ]);
    expect(analysis.gamePath.sourceFrames[1]).toMatchObject({
      cameraHelpEvents: expect.arrayContaining(["show-your-feet"]),
      scoreAllowed: true,
      startReadinessState: "blocked",
    });
    expect(analysis.gamePath.sourceFrames[2]).toMatchObject({
      cameraHelpEvents: expect.arrayContaining(["move-where-i-can-see-you"]),
      scoreAllowed: false,
      startReadinessState: "blocked",
    });
    expect(analysis.gamePath.sourceFrames[2]?.blockedReasons).toEqual(
      expect.arrayContaining(["camera-lost"]),
    );
    expect(analysis.metrics.cameraConfidenceReadyFrameCount).toBe(1);
    expect(analysis.metrics.cameraConfidencePartialFrameCount).toBe(1);
    expect(analysis.metrics.cameraConfidenceLostFrameCount).toBe(1);
    expect(analysis.metrics.cameraConfidenceUncertainFrameCount).toBe(0);
    expect(analysis.metrics.cameraHelpEventCount).toBeGreaterThanOrEqual(2);
    expect(analysis.metrics.cameraScoreAllowedFrameCount).toBe(2);
    expect(analysis.metrics.startReadinessBlockedFrameCount).toBe(2);
    expect(analysis.metrics.startReadinessCanStartGameFrameCount).toBe(1);
    expect(analysis.metrics.startReadinessReadyFrameCount).toBe(1);
    expect(analysis.metrics.gameplayTrackingUncertaintyEventCount).toBeGreaterThan(0);

    const lostFrameGameEvents = analysis.gamePath.gameplayEvents[2];
    expect(lostFrameGameEvents?.scoreAllowed).toBe(false);
    expect(lostFrameGameEvents?.events).toEqual([
      expect.objectContaining({
        eventType: "tracking-uncertainty",
        message: expect.stringMatching(/move-where-i-can-see-you|show-your-hands|show-your-feet/),
        scoreDelta: 0,
      }),
    ]);
    expect(resolveMovementGameplayEventFrameSummary(lostFrameGameEvents)).toEqual({
      feedbackMessage: expect.stringMatching(/move-where-i-can-see-you|show-your-hands|show-your-feet/),
      scoreDeltaTotal: 0,
    });
    expect(analysis.metrics.gameplayScoreDeltaTotal).toBe(
      analysis.gamePath.gameplayEvents.reduce((total, frame) => (
        total + resolveMovementGameplayEventFrameSummary(frame).scoreDeltaTotal
      ), 0),
    );
  });

  it("fails replay analysis when stored capture readiness was blocked", () => {
    const analysis = analyzeMovementDebugReplaySession({
      ...session([trackingFrame(withCorePose())]),
      captureStartReadiness: blockedCaptureStartReadiness,
    });

    expect(analysis.pass).toBe(false);
    expect(analysis.metrics.startReadinessCaptureBlockedCount).toBe(1);
    expect(analysis.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "start_readiness_blocked_at_capture",
          severity: "error",
        }),
      ]),
    );
  });

  it("warns when stored live readiness disagrees with replay recomputation", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      {
        ...trackingFrame(withCorePose()),
        startReadiness: blockedCaptureStartReadiness,
      },
    ]));

    expect(analysis.metrics.startReadinessStoredFrameCount).toBe(1);
    expect(analysis.metrics.startReadinessMismatchFrameCount).toBe(1);
    expect(analysis.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "start_readiness_replay_mismatch",
          frameIndex: 0,
          severity: "warning",
        }),
      ]),
    );
  });

  it("counts exercise posture transitions from the simulated game path", () => {
    const proofFrame = (mode: Parameters<typeof makeMovementAvatarProofMotionPayload>[0]) => {
      const payload = makeMovementAvatarProofMotionPayload(mode);
      return frame({
        tracking: {
          pose: payload.landmarks,
          worldPose: payload.landmarks,
        },
      });
    };
    const analysis = analyzeMovementDebugReplaySession(session([
      proofFrame("standing"),
      proofFrame("seated"),
      proofFrame("standing"),
      proofFrame("supine"),
      proofFrame("supine-bridge"),
      proofFrame("prone"),
    ]));

    expect(analysis.coverage.summary.phaseComplete).toBe(true);
    expect(analysis.coverage.summary.blockedFamilies).toEqual(expect.arrayContaining([
      "walking",
      "yoga",
      "props-contact",
    ]));
    expect(analysis.coverage.summary.demoReadyCount).toBeLessThan(analysis.coverage.summary.familyCount);
    expect(analysis.coverage.summary.demoReadyPercent).toBeLessThan(100);
    expect(analysis.coverage.summary.userFacingFamilies).toEqual(["upright"]);
    expect(analysis.coverage.summary.internalDemoOnlyFamilies).toEqual(expect.arrayContaining([
      "upper-body-standing",
      "squat-knee-lift",
    ]));
    expect(analysis.coverage.summary.missingProofCount).toBeGreaterThan(0);
    expect(analysis.coverage.summary.missingProofFamilies).toContain("squat-knee-lift");
    expect(analysis.coverage.missingProofs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-proof",
          family: "squat-knee-lift",
          missingLayers: expect.arrayContaining([
            "recorded replay analyzer proof",
            "recorded replay visual capture",
            "Game Studio parity proof",
          ]),
        }),
      ]),
    );
    expect(analysis.coverage.summary.unsupportedFamilies).toEqual([]);
    expect(analysis.metrics.coverageBlockedCount).toBe(analysis.coverage.summary.blockedFamilies.length);
    expect(analysis.metrics.coverageDemoReadyCount).toBe(analysis.coverage.summary.demoReadyCount);
    expect(analysis.metrics.coverageDemoReadyPercent).toBeLessThan(100);
    expect(analysis.metrics.coverageExplicitStatusCount).toBe(analysis.metrics.coverageFamilyCount);
    expect(analysis.metrics.coverageImplementedCount).toBeLessThan(analysis.metrics.coverageFamilyCount);
    expect(analysis.metrics.coverageImplementedPercent).toBeLessThan(100);
    expect(analysis.metrics.coverageInternalDemoOnlyCount).toBe(analysis.coverage.summary.internalDemoOnlyCount);
    expect(analysis.metrics.coverageMissingProofCount).toBe(analysis.coverage.summary.missingProofCount);
    expect(analysis.metrics.coverageRemainingGapCount).toBe(analysis.coverage.summary.remainingGapCount);
    expect(analysis.metrics.coverageUnsupportedCount).toBe(0);
    expect(analysis.metrics.coverageUserFacingCount).toBe(analysis.coverage.summary.userFacingCount);
    expect(analysis.metrics.averageExercisePoseQualityScore).toBeGreaterThan(60);
    expect(analysis.metrics.exercisePoseStrictFrameCount).toBe(2);
    expect(analysis.metrics.exercisePoseModerateFrameCount).toBe(0);
    expect(analysis.metrics.exercisePoseDiagnosticFrameCount).toBe(4);
    expect(analysis.metrics.exerciseTransitionCount).toBe(5);
    expect(analysis.metrics.supportConstraintActiveFrameCount).toBe(2);
    expect(analysis.metrics.supportConstraintPartialFrameCount).toBe(4);
    expect(analysis.metrics.supportConstraintMissingFrameCount).toBe(0);
    expect(analysis.metrics.supportContactCorrectionFrameCount).toBe(4);
    expect(analysis.metrics.supportPresentationAppliedFrameCount).toBe(4);
    expect(analysis.metrics.supportPresentationUpperBodyFrameCount).toBe(4);
    expect(analysis.gamePath.frames.map((frame) => frame.exercisePoseKey)).toEqual([
      "standing-neutral",
      "chair-seated",
      "standing-neutral",
      "supine-mat",
      "pilates-bridge-prep",
      "prone-mat",
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.exercisePoseToleranceBand)).toEqual([
      "strict",
      "diagnostic",
      "strict",
      "diagnostic",
      "diagnostic",
      "diagnostic",
    ]);
    expect(analysis.gamePath.frames[0]?.exercisePoseQualityScore).toBeGreaterThan(
      analysis.gamePath.frames[1]?.exercisePoseQualityScore ?? 0,
    );
    expect(analysis.gamePath.frames.map((frame) => frame.exerciseTransitionKey)).toEqual([
      "stable-upright",
      "standing-to-seated",
      "seated-to-standing",
      "standing-to-floor",
      "floor-variation",
      "floor-roll",
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportIntentKey)).toEqual([
      "feet-floor",
      "seat-chair",
      "feet-floor",
      "back-floor",
      "back-floor",
      "chest-floor",
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportConstraintStatus)).toEqual([
      "active",
      "partial-contact-correction",
      "active",
      "partial-contact-correction",
      "partial-contact-correction",
      "partial-contact-correction",
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportContactStatus)).toEqual([
      "inactive",
      "partial",
      "inactive",
      "partial",
      "partial",
      "partial",
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportContactAnchorCount > 0)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportPresentationOwner)).toEqual([
      "support-presentation-none",
      "support-presentation-seated",
      "support-presentation-none",
      "support-presentation-supine",
      "support-presentation-bridge",
      "support-presentation-prone",
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportPresentationApplied)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportPresentationArmSpecCount > 0)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.supportPresentationSpineSpecCount > 0)).toEqual([
      false,
      true,
      false,
      true,
      true,
      true,
    ]);
    expect(analysis.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "support_constraint_partial",
        severity: "warning",
      }),
    ]));
  });

  it("counts lunge, crawling, and floor-roll diagnostic classes from the simulated game path", () => {
    const proofFrame = (mode: Parameters<typeof makeMovementAvatarProofMotionPayload>[0]) => {
      const payload = makeMovementAvatarProofMotionPayload(mode);
      return frame({
        tracking: {
          pose: payload.landmarks,
          worldPose: payload.landmarks,
        },
      });
    };
    const analysis = analyzeMovementDebugReplaySession(session([
      proofFrame("low-lunge"),
      proofFrame("bear-crawl"),
      proofFrame("supine"),
      proofFrame("prone"),
    ]));

    expect(analysis.metrics.exerciseLungeFrameCount).toBe(1);
    expect(analysis.metrics.exerciseRollingCrawlingFrameCount).toBe(2);
    expect(analysis.metrics.exerciseFloorRollTransitionCount).toBe(1);
    expect(analysis.gamePath.frames.map((frame) => frame.exercisePoseKey)).toEqual([
      "low-lunge-floor",
      "bear-crawl-prep",
      "supine-mat",
      "prone-mat",
    ]);
    expect(analysis.gamePath.frames.map((frame) => frame.exerciseTransitionKey)).toEqual([
      "stable-kneeling",
      "kneeling-to-floor",
      "quadruped-to-floor",
      "floor-roll",
    ]);
  });

  it("flags stored replay output that diverges from the simulated game path", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(scalePoseInFrame(squatPose(), 0.68)),
    ]));

    const divergence = analysis.failures.find((failure) => failure.code === "replay_game_path_diverged");
    expect(divergence).toMatchObject({
      frameIndex: 1,
      severity: "warning",
    });
    expect(analysis.gamePath.parity.divergenceFrameCount).toBe(1);
    expect(analysis.gamePath.parity.firstDivergenceFrame).toBe(1);
    expect(analysis.gamePath.parity.wrapperDivergenceFrameCount).toBe(0);
    expect(divergence?.detail).toContain("replay output diverges from simulated game path");
  });

  it("keeps fixed-spot saved movement root-motion diagnostics stable", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(worldTurnPose(0)),
      trackingFrame(worldTurnPose(0)),
      trackingFrame(worldTurnPose(0)),
    ]));

    expect(analysis.rootMotion.worldLandmarkFrameCount).toBe(3);
    expect(analysis.metrics.maxRootPathDistance).toBeLessThan(0.001);
    expect(analysis.failures.map((failure) => failure.code)).not.toContain("root_path_detected");
    expect(analysis.failures.map((failure) => failure.code)).not.toContain("root_turn_detected");
  });

  it("flags saved turn-around points for avatar root yaw visual review", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(worldTurnPose(0)),
      trackingFrame(worldTurnPose(Math.PI / 2)),
      trackingFrame(worldTurnPose(Math.PI)),
    ]));

    expect(analysis.metrics.maxRootHeadingYaw).toBeGreaterThan(3);
    expect(analysis.metrics.rootMotionTurnFrameCount).toBe(2);
    expect(Math.abs(analysis.gamePath.frames[2]?.rootHeadingYaw ?? 0)).toBeCloseTo(Math.PI, 2);
    expect(analysis.gamePath.frames[2]).toMatchObject({
      rootMotionIntentKey: "turn-on-spot",
      rootSource: "world-landmarks",
    });
    expect(analysis.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "root_turn_detected",
          severity: "warning",
        }),
      ]),
    );
  });

  it("flags saved X/Z path points for avatar root travel visual review", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(worldTurnPose(0)),
      trackingFrame(worldTurnPose(0, { x: 0.2, z: 0.1 })),
      trackingFrame(worldTurnPose(0, { x: 0.42, z: 0.18 })),
    ]));

    expect(analysis.metrics.maxRootPathDistance).toBeGreaterThan(0.4);
    expect(analysis.metrics.rootMotionTravelFrameCount).toBe(2);
    expect(analysis.gamePath.frames[2]?.rootPathDistance).toBeGreaterThan(0.4);
    expect(analysis.gamePath.frames[2]?.rootMotionIntentKey).toBe("root-travel");
    expect(analysis.gamePath.frames[2]?.rootMotionTravelDistance).toBeGreaterThan(0.2);
    expect(analysis.gamePath.frames[2]?.rootPositionConfidence).toBeGreaterThan(0.8);
    expect(analysis.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "root_path_detected",
          severity: "warning",
        }),
      ]),
    );
  });

  it("reports saved both-feet airborne and landing phases as jump diagnostics", () => {
    const airborne = worldTurnPose(0);
    [27, 28, 29, 30, 31, 32].forEach((index) => {
      airborne[index] = { ...airborne[index]!, y: 0.34 };
    });
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(worldTurnPose(0)),
      trackingFrame(airborne),
      trackingFrame(worldTurnPose(0)),
    ]));

    expect(analysis.metrics.rootMotionJumpFrameCount).toBe(2);
    expect(analysis.metrics.rootMotionJumpResponseFrameCount).toBe(2);
    expect(analysis.gamePath.frames[1]?.rootMotionIntentKey).toBe("jump-flight");
    expect(analysis.gamePath.frames[1]?.rootMotionSwingFoot).toBe("both");
    expect(analysis.gamePath.frames[1]?.rootMotionJumpResponseOwner).toBe("jump-response-flight");
    expect(analysis.gamePath.frames[1]?.rootMotionJumpResponseApplied).toBe(true);
    expect(analysis.gamePath.frames[1]?.rootMotionJumpResponseHeightOffset).toBeGreaterThan(0);
    expect(analysis.gamePath.frames[2]?.rootMotionIntentKey).toBe("jump-landing");
    expect(analysis.gamePath.frames[2]?.rootMotionPlantedFoot).toBe("both");
    expect(analysis.gamePath.frames[2]?.rootMotionJumpResponseOwner).toBe("jump-response-landing");
    expect(analysis.gamePath.frames[2]?.rootMotionJumpResponseHeightOffset).toBeLessThan(0);
  });

  it("reports saved foot release and landing phases as step responses", () => {
    const lifted = worldTurnPose(0);
    [27, 29, 31].forEach((index) => {
      lifted[index] = { ...lifted[index]!, y: 0.34, z: (lifted[index]?.z ?? 0) + 0.12 };
    });
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(worldTurnPose(0)),
      trackingFrame(lifted),
      trackingFrame(worldTurnPose(0, { x: 0.12, z: 0.04 })),
    ]));

    expect(analysis.metrics.rootMotionStepEventFrameCount).toBe(2);
    expect(analysis.metrics.rootMotionStepResponseFrameCount).toBe(2);
    expect(analysis.gamePath.frames[1]).toMatchObject({
      rootMotionIntentKey: "right-foot-release",
      rootMotionStepResponseApplied: true,
      rootMotionStepResponseOwner: "step-response-right-release",
      rootMotionStepResponseSide: "right",
    });
    expect(analysis.gamePath.frames[1]?.rootMotionStepResponseFootLiftOffset).toBeGreaterThan(0);
    expect(analysis.gamePath.frames[2]).toMatchObject({
      rootMotionIntentKey: "right-foot-landing",
      rootMotionStepResponseApplied: true,
      rootMotionStepResponseOwner: "step-response-right-landing",
      rootMotionStepResponseSide: "right",
    });
    expect(analysis.gamePath.frames[2]?.rootMotionStepResponseFootLiftOffset).toBeLessThan(0);
  });

  it("marks saved image-only movement points as source-limited for physical path proof", () => {
    const pose = worldTurnPose(0);
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        tracking: {
          pose,
          worldPose: [],
        },
      }),
    ]));

    expect(analysis.rootMotion.sourceLimitedFrameCount).toBe(1);
    expect(analysis.metrics.rootMotionWorldLandmarkFrameCount).toBe(0);
    expect(analysis.failures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "world_landmarks_missing",
          severity: "warning",
        }),
      ]),
    );
  });

  it("passes a stable squat and stand recovery session", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame(),
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.62",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
        retarget: {
          appliedLowerBody: 6,
          appliedUpperBody: 5,
          hipDrop: 0.36,
          leftFootContact: true,
          leftKneeLift: 0.22,
          plantedSquatIkDepth: 0.44,
          rightFootContact: true,
          rightKneeLift: 0.22,
          sourceQuality: 0.92,
          squatDepth: 0.62,
          totalLowerBody: 6,
          totalUpperBody: 5,
          totalSegments: 11,
          visualRootDrop: 0.62,
        },
      }),
      frame(),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures).toEqual([]);
    expect(analysis.metrics.strongFullBodyFrameCount).toBe(3);
  });

  it("flags neutral feet while strong leg motion is present", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        fallbacks: {
          lowerBody: "right-knee-raise-auto d0.00 h0.01 k0.00 t0.84 l0.00 r0.46",
          owners: "head player-calibrated; torso player-spine-model; lower player-right-leg-raise; feet neutral",
        },
        retarget: {
          appliedLowerBody: 0,
          appliedUpperBody: 5,
          hipDrop: 0.01,
          leftFootContact: false,
          leftKneeLift: 0,
          plantedSquatIkDepth: 0,
          rightFootContact: false,
          rightKneeLift: 0.46,
          sourceQuality: 0.98,
          squatDepth: 0,
          totalLowerBody: 6,
          totalUpperBody: 5,
          totalSegments: 11,
          visualRootDrop: 0,
        },
      }),
    ]));

    expect(analysis.pass).toBe(false);
    expect(analysis.failures.map((failure) => failure.code)).toContain("false_knee_raise_candidate");
    expect(analysis.failures.map((failure) => failure.code)).toContain("feet_neutral_while_leg_motion_present");
    expect(analysis.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "false_knee_raise_candidate",
        semanticCode: "leg-lift-wrong-side",
      }),
      expect.objectContaining({
        code: "feet_neutral_while_leg_motion_present",
        semanticCode: "movement-visible-but-unscored",
      }),
    ]));
  });

  it("flags lower body out of frame separately from avatar failures", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        bodyConfidence: {
          hips: 0.99,
          leftFoot: 0.08,
          leftKnee: 0.27,
          rightFoot: 0.09,
          rightKnee: 0.24,
        },
        poseBounds: {
          maxX: 0.7,
          maxY: 1.04,
          minX: 0.35,
          minY: 0.1,
          outOfFrameCount: 3,
        },
        retarget: {
          sourceQuality: 0.5,
        },
      }),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures.map((failure) => failure.code)).toContain("source_lower_body_out_of_frame");
    expect(analysis.failures.every((failure) => failure.severity === "warning")).toBe(true);
  });

  it("compresses contiguous source-quality warnings into frame ranges", () => {
    const makeOutOfFrame = () => frame({
      poseBounds: {
        maxX: 0.7,
        maxY: 1.04,
        minX: 0.35,
        minY: 0.1,
        outOfFrameCount: 3,
      },
    });
    const analysis = analyzeMovementDebugReplaySession(session([
      makeOutOfFrame(),
      makeOutOfFrame(),
      makeOutOfFrame(),
      frame(),
    ]));

    const sourceWarnings = analysis.failures.filter((failure) => (
      failure.code === "source_lower_body_out_of_frame"
    ));
    expect(sourceWarnings).toHaveLength(1);
    expect(sourceWarnings[0]?.frameIndex).toBe(0);
    expect(sourceWarnings[0]?.detail).toContain("Frames 0-2");
  });

  it("flags sticky squat recovery when source returns neutral but avatar remains held", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.60",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
        retarget: {
          hipDrop: 0.4,
          plantedSquatIkDepth: 0.5,
          sourceQuality: 0.92,
          squatDepth: 0.6,
          visualRootDrop: 0.6,
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "neutral",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat-held; feet recorded-retarget",
        },
        retarget: {
          hipDrop: 0,
          leftKneeLift: 0,
          plantedSquatIkDepth: 0.24,
          rightKneeLift: 0,
          sourceQuality: 0.93,
          squatDepth: 0,
          visualRootDrop: 0.22,
        },
      }),
    ]));

    expect(analysis.pass).toBe(false);
    expect(analysis.failures).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "stand_recovery_missing",
        semanticCode: "squat-collapsed-to-leg-lift",
      }),
    ]));
  });

  it("flags excessive lower-body owner flicker", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame(),
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.4",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
      }),
      frame(),
      frame({
        fallbacks: {
          lowerBody: "right-knee-raise-auto r0.5",
          owners: "head player-calibrated; torso player-spine-model; lower player-right-leg-raise; feet neutral",
        },
      }),
    ]));

    expect(analysis.failures.map((failure) => failure.code)).toContain("lower_body_owner_flicker");
  });

  it("flags avatar output divergence when final VRM bones do not match the source", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        avatarVisual: {
          averageLowerBodyDirectionError: 0.68,
          comparedLowerBodySegments: 6,
          segments: {
            leftThigh: {
              confidence: 0.92,
              direction: { x: 0.9, y: -0.1, z: 0 },
              length: 0.42,
              sourceDirection: { x: 0, y: -1, z: 0 },
              sourceError: 0.7,
            },
          },
        },
        fallbacks: {
          lowerBody: "squat-auto d0.62",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
        retarget: {
          hipDrop: 0.36,
          plantedSquatIkDepth: 0.44,
          sourceQuality: 0.92,
          squatDepth: 0.62,
          visualRootDrop: 0.62,
        },
      }),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures.map((failure) => failure.code)).toContain("avatar_output_diverged");
    expect(analysis.metrics.avatarVisualFrameCount).toBe(1);
    expect(analysis.metrics.averageAvatarLowerBodyDirectionError).toBeCloseTo(0.68);
  });

  it("flags upper-body avatar divergence when torso and arms do not match the source", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        avatarVisual: {
          averageLowerBodyDirectionError: 0.12,
          averageUpperBodyDirectionError: 0.62,
          comparedLowerBodySegments: 6,
          comparedUpperBodySegments: 5,
          segments: {
            spine: {
              confidence: 0.96,
              direction: { x: 0, y: 1, z: 0 },
              length: 0.24,
              sourceDirection: { x: -0.45, y: 0.89, z: 0 },
              sourceError: 0.62,
            },
            leftUpperArm: {
              confidence: 0.96,
              direction: { x: -0.2, y: -0.98, z: 0 },
              length: 0.2,
              sourceDirection: { x: -0.85, y: -0.52, z: 0 },
              sourceError: 0.55,
            },
            rightUpperArm: {
              confidence: 0.96,
              direction: { x: 0.2, y: -0.98, z: 0 },
              length: 0.2,
              sourceDirection: { x: 0.85, y: -0.52, z: 0 },
              sourceError: 0.55,
            },
          },
        },
      }),
    ]));

    expect(analysis.pass).toBe(true);
    expect(analysis.failures.map((failure) => failure.code)).toContain("avatar_upper_body_diverged");
  });

  it("flags modest upper-body mismatch instead of showing a clean frame", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        avatarVisual: {
          averageLowerBodyDirectionError: 0.08,
          averageUpperBodyDirectionError: 0.21,
          comparedLowerBodySegments: 6,
          comparedUpperBodySegments: 5,
          segments: {
            spine: {
              confidence: 1,
              direction: { x: 0, y: 1, z: 0 },
              length: 0.24,
              sourceDirection: { x: -0.2, y: 0.98, z: 0 },
              sourceError: 0.2,
            },
            leftUpperArm: {
              confidence: 0.95,
              direction: { x: -0.1, y: -0.99, z: 0 },
              length: 0.2,
              sourceDirection: { x: -0.35, y: -0.94, z: 0 },
              sourceError: 0.2,
            },
            rightUpperArm: {
              confidence: 0.95,
              direction: { x: 0.1, y: -0.99, z: 0 },
              length: 0.2,
              sourceDirection: { x: 0.35, y: -0.94, z: 0 },
              sourceError: 0.2,
            },
          },
        },
      }),
    ]));

    expect(analysis.failures.map((failure) => failure.code)).toContain("avatar_upper_body_diverged");
  });

  it("builds a recorded proof manifest with explicit missing and review rows", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(squatPose()),
      trackingFrame(withCorePose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const squatRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "squat"
    ));
    const sideBendRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "side-bend"
    ));

    expect(manifest.recordingCount).toBe(1);
    expect(manifest.summary.totalRows).toBeGreaterThan(0);
    expect(manifest.summary.coverageProductTruth).toEqual({
      internalDemoOnlyCount: analysis.coverage.summary.internalDemoOnlyCount,
      internalDemoOnlyFamilies: analysis.coverage.summary.internalDemoOnlyFamilies,
      missingProofCount: analysis.coverage.summary.missingProofCount,
      userFacingCount: analysis.coverage.summary.userFacingCount,
      userFacingFamilies: analysis.coverage.summary.userFacingFamilies,
    });
    expect(squatRow).toEqual(expect.objectContaining({
      automatedStatus: "passed",
      evidenceFrameCount: expect.any(Number),
      proofCase: "squat",
      recordingId: analysis.sessionId,
      requiredLayers: expect.arrayContaining([
        "recorded replay analyzer proof",
        "recorded replay visual capture",
        "Game Studio parity proof",
      ]),
      status: "manual-review",
    }));
    expect(squatRow?.evidenceFrameCount ?? 0).toBeGreaterThan(0);
    expect(squatRow?.missingLayers).toContain("recorded replay visual capture");
    expect(squatRow?.statusReason).toContain("Automated analyzer/Game proof passed");
    expect(sideBendRow).toEqual(expect.objectContaining({
      automatedStatus: "missing-proof",
      nextAction: expect.stringContaining("Add or tag a saved recording"),
      proofCase: "side-bend",
      status: "missing-proof",
    }));
    expect(manifest.summary.automatedPassedCount).toBeGreaterThan(0);
    expect(manifest.summary.automatedMissingProofCount).toBeGreaterThan(0);
    expect(manifest.summary.blockingRowCount).toBeGreaterThan(0);
    expect(manifest.summary.blockingRowsByProofCase["side-bend"]).toBeGreaterThan(0);
    expect(manifest.summary.blockingRowsByMissingLayer["recorded replay visual capture"]).toBeGreaterThan(0);
  });

  it("uses replay spine side-bend frames as recorded side-bend proof evidence", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(sideBendPose()),
      trackingFrame(withCorePose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const sideBendRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "side-bend"
    ));

    expect(analysis.gamePath.frames[1]?.spineSideBend ?? 0).not.toBe(0);
    expect(sideBendRow).toEqual(expect.objectContaining({
      automatedStatus: "passed",
      directionSign: "negative",
      evidenceFrameCount: expect.any(Number),
      nextAction: expect.stringContaining("movement:replay:proof-set"),
      observedAmplitude: expect.any(Number),
      proofCase: "side-bend",
      status: "manual-review",
    }));
    expect(sideBendRow?.observedAmplitude ?? 0).toBeGreaterThanOrEqual(
      sideBendRow?.expectedMinimumAmplitude ?? Number.POSITIVE_INFINITY,
    );
    expect(sideBendRow?.expectedFrameWindow).toEqual({
      endFrame: 1,
      startFrame: 1,
    });
  });

  it("uses replay visual capture frames to satisfy the recorded visual layer", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(squatPose()),
      trackingFrame(withCorePose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis], {
      visualCaptures: [{
        avatarLowerError: 0.12,
        avatarPath: "movement-replay-session-1-avatar-frame-1.png",
        avatarUpperError: null,
        frameIndex: 1,
        recordingId: analysis.sessionId,
        sourcePath: "movement-replay-session-1-source-frame-1.png",
      }],
    });
    const squatRow = manifest.rows.find((row) => row.proofCase === "squat");

    expect(squatRow?.automatedStatus).toBe("passed");
    expect(squatRow?.visualCaptureFrameCount).toBe(1);
    expect(squatRow?.visualCaptureFrames).toEqual([1]);
    expect(squatRow?.missingLayers).not.toContain("recorded replay visual capture");
    expect(manifest.summary.visualCaptureFrameCount).toBeGreaterThan(0);
    expect(manifest.summary.visualCaptureRowCount).toBeGreaterThan(0);
  });

  it("keeps source-limited recorded proof rows separate from child movement failure", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withWeakFeetPose()),
      trackingFrame(withLostTrackingPose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const weakFeetRow = manifest.rows.find((row) => row.proofCase === "weak-feet");
    const lowerBodyOutOfFrameRow = manifest.rows.find((row) => row.proofCase === "lower-body-out-of-frame");

    expect(weakFeetRow?.status).toBe("source-data-limitation");
    expect(weakFeetRow?.automatedStatus).toBe("source-data-limitation");
    expect(weakFeetRow?.statusReason).toContain("not a child failure");
    expect(lowerBodyOutOfFrameRow?.status).toBe("source-data-limitation");
    expect(lowerBodyOutOfFrameRow?.automatedStatus).toBe("source-data-limitation");
    expect(manifest.summary.sourceDataLimitationCount).toBeGreaterThanOrEqual(2);
    expect(manifest.summary.automatedSourceDataLimitationCount).toBeGreaterThanOrEqual(2);
  });

  it("blocks the recorded proof gate when manifest rows still need proof or review", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(squatPose()),
      trackingFrame(withWeakFeetPose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const gate = summarizeMovementRecordedProofGate(manifest);

    expect(gate.status).toBe("blocked");
    expect(gate.blockingRows.length).toBeGreaterThan(0);
    expect(gate.blockingRows.length).toBe(manifest.summary.blockingRowCount);
    expect(gate.blockingRowsByProofCase["side-bend"]).toBeGreaterThan(0);
    expect(gate.blockingRowsByMissingLayer["recorded replay analyzer proof"]).toBeGreaterThan(0);
    expect(gate.blockingRowsByMissingLayer["recorded replay visual capture"]).toBeGreaterThan(0);
    expect(gate.blockingRowsByStatus["manual-review"]).toBeGreaterThan(0);
    expect(gate.blockingRowsByStatus["missing-proof"]).toBeGreaterThan(0);
    expect(gate.blockingRowsByMissingLayer).toEqual(manifest.summary.blockingRowsByMissingLayer);
    expect(gate.blockingRowsByProofCase).toEqual(manifest.summary.blockingRowsByProofCase);
    expect(gate.blockingRowsByStatus).toEqual(manifest.summary.blockingRowsByStatus);
    expect(gate.summary).toContain("Recorded proof manifest gate blocked");
  });
});
