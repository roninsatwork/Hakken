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
  movementRecordedProofDecisionReviewContextForRow,
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

function withWeakFeetVisibility(pose: TrackingLandmark[]) {
  return pose.map((landmark, index) => (
    [27, 28, 29, 30, 31, 32].includes(index)
      ? { ...landmark, visibility: 0.05 }
      : landmark
  ));
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
    expect(analysis.gamePath.parity.scoreMessageDivergenceFrameCount).toBe(0);
    expect(analysis.gamePath.parity.scoreMessageFrameCount).toBe(3);
    expect(analysis.gamePath.scoreMessageParityFrames).toHaveLength(3);
    expect(analysis.gamePath.scoreMessageParityFrames[2]).toMatchObject({
      diffs: [],
      gameEventTypes: ["effort-reward", "clear-movement-match"],
      gameSummary: {
        feedbackMessage: "great-effort",
        scoreDeltaTotal: 15,
      },
      replayEventTypes: ["effort-reward", "clear-movement-match"],
      replaySummary: {
        feedbackMessage: "great-effort",
        scoreDeltaTotal: 15,
      },
    });
    expect(analysis.gamePath.visualProofFrames).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          cases: expect.arrayContaining(["baseline"]),
          frameIndex: 0,
          mirrorMode: "facing-player",
        }),
        expect.objectContaining({
          cases: expect.arrayContaining(["first-scoring-frame", "strongest-squat"]),
          frameIndex: 2,
        }),
      ]),
    );
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
    expect(analysis.metrics.replayGameScoreMessageFrameCount).toBe(3);
    expect(analysis.metrics.replayGameScoreMessageDivergenceFrameCount).toBe(0);
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
    expect(analysis.gamePath.sourceFrames[0]).toMatchObject({
      startReadinessMessage: "Step back so your whole body is visible.",
      startReadinessState: "ready",
    });
    expect(analysis.gamePath.sourceFrames[1]).toMatchObject({
      cameraHelpEvents: expect.arrayContaining(["show-your-feet"]),
      cameraRecoveryCueEvent: "show-your-feet",
      cameraRecoveryCueMessage: "Show both feet.",
      cameraRecoveryCueState: "partial",
      scoreAllowed: true,
      startReadinessMessage: "Show both feet.",
      startReadinessState: "blocked",
      truthSkeletonRecoveryCueGroup: "feet",
      truthSkeletonRecoveryCueMessage: "Step back until both feet are visible.",
      truthSkeletonRecoveryCueState: "blocked",
      truthSkeletonState: "blocked",
      truthSkeletonWeakestGroup: "feet",
    });
    expect(analysis.replayStudio.frames[1]?.failures.map((failure) => failure.code)).toContain(
      "source-not-trustworthy",
    );
    expect(analysis.replayStudio.frames[1]?.failures.map((failure) => failure.code)).not.toContain(
      "visual-proof-missing",
    );
    expect(analysis.replayStudio.session.worstFrames.map((frame) => frame.frameIndex)).not.toContain(1);
    expect(analysis.gamePath.sourceFrames[1]?.truthSkeletonReasons).toEqual(
      expect.arrayContaining(["feet-weak", "weak-feet"]),
    );
    expect(analysis.gamePath.sourceFrames[1]?.truthSkeletonGroupConfidence.feet).toBeLessThan(0.2);
    expect(analysis.gamePath.sourceFrames[2]).toMatchObject({
      cameraHelpEvents: expect.arrayContaining(["move-where-i-can-see-you"]),
      cameraRecoveryCueEvent: "move-where-i-can-see-you",
      cameraRecoveryCueMessage: "Move where I can see you.",
      cameraRecoveryCueReasons: expect.arrayContaining(["torso-weak", "head-weak"]),
      cameraRecoveryCueState: "lost",
      scoreAllowed: false,
      startReadinessMessage: "Move where I can see you.",
      startReadinessState: "blocked",
      truthSkeletonRecoveryCueGroup: "arms",
      truthSkeletonRecoveryCueMessage: "Keep hands and elbows in frame.",
      truthSkeletonState: "blocked",
      truthSkeletonWeakestGroup: "arms",
    });
    expect(analysis.gamePath.sourceFrames[2]?.blockedReasons).toEqual(
      expect.arrayContaining(["camera-lost"]),
    );
    expect(analysis.metrics.cameraConfidenceReadyFrameCount).toBe(1);
    expect(analysis.metrics.cameraConfidencePartialFrameCount).toBe(1);
    expect(analysis.metrics.cameraConfidenceLostFrameCount).toBe(1);
    expect(analysis.metrics.cameraConfidenceUncertainFrameCount).toBe(0);
    expect(analysis.metrics.cameraHelpEventCount).toBeGreaterThanOrEqual(2);
    expect(analysis.metrics.cameraRecoveryCueFrameCount).toBe(3);
    expect(analysis.metrics.cameraScoreAllowedFrameCount).toBe(2);
    expect(analysis.metrics.truthSkeletonBlockedFrameCount).toBe(2);
    expect(analysis.metrics.truthSkeletonPartialFrameCount).toBe(0);
    expect(analysis.metrics.truthSkeletonReadyFrameCount).toBe(1);
    expect(analysis.metrics.truthSkeletonRecoveryCueFrameCount).toBe(2);
    expect(analysis.metrics.startReadinessBlockedFrameCount).toBe(2);
    expect(analysis.metrics.startReadinessCanStartGameFrameCount).toBe(1);
    expect(analysis.metrics.startReadinessReadyFrameCount).toBe(1);
    expect(analysis.gamePath.startReadinessMessageSummary).toEqual([
      {
        blockedFrameCount: 1,
        canStartGameFrameCount: 0,
        count: 1,
        firstFrameIndex: 1,
        message: "Show both feet.",
        readyFrameCount: 0,
      },
      {
        blockedFrameCount: 1,
        canStartGameFrameCount: 0,
        count: 1,
        firstFrameIndex: 2,
        message: "Move where I can see you.",
        readyFrameCount: 0,
      },
      {
        blockedFrameCount: 0,
        canStartGameFrameCount: 1,
        count: 1,
        firstFrameIndex: 0,
        message: "Step back so your whole body is visible.",
        readyFrameCount: 1,
      },
    ]);
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
    expect(analysis.coverage.summary.blockedFamilies).toEqual([]);
    expect(analysis.coverage.summary.demoReadyCount).toBe(analysis.coverage.summary.familyCount);
    expect(analysis.coverage.summary.demoReadyPercent).toBe(100);
    expect(analysis.coverage.summary.userFacingFamilies).toEqual([
      "upright",
      "upper-body-standing",
      "standing-side-bend-head-direction",
      "squat-knee-lift",
      "root-turn",
    ]);
    expect(analysis.coverage.summary.internalDemoOnlyFamilies).not.toContain("upper-body-standing");
    expect(analysis.coverage.summary.internalDemoOnlyFamilies).not.toContain("standing-side-bend-head-direction");
    expect(analysis.coverage.summary.internalDemoOnlyFamilies).not.toContain("squat-knee-lift");
    expect(analysis.coverage.summary.missingProofCount).toBeGreaterThan(0);
    expect(analysis.coverage.summary.missingProofFamilies).not.toContain("squat-knee-lift");
    expect(analysis.coverage.summary.missingProofFamilies).not.toContain("upper-body-standing");
    expect(analysis.coverage.summary.missingProofFamilies).not.toContain("standing-side-bend-head-direction");
    expect(analysis.coverage.missingProofs).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ family: "squat-knee-lift" }),
        expect.objectContaining({ family: "upper-body-standing" }),
        expect.objectContaining({ family: "standing-side-bend-head-direction" }),
      ]),
    );
    expect(analysis.coverage.summary.unsupportedFamilies).toEqual([]);
    expect(analysis.metrics.coverageBlockedCount).toBe(analysis.coverage.summary.blockedFamilies.length);
    expect(analysis.metrics.coverageDemoReadyCount).toBe(analysis.coverage.summary.demoReadyCount);
    expect(analysis.metrics.coverageDemoReadyPercent).toBe(100);
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

  it("keeps source-blocked root reviews out of Avatar Follow root-motion blockers", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withWeakFeetVisibility(worldTurnPose(0))),
      trackingFrame(withWeakFeetVisibility(worldTurnPose(Math.PI))),
    ]));
    const rootReview = analysis.failures.find((failure) => failure.code === "root_turn_detected");
    const replayStudioFailures = analysis.replayStudio.frames[rootReview?.frameIndex ?? -1]?.failures ?? [];

    expect(rootReview).toMatchObject({
      code: "root_turn_detected",
      frameIndex: 1,
      severity: "warning",
    });
    expect(analysis.gamePath.sourceFrames[1]).toMatchObject({
      startReadinessState: "blocked",
    });
    expect(replayStudioFailures.map((failure) => failure.code)).toContain(
      "source-not-trustworthy",
    );
    expect(replayStudioFailures.map((failure) => failure.code)).not.toContain(
      "root-motion-wrong",
    );
    expect(analysis.replayStudio.session.worstFrames.map((frame) => frame.frameIndex)).not.toContain(1);
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
    [0, 7, 8, 11, 12, 23, 24, 25, 26].forEach((index) => {
      airborne[index] = { ...airborne[index]!, y: airborne[index]!.y + 0.12 };
    });
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
      frame({
        fallbacks: {
          lowerBody: "right-knee-raise-auto r0.5",
          owners: "head player-calibrated; torso player-spine-model; lower player-right-leg-raise; feet neutral",
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.4",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "right-knee-raise-auto r0.5",
          owners: "head player-calibrated; torso player-spine-model; lower player-right-leg-raise; feet neutral",
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "squat-auto d0.4",
          owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet recorded-retarget",
        },
      }),
    ]));

    expect(analysis.failures.map((failure) => failure.code)).toContain("lower_body_owner_flicker");
  });

  it("ignores neutral lower-body owner churn when computing Avatar Follow flicker", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        fallbacks: {
          lowerBody: "neutral-stance",
          owners: "head player-calibrated; torso player-spine-model; lower player-lower-body-neutral; feet neutral",
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "neutral-stance",
          owners: "head player-calibrated; torso player-spine-model; lower player-retarget; feet recorded-retarget",
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "neutral-stance",
          owners: "head player-calibrated; torso player-spine-model; lower player-lower-body-neutral; feet neutral",
        },
      }),
      frame({
        fallbacks: {
          lowerBody: "neutral-stance",
          owners: "head player-calibrated; torso player-spine-model; lower player-retarget; feet recorded-retarget",
        },
      }),
    ]));

    expect(analysis.metrics.lowerBodyOwnerTransitions).toBe(0);
    expect(analysis.failures.map((failure) => failure.code)).not.toContain("lower_body_owner_flicker");
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

  it("hard-fails active leg-raise frames when the rendered avatar lower body lags behind", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      frame({
        avatarVisual: {
          averageLowerBodyDirectionError: 0.22,
          comparedLowerBodySegments: 6,
          segments: {
            rightShin: {
              confidence: 0.96,
              direction: { x: 0.02, y: -0.98, z: 0 },
              length: 0.36,
              sourceDirection: { x: 0.44, y: -0.6, z: 0 },
              sourceError: 0.22,
            },
          },
        },
        fallbacks: {
          lowerBody: "right-knee-raise-auto r0.31",
          owners: "head player-calibrated; torso player-spine-model; lower player-right-leg-raise; feet recorded-retarget",
        },
        retarget: {
          rightKneeLift: 0.31,
          sourceQuality: 0.97,
        },
      }),
    ]));
    const avatarFailure = analysis.failures.find((failure) => (
      failure.code === "avatar_output_diverged" &&
      failure.frameIndex === 0
    ));

    expect(analysis.pass).toBe(false);
    expect(avatarFailure).toEqual(expect.objectContaining({
      semanticCode: "leg-lift-missing",
      severity: "error",
    }));
    expect(analysis.replayStudio.session.status).toBe("blocked");
    expect(analysis.replayStudio.session.blockedFrameCount).toBe(1);
    expect(analysis.replayStudio.session.worstFrames[0]).toEqual(expect.objectContaining({
      frameIndex: 0,
      status: "blocked",
    }));
    expect(analysis.replayStudio.session.worstFrames[0]?.failures[0]).toEqual(expect.objectContaining({
      code: "avatar-not-following-leg",
      nextFixArea: "VRM lower-body application / leg-retarget output",
      severity: "error",
    }));
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
      candidateAmplitude: expect.any(Number),
      nextAction: expect.stringContaining("Best candidate amplitude"),
      proofBlockerCode: "candidate-below-threshold",
      proofCase: "side-bend",
      status: "missing-proof",
      statusReason: expect.stringContaining("Best candidate amplitude"),
    }));
    expect(sideBendRow?.candidateAmplitude ?? Number.POSITIVE_INFINITY).toBeLessThan(
      sideBendRow?.expectedMinimumAmplitude ?? Number.NEGATIVE_INFINITY,
    );
    expect(manifest.summary.automatedPassedCount).toBeGreaterThan(0);
    expect(manifest.summary.automatedMissingProofCount).toBeGreaterThan(0);
    expect(manifest.summary.blockingRowsByProofBlockerCode["candidate-below-threshold"]).toBeGreaterThan(0);
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

  it("keeps broad standing upper-body proof rows gated until visual capture is attached", () => {
    const replaySession = session([
      trackingFrame(withCorePose()),
      trackingFrame(makeMovementAvatarProofMotionPayload("standing-arm-raise").landmarks),
      trackingFrame(makeMovementAvatarProofMotionPayload("standing-twist").landmarks),
      trackingFrame(withCorePose()),
    ]);
    const analysis = analyzeMovementDebugReplaySession(replaySession);
    const broadVisualAnalysis = analyzeMovementDebugReplaySession(replaySession, {
      gameVisualProofOptions: {
        includeStandingUpperBodyTargets: true,
        minStandingTwist: 0.01,
      },
    });
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const defaultGameVisualCases = analysis.gamePath.visualProofFrames.flatMap((proofFrame) => proofFrame.cases);
    const broadGameVisualCases = broadVisualAnalysis.gamePath.visualProofFrames.flatMap((proofFrame) => (
      proofFrame.cases
    ));
    const armRaiseRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "standing-arm-raise"
    ));
    const twistRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "standing-twist"
    ));
    const reachRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "standing-reach"
    ));
    const shoulderRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "shoulder-scapula-control"
    ));

    expect(armRaiseRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: false,
      automatedStatus: "passed",
      evidenceFrameCount: expect.any(Number),
      proofCase: "standing-arm-raise",
      status: "manual-review",
    }));
    expect(armRaiseRow?.observedAmplitude ?? 0).toBeGreaterThanOrEqual(1);
    expect(twistRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: false,
      automatedStatus: "passed",
      evidenceFrameCount: expect.any(Number),
      proofCase: "standing-twist",
      status: "manual-review",
    }));
    expect(twistRow?.observedAmplitude ?? 0).toBeGreaterThanOrEqual(
      twistRow?.expectedMinimumAmplitude ?? Number.POSITIVE_INFINITY,
    );
    expect(reachRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: false,
      automatedStatus: "passed",
      evidenceFrameCount: expect.any(Number),
      proofCase: "standing-reach",
      status: "manual-review",
    }));
    expect(shoulderRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: false,
      automatedStatus: "passed",
      bodyPartMotion: "shoulder/scapula proxy: coordinated arm and upper-spine presentation",
      evidenceFrameCount: expect.any(Number),
      proofCase: "shoulder-scapula-control",
      status: "manual-review",
    }));
    expect(shoulderRow?.observedAmplitude ?? 0).toBeGreaterThanOrEqual(
      shoulderRow?.expectedMinimumAmplitude ?? Number.POSITIVE_INFINITY,
    );
    const broadRows = manifest.rows.filter((row) => (
      row.recordingId === analysis.sessionId &&
      [
        "standing-arm-raise",
        "standing-twist",
        "standing-reach",
        "shoulder-scapula-control",
      ].includes(row.proofCase)
    ));

    expect(broadRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        acceptedProductLimitation: false,
        automatedStatus: "passed",
        proofCase: "standing-arm-raise",
        status: "manual-review",
      }),
      expect.objectContaining({
        acceptedProductLimitation: false,
        automatedStatus: "passed",
        proofCase: "standing-twist",
        status: "manual-review",
      }),
      expect.objectContaining({
        acceptedProductLimitation: false,
        automatedStatus: "passed",
        proofCase: "standing-reach",
        status: "manual-review",
      }),
      expect.objectContaining({
        acceptedProductLimitation: false,
        automatedStatus: "passed",
        proofCase: "shoulder-scapula-control",
        status: "manual-review",
      }),
    ]));
    expect(broadRows).toHaveLength(4);
    expect(broadRows.every((row) => row.missingLayers.includes("recorded replay visual capture"))).toBe(
      true,
    );
    const broadVisualCaptures = broadRows.map((row) => ({
      avatarLowerError: 0.12,
      avatarPath: `movement-replay-session-1-avatar-frame-${row.expectedFrameWindow.startFrame ?? 0}.png`,
      avatarUpperError: 0.12,
      frameIndex: row.expectedFrameWindow.startFrame ?? 0,
      recordingId: analysis.sessionId,
      sourcePath: `movement-replay-session-1-source-frame-${row.expectedFrameWindow.startFrame ?? 0}.png`,
    }));
    const visuallyReviewedManifest = buildMovementRecordedProofManifest([analysis], {
      visualCaptures: broadVisualCaptures,
    });
    const visuallyReviewedBroadRows = visuallyReviewedManifest.rows.filter((row) => (
      row.recordingId === analysis.sessionId &&
      [
        "standing-arm-raise",
        "standing-twist",
        "standing-reach",
        "shoulder-scapula-control",
      ].includes(row.proofCase)
    ));
    expect(visuallyReviewedBroadRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ proofCase: "standing-arm-raise", status: "passed" }),
      expect.objectContaining({ proofCase: "standing-twist", status: "passed" }),
      expect.objectContaining({ proofCase: "standing-reach", status: "passed" }),
      expect.objectContaining({ proofCase: "shoulder-scapula-control", status: "passed" }),
    ]));
    const duplicateAnalysis = analyzeMovementDebugReplaySession({
      ...replaySession,
      id: "movement-replay-session-duplicate",
    });
    const coveredDuplicateManifest = buildMovementRecordedProofManifest([analysis, duplicateAnalysis], {
      visualCaptures: broadVisualCaptures,
    });
    const duplicateBroadRows = coveredDuplicateManifest.rows.filter((row) => (
      row.recordingId === duplicateAnalysis.sessionId &&
      [
        "standing-arm-raise",
        "standing-twist",
        "standing-reach",
        "shoulder-scapula-control",
      ].includes(row.proofCase)
    ));
    expect(duplicateBroadRows).toHaveLength(4);
    expect(duplicateBroadRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        automatedStatus: "covered-by-other-recording",
        missingLayers: [],
        status: "covered-by-other-recording",
      }),
    ]));
    expect(defaultGameVisualCases).not.toContain("strongest-standing-arm-raise");
    expect(defaultGameVisualCases).not.toContain("strongest-standing-twist");
    expect(defaultGameVisualCases).not.toContain("strongest-standing-reach");
    expect(broadGameVisualCases).toEqual(expect.arrayContaining([
      "strongest-standing-arm-raise",
      "strongest-standing-twist",
      "strongest-standing-reach",
    ]));
  });

  it("explains far-squat candidate rejection when only regular squat proof exists", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(squatPose()),
      trackingFrame(withCorePose()),
    ]));
    const squatFrame = analysis.gamePath.frames.find((gameFrame) => gameFrame.frameIndex === 1);
    expect(squatFrame).toBeDefined();
    if (squatFrame) {
      squatFrame.hipDrop = 0.36;
      squatFrame.sourceQuality = 0.92;
      squatFrame.squatDepth = 0.62;
      squatFrame.visualRootDrop = 0.62;
    }
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const farSquatRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "far-squat"
    ));

    expect(farSquatRow).toEqual(expect.objectContaining({
      automatedStatus: "missing-proof",
      candidateAmplitude: expect.any(Number),
      candidateRejectionCode: "far-camera-source-quality",
      candidateRejectionReason: expect.stringContaining("far-camera threshold"),
      proofBlockerCode: "far-camera-source-quality",
      proofCase: "far-squat",
      status: "missing-proof",
    }));
    expect(farSquatRow?.candidateAmplitude ?? 0).toBeGreaterThanOrEqual(
      farSquatRow?.expectedMinimumAmplitude ?? Number.POSITIVE_INFINITY,
    );
    expect(
      manifest.summary.blockingRowsByCandidateRejectionReason[farSquatRow?.candidateRejectionReason ?? ""],
    ).toBe(1);
    expect(manifest.summary.blockingRowsByCandidateRejectionCode["far-camera-source-quality"]).toBe(1);
    expect(manifest.summary.blockingRowsByProofBlockerCode["far-camera-source-quality"]).toBe(1);
    expect(farSquatRow?.nextAction).toContain("full analyzer proof window");
    expect(farSquatRow?.statusReason).toContain("source quality");
  });

  it("uses side-specific knee-lift frames as mirror-side ownership proof evidence", () => {
    const rightLegRaisePose = makeMovementAvatarProofMotionPayload("right-leg-raise").landmarks;
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(rightLegRaisePose),
      trackingFrame(withCorePose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const mirrorSideRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "mirror-side-ownership"
    ));

    expect(mirrorSideRow).toEqual(expect.objectContaining({
      automatedStatus: "passed",
      evidenceFrameCount: 1,
      expectedFrameWindow: {
        endFrame: 1,
        startFrame: 1,
      },
      nextAction: expect.stringContaining("movement:replay:proof-set"),
      observedAmplitude: expect.any(Number),
      proofCase: "mirror-side-ownership",
      status: "manual-review",
    }));
    expect(mirrorSideRow?.observedAmplitude ?? 0).toBeGreaterThanOrEqual(0.18);
    expect(mirrorSideRow?.missingLayers).not.toContain("recorded replay analyzer proof");
    expect(mirrorSideRow?.missingLayers).toContain("recorded replay visual capture");
  });

  it("excludes seated leg-lift frames from standing leg proof evidence", () => {
    const rightLegRaisePose = makeMovementAvatarProofMotionPayload("right-leg-raise").landmarks;
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(rightLegRaisePose),
      trackingFrame(rightLegRaisePose),
    ]));
    const seatedLegLiftFrame = analysis.gamePath.frames[1];
    if (!seatedLegLiftFrame) throw new Error("Expected seated leg-lift proof frame.");
    seatedLegLiftFrame.exercisePoseKey = "seated-leg-lift";
    seatedLegLiftFrame.leftKneeLift = 0;
    seatedLegLiftFrame.lowerLabel = "right-knee-raise";
    seatedLegLiftFrame.lowerOwner = "player-right-leg-raise";
    seatedLegLiftFrame.rightKneeLift = 0.36;
    seatedLegLiftFrame.supportPresentationOwner = "support-presentation-seated-leg-lift";
    seatedLegLiftFrame.supportIntentKey = "feet-floor";
    seatedLegLiftFrame.sourceQuality = 0.95;
    const standingLegLiftFrame = analysis.gamePath.frames[2];
    if (!standingLegLiftFrame) throw new Error("Expected standing leg-lift proof frame.");
    standingLegLiftFrame.exercisePoseKey = "standing-neutral";
    standingLegLiftFrame.leftKneeLift = 0;
    standingLegLiftFrame.lowerLabel = "right-knee-raise";
    standingLegLiftFrame.lowerOwner = "player-right-leg-raise";
    standingLegLiftFrame.rightKneeLift = 0.36;
    standingLegLiftFrame.supportPresentationOwner = "support-presentation-none";
    standingLegLiftFrame.supportIntentKey = "feet-floor";
    standingLegLiftFrame.sourceQuality = 0.95;

    const manifest = buildMovementRecordedProofManifest([analysis]);
    const rightLegRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "right-leg-raise"
    ));
    const mirrorSideRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "mirror-side-ownership"
    ));

    expect(rightLegRow).toEqual(expect.objectContaining({
      automatedStatus: "passed",
      evidenceFrameCount: 1,
      expectedFrameWindow: {
        endFrame: 2,
        startFrame: 2,
      },
      proofCase: "right-leg-raise",
    }));
    expect(mirrorSideRow).toEqual(expect.objectContaining({
      automatedStatus: "passed",
      evidenceFrameCount: 1,
      expectedFrameWindow: {
        endFrame: 2,
        startFrame: 2,
      },
      proofCase: "mirror-side-ownership",
    }));
  });

  it("excludes weak-source startup frames from standing leg proof evidence", () => {
    const rightLegRaisePose = makeMovementAvatarProofMotionPayload("right-leg-raise").landmarks;
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(rightLegRaisePose),
      trackingFrame(rightLegRaisePose),
    ]));
    const weakStartupFrame = analysis.gamePath.frames[0];
    if (!weakStartupFrame) throw new Error("Expected weak startup leg-lift proof frame.");
    weakStartupFrame.exercisePoseKey = "standing-neutral";
    weakStartupFrame.leftKneeLift = 0;
    weakStartupFrame.lowerLabel = "right-knee-raise";
    weakStartupFrame.lowerOwner = "player-right-leg-raise";
    weakStartupFrame.rightKneeLift = 0.36;
    weakStartupFrame.supportPresentationOwner = "support-presentation-none";
    weakStartupFrame.supportIntentKey = "feet-floor";
    weakStartupFrame.sourceQuality = 0.51;
    const cleanStandingFrame = analysis.gamePath.frames[1];
    if (!cleanStandingFrame) throw new Error("Expected clean standing leg-lift proof frame.");
    cleanStandingFrame.exercisePoseKey = "standing-neutral";
    cleanStandingFrame.leftKneeLift = 0;
    cleanStandingFrame.lowerLabel = "right-knee-raise";
    cleanStandingFrame.lowerOwner = "player-right-leg-raise";
    cleanStandingFrame.rightKneeLift = 0.36;
    cleanStandingFrame.supportPresentationOwner = "support-presentation-none";
    cleanStandingFrame.supportIntentKey = "feet-floor";
    cleanStandingFrame.sourceQuality = 0.95;

    const manifest = buildMovementRecordedProofManifest([analysis]);
    const rightLegRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "right-leg-raise"
    ));
    const mirrorSideRow = manifest.rows.find((row) => (
      row.recordingId === analysis.sessionId && row.proofCase === "mirror-side-ownership"
    ));

    expect(rightLegRow).toEqual(expect.objectContaining({
      evidenceFrameCount: 1,
      expectedFrameWindow: {
        endFrame: 1,
        startFrame: 1,
      },
      proofCase: "right-leg-raise",
    }));
    expect(mirrorSideRow).toEqual(expect.objectContaining({
      evidenceFrameCount: 1,
      expectedFrameWindow: {
        endFrame: 1,
        startFrame: 1,
      },
      proofCase: "mirror-side-ownership",
    }));
  });

  it("adds seated proof rows only for explicit seated validation runs", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(makeMovementAvatarProofMotionPayload("seated").landmarks),
      trackingFrame(makeMovementAvatarProofMotionPayload("seated-twist").landmarks),
      trackingFrame(makeMovementAvatarProofMotionPayload("seated-forward-fold").landmarks),
      trackingFrame(makeMovementAvatarProofMotionPayload("seated-leg-lift").landmarks),
    ]));
    const baselineManifest = buildMovementRecordedProofManifest([analysis]);
    const seatedManifest = buildMovementRecordedProofManifest([analysis], {
      includeProductScopeProofCases: [
        "seated-neutral",
        "seated-twist",
        "seated-forward-fold",
        "seated-leg-lift",
        "chair-contact",
      ],
    });
    const seatedRows = seatedManifest.rows.filter((row) => (
      row.proofCase.startsWith("seated-") || row.proofCase === "chair-contact"
    ));

    expect(baselineManifest.rows.some((row) => row.proofCase === "seated-twist")).toBe(false);
    expect(seatedRows.map((row) => row.proofCase).sort()).toEqual([
      "chair-contact",
      "seated-forward-fold",
      "seated-leg-lift",
      "seated-neutral",
      "seated-twist",
    ]);
    expect(seatedRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        automatedStatus: "passed",
        evidenceFrameCount: expect.any(Number),
        proofCase: "seated-neutral",
      }),
      expect.objectContaining({
        automatedStatus: "passed",
        evidenceFrameCount: expect.any(Number),
        proofCase: "seated-twist",
      }),
      expect.objectContaining({
        automatedStatus: "passed",
        evidenceFrameCount: expect.any(Number),
        proofCase: "seated-forward-fold",
      }),
      expect.objectContaining({
        automatedStatus: "missing-proof",
        evidenceFrameCount: 0,
        proofCase: "seated-leg-lift",
      }),
      expect.objectContaining({
        automatedStatus: "passed",
        evidenceFrameCount: expect.any(Number),
        proofCase: "chair-contact",
      }),
    ]));
  });

  it("adds facing/occlusion proof rows only for explicit diagnostic validation runs", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(worldTurnPose(0)),
      trackingFrame(worldTurnPose(0.9)),
      trackingFrame(worldTurnPose(-0.1)),
    ]));
    const occlusionFrame = analysis.gamePath.frames[1];
    if (occlusionFrame) {
      occlusionFrame.lowerBodyTrackingReady = true;
      occlusionFrame.sourceQuality = 0.5;
    }
    const baselineManifest = buildMovementRecordedProofManifest([analysis]);
    const facingManifest = buildMovementRecordedProofManifest([analysis], {
      includeProductScopeProofCases: [
        "facing-occlusion-recovery",
        "side-swap-recovery",
        "self-occlusion-recovery",
      ],
    });
    const facingRows = facingManifest.rows.filter((row) => (
      row.proofCase === "facing-occlusion-recovery" ||
      row.proofCase === "side-swap-recovery" ||
      row.proofCase === "self-occlusion-recovery"
    ));

    expect(baselineManifest.rows.some((row) => row.proofCase === "facing-occlusion-recovery")).toBe(false);
    expect(facingRows.map((row) => row.proofCase).sort()).toEqual([
      "facing-occlusion-recovery",
      "self-occlusion-recovery",
      "side-swap-recovery",
    ]);
    expect(facingRows).toEqual(expect.arrayContaining([
      expect.objectContaining({
        automatedStatus: "passed",
        evidenceFrameCount: expect.any(Number),
        proofCase: "facing-occlusion-recovery",
        status: "manual-review",
      }),
      expect.objectContaining({
        automatedStatus: "passed",
        evidenceFrameCount: expect.any(Number),
        proofCase: "side-swap-recovery",
        status: "manual-review",
      }),
      expect.objectContaining({
        automatedStatus: "passed",
        evidenceFrameCount: expect.any(Number),
        proofCase: "self-occlusion-recovery",
        status: "manual-review",
      }),
    ]));
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
    expect(squatRow?.visualCaptureDiagnostics).toEqual({
      avatarLowerError: {
        average: 0.12,
        count: 1,
        max: 0.12,
      },
      avatarPlantedFootClearance: {
        average: null,
        count: 0,
        max: null,
      },
      avatarUpperError: {
        average: null,
        count: 0,
        max: null,
      },
    });
    expect(squatRow?.visualCaptureFrames).toEqual([1]);
    expect(squatRow?.missingLayers).not.toContain("recorded replay visual capture");
    expect(manifest.summary.visualCaptureFrameCount).toBeGreaterThan(0);
    expect(manifest.summary.visualCaptureRowCount).toBeGreaterThan(0);
  });

  it("applies manual readable-pass review decisions only to visual manual-review rows", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(sideBendPose()),
      trackingFrame(withCorePose()),
    ]));
    const visualCaptures = [{
      avatarLowerError: 0.12,
      avatarPath: "movement-replay-session-1-avatar-frame-1.png",
      avatarUpperError: null,
      frameIndex: 1,
      recordingId: analysis.sessionId,
      sourcePath: "movement-replay-session-1-source-frame-1.png",
    }];
    const baselineManifest = buildMovementRecordedProofManifest([analysis], { visualCaptures });
    const baselineSideBendRow = baselineManifest.rows.find((row) => row.proofCase === "side-bend");
    expect(baselineSideBendRow).toBeDefined();
    if (!baselineSideBendRow) throw new Error("Expected side-bend proof row.");

    const manifest = buildMovementRecordedProofManifest([analysis], {
      manualReviewDecisions: [{
        notes: "Avatar side bend is visually readable against the source frame.",
        proofCase: "side-bend",
        recordingId: analysis.sessionId,
        result: "readable-pass",
        reviewContext: movementRecordedProofDecisionReviewContextForRow(baselineSideBendRow),
        reviewedAt: "2026-07-06T00:00:00.000Z",
        reviewer: "movement-proof-review",
      }],
      visualCaptures,
    });
    const sideBendRow = manifest.rows.find((row) => row.proofCase === "side-bend");
    const rootTravelRow = manifest.rows.find((row) => row.proofCase === "root-travel");

    expect(sideBendRow).toEqual(expect.objectContaining({
      manualReview: expect.objectContaining({
        result: "readable-pass",
      }),
      status: "passed",
      statusReason: expect.stringContaining("Manual visual review accepted"),
    }));
    expect(sideBendRow?.nextAction).toBe("No action.");
    expect(rootTravelRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: true,
      automatedStatus: "product-scope-limitation",
      missingLayers: [],
      proofBlockerCode: null,
      status: "product-scope-limitation",
    }));
    expect(manifest.summary.appliedManualReviewDecisionCount).toBe(1);
    expect(manifest.summary.passedCount).toBeGreaterThan(0);
    expect(manifest.summary.productScopeLimitationCount).toBeGreaterThan(0);
  });

  it("marks duplicate missing proof rows as covered when another recording passes the proof case", () => {
    const sideBendAnalysis = analyzeMovementDebugReplaySession({
      ...session([
        trackingFrame(withCorePose()),
        trackingFrame(sideBendPose()),
        trackingFrame(withCorePose()),
      ]),
      id: "side-bend-recording",
    });
    const nonTargetAnalysis = analyzeMovementDebugReplaySession({
      ...session([
        trackingFrame(withCorePose()),
        trackingFrame(squatPose()),
        trackingFrame(withCorePose()),
      ]),
      id: "non-target-recording",
    });
    const visualCaptures = [{
      avatarLowerError: 0.12,
      avatarPath: "side-bend-avatar-frame-1.png",
      avatarUpperError: null,
      frameIndex: 1,
      recordingId: sideBendAnalysis.sessionId,
      sourcePath: "side-bend-source-frame-1.png",
    }];
    const baselineManifest = buildMovementRecordedProofManifest(
      [sideBendAnalysis, nonTargetAnalysis],
      { visualCaptures },
    );
    const baselineSideBendRow = baselineManifest.rows.find((row) => (
      row.recordingId === sideBendAnalysis.sessionId && row.proofCase === "side-bend"
    ));
    expect(baselineSideBendRow).toBeDefined();
    if (!baselineSideBendRow) throw new Error("Expected side-bend proof row.");

    const manifest = buildMovementRecordedProofManifest(
      [sideBendAnalysis, nonTargetAnalysis],
      {
        manualReviewDecisions: [{
          notes: "Side bend is readable in this recording.",
          proofCase: "side-bend",
          recordingId: sideBendAnalysis.sessionId,
          result: "readable-pass",
          reviewContext: movementRecordedProofDecisionReviewContextForRow(baselineSideBendRow),
        }],
        visualCaptures,
      },
    );
    const coveredSideBendRow = manifest.rows.find((row) => (
      row.recordingId === nonTargetAnalysis.sessionId && row.proofCase === "side-bend"
    ));

    expect(coveredSideBendRow).toEqual(expect.objectContaining({
      automatedStatus: "covered-by-other-recording",
      missingLayers: [],
      proofBlockerCode: null,
      status: "covered-by-other-recording",
    }));
    expect(coveredSideBendRow?.nextAction).toBe(
      "No action; this proof case is already covered by another recording.",
    );
    expect(manifest.summary.coveredByOtherRecordingCount).toBeGreaterThan(0);
    expect(manifest.summary.automatedCoveredByOtherRecordingCount).toBeGreaterThan(0);
    expect(manifest.summary.blockingRowsByProofCase["side-bend"]).toBeUndefined();
  });

  it("keeps root-travel missing recordings visible as non-blocking product-scope limitations", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(squatPose()),
      trackingFrame(withCorePose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis]);
    const gate = summarizeMovementRecordedProofGate(manifest);
    const rootTravelRow = manifest.rows.find((row) => row.proofCase === "root-travel");

    expect(rootTravelRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: true,
      automatedStatus: "product-scope-limitation",
      nextAction: "No action; this proof case is outside the current user-facing recorded proof gate.",
      proofBlockerCode: null,
      status: "product-scope-limitation",
      statusReason: expect.stringContaining("internal/demo-only"),
    }));
    expect(rootTravelRow?.candidateAmplitude ?? Number.POSITIVE_INFINITY).toBeLessThan(
      rootTravelRow?.expectedMinimumAmplitude ?? Number.NEGATIVE_INFINITY,
    );
    expect(manifest.summary.productScopeLimitationCount).toBe(1);
    expect(manifest.summary.automatedProductScopeLimitationCount).toBe(1);
    expect(manifest.summary.missingProofCount).toBeLessThan(manifest.summary.totalRows);
    expect(gate.blockingRows).not.toContainEqual(expect.objectContaining({
      proofCase: "root-travel",
    }));
  });

  it("ignores manual review decisions without matching review context", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(sideBendPose()),
      trackingFrame(withCorePose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis], {
      manualReviewDecisions: [{
        proofCase: "side-bend",
        recordingId: analysis.sessionId,
        result: "readable-pass",
      }],
      visualCaptures: [{
        avatarLowerError: 0.12,
        avatarPath: "movement-replay-session-1-avatar-frame-1.png",
        avatarUpperError: null,
        frameIndex: 1,
        recordingId: analysis.sessionId,
        sourcePath: "movement-replay-session-1-source-frame-1.png",
      }],
    });
    const sideBendRow = manifest.rows.find((row) => row.proofCase === "side-bend");

    expect(sideBendRow?.manualReview).toBeUndefined();
    expect(sideBendRow?.status).toBe("manual-review");
    expect(manifest.summary.appliedManualReviewDecisionCount).toBe(0);
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

  it("lets explicit product-limitation decisions resolve source-limited proof blockers", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withWeakFeetPose()),
      trackingFrame(withLostTrackingPose()),
    ]));
    const baselineManifest = buildMovementRecordedProofManifest([analysis]);
    const baselineWeakFeetRow = baselineManifest.rows.find((row) => row.proofCase === "weak-feet");
    expect(baselineWeakFeetRow).toBeDefined();
    if (!baselineWeakFeetRow) throw new Error("Expected weak-feet proof row.");
    const acceptedManifest = buildMovementRecordedProofManifest([analysis], {
      sourceLimitationDecisions: [{
        notes: "Weak feet are accepted as a source limitation for this recording.",
        proofCase: "weak-feet",
        recordingId: analysis.sessionId,
        result: "accepted-product-limitation",
        reviewContext: movementRecordedProofDecisionReviewContextForRow(baselineWeakFeetRow),
        reviewedAt: "2026-07-06T00:00:00.000Z",
        reviewer: "movement-proof-review",
      }],
    });
    const acceptedWeakFeetRow = acceptedManifest.rows.find((row) => row.proofCase === "weak-feet");
    const acceptedGate = summarizeMovementRecordedProofGate(acceptedManifest);

    expect(baselineWeakFeetRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: false,
      proofBlockerCode: "source-data-limitation",
      status: "source-data-limitation",
    }));
    expect(acceptedWeakFeetRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: true,
      proofBlockerCode: null,
      sourceLimitationDecision: expect.objectContaining({
        result: "accepted-product-limitation",
      }),
      status: "source-data-limitation",
      statusReason: expect.stringContaining("explicit product limitation"),
    }));
    expect(acceptedWeakFeetRow?.nextAction).toBe("No action; source limitation is explicitly accepted.");
    expect(acceptedManifest.summary.sourceDataLimitationCount).toBeGreaterThanOrEqual(2);
    expect(acceptedManifest.summary.acceptedProductLimitationCount).toBeGreaterThanOrEqual(2);
    expect(acceptedManifest.summary.productScopeLimitationCount).toBeGreaterThanOrEqual(1);
    expect(acceptedManifest.summary.appliedSourceLimitationDecisionCount).toBe(1);
    expect(acceptedManifest.summary.blockingRowCount).toBe(baselineManifest.summary.blockingRowCount - 1);
    expect(acceptedGate.blockingRows).not.toContainEqual(expect.objectContaining({
      proofCase: "weak-feet",
      recordingId: analysis.sessionId,
    }));
  });

  it("ignores source-limitation decisions without matching review context", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withWeakFeetPose()),
      trackingFrame(withLostTrackingPose()),
    ]));
    const manifest = buildMovementRecordedProofManifest([analysis], {
      sourceLimitationDecisions: [{
        proofCase: "weak-feet",
        recordingId: analysis.sessionId,
        result: "accepted-product-limitation",
      }],
    });
    const weakFeetRow = manifest.rows.find((row) => row.proofCase === "weak-feet");

    expect(weakFeetRow?.acceptedProductLimitation).toBe(false);
    expect(weakFeetRow?.proofBlockerCode).toBe("source-data-limitation");
    expect(weakFeetRow?.sourceLimitationDecision).toBeUndefined();
    expect(manifest.summary.appliedSourceLimitationDecisionCount).toBe(0);
  });

  it("requires the post-review source-limitation context before accepting a manual-review limitation", () => {
    const analysis = analyzeMovementDebugReplaySession(session([
      trackingFrame(withCorePose()),
      trackingFrame(sideBendPose()),
      trackingFrame(withCorePose()),
    ]));
    const visualCaptures = [{
      avatarLowerError: 0.12,
      avatarPath: "movement-replay-session-1-avatar-frame-1.png",
      avatarUpperError: null,
      frameIndex: 1,
      recordingId: analysis.sessionId,
      sourcePath: "movement-replay-session-1-source-frame-1.png",
    }];
    const baselineManifest = buildMovementRecordedProofManifest([analysis], { visualCaptures });
    const baselineSideBendRow = baselineManifest.rows.find((row) => row.proofCase === "side-bend");
    expect(baselineSideBendRow).toBeDefined();
    if (!baselineSideBendRow) throw new Error("Expected side-bend proof row.");
    const manualReviewDecisions = [{
      proofCase: "side-bend" as const,
      recordingId: analysis.sessionId,
      result: "source-data-limitation" as const,
      reviewContext: movementRecordedProofDecisionReviewContextForRow(baselineSideBendRow),
    }];
    const intermediateManifest = buildMovementRecordedProofManifest([analysis], {
      manualReviewDecisions,
      visualCaptures,
    });
    const intermediateSideBendRow = intermediateManifest.rows.find((row) => row.proofCase === "side-bend");
    expect(intermediateSideBendRow).toBeDefined();
    if (!intermediateSideBendRow) throw new Error("Expected intermediate side-bend proof row.");
    const staleAcceptanceManifest = buildMovementRecordedProofManifest([analysis], {
      manualReviewDecisions,
      sourceLimitationDecisions: [{
        proofCase: "side-bend",
        recordingId: analysis.sessionId,
        result: "accepted-product-limitation",
        reviewContext: movementRecordedProofDecisionReviewContextForRow(baselineSideBendRow),
      }],
      visualCaptures,
    });
    const acceptedManifest = buildMovementRecordedProofManifest([analysis], {
      manualReviewDecisions,
      sourceLimitationDecisions: [{
        proofCase: "side-bend",
        recordingId: analysis.sessionId,
        result: "accepted-product-limitation",
        reviewContext: movementRecordedProofDecisionReviewContextForRow(intermediateSideBendRow),
      }],
      visualCaptures,
    });
    const staleSideBendRow = staleAcceptanceManifest.rows.find((row) => row.proofCase === "side-bend");
    const acceptedSideBendRow = acceptedManifest.rows.find((row) => row.proofCase === "side-bend");

    expect(intermediateSideBendRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: false,
      status: "source-data-limitation",
    }));
    expect(staleSideBendRow?.acceptedProductLimitation).toBe(false);
    expect(staleAcceptanceManifest.summary.appliedSourceLimitationDecisionCount).toBe(0);
    expect(acceptedSideBendRow).toEqual(expect.objectContaining({
      acceptedProductLimitation: true,
      proofBlockerCode: null,
      status: "source-data-limitation",
    }));
    expect(acceptedManifest.summary.appliedManualReviewDecisionCount).toBe(1);
    expect(acceptedManifest.summary.appliedSourceLimitationDecisionCount).toBe(1);
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
