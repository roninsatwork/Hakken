import { describe, expect, it } from "vitest";
import type {
  MovementDebugReplayFrame,
  MovementDebugReplaySession,
} from "./movementDebugReplay";
import {
  appendMovementAvatarFootLockDebugLabel,
  formatMovementAvatarRetargetDebugLabel,
  resolveMovementAvatarAppliedLowerBodyDecision,
  resolveMovementAvatarArmAimOptions,
  resolveMovementAvatarArmTargets,
  resolveMovementAvatarBoneEaseOptions,
  resolveMovementAvatarFootLockEngagement,
  resolveMovementAvatarFootLockOptions,
  resolveMovementAvatarHeadApplicationPose,
  resolveMovementAvatarHeadDecision,
  resolveMovementAvatarHeadApplyOptions,
  resolveMovementAvatarHipsApplication,
  resolveMovementAvatarHipsPositionOptions,
  resolveMovementAvatarInactiveLowerBodyDecision,
  resolveMovementAvatarLegacyLowerBodyAimOptions,
  resolveMovementAvatarLegacyLowerBodyAimPose,
  resolveMovementAvatarLowerBodyApplicationStage,
  resolveMovementAvatarLowerBodyNeutralPose,
  resolveMovementAvatarLowerBodyTargetSelections,
  resolveMovementAvatarLowerBodyVisualDecision,
  resolveMovementAvatarPlantedFootOwner,
  resolveMovementAvatarPlantedSquatIkOptions,
  resolveMovementAvatarPlantedSquatIkPose,
  resolveMovementAvatarPlayerSourceOwnerDecision,
  resolveMovementAvatarRawHeadDecision,
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarRetargetSegmentApplication,
  resolveMovementAvatarSingleLegRaisePose,
  resolveMovementAvatarSolvedLowerBodyPose,
  resolveMovementAvatarSpineApplyOptions,
  resolveMovementAvatarSpineNeutralPose,
  resolveMovementAvatarSpineSolverPose,
  resolveMovementAvatarSquatFlexionPose,
  resolveMovementAvatarStudioDecision,
  resolveMovementAvatarTrackingFallbackLabels,
} from "./movementAvatarPipeline";
import {
  MOVEMENT_AVATAR_PROOF_MODES,
  type MovementAvatarProofMode,
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
} from "./movementAvatarProofFixtures";
import { buildMovementGamePathSimulation } from "./movementGamePathSimulation";
import {
  buildMovementCalibration,
  DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
  type MovementHeadMotionIntent,
  type MovementLowerBodyIntent,
  type TrackingLandmark,
} from "./movementTrackingCalibration";
import { buildMovementRetargetSourceModel, type MovementRetargetFrame } from "./movementRetargeting";

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

function leftKneeLiftPose() {
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
    pose[index] = { ...pose[index]!, visibility: 0.12 };
  });
  return pose;
}

function sideReachWithoutFootSegmentsPose() {
  const pose = withCorePose();
  pose[25] = { ...pose[25]!, x: 0.26, y: 0.78 };
  pose[27] = { ...pose[27]!, x: 0.2, y: 0.93 };
  [29, 30, 31, 32].forEach((index) => {
    pose[index] = { ...pose[index]!, visibility: 0.12 };
  });
  return pose;
}

function lowerBodyOutOfFramePose() {
  const pose = withCorePose();
  [23, 24, 25, 26, 27, 28, 29, 30, 31, 32].forEach((index) => {
    pose[index] = {
      ...pose[index]!,
      y: pose[index]!.y + 0.32,
      visibility: index >= 27 ? 0.1 : 0.22,
    };
  });
  return pose;
}

function weakElbowVisibleHandPose() {
  const pose = withCorePose();
  pose[13] = { ...pose[13]!, visibility: 0.02 };
  pose[15] = { ...pose[15]!, visibility: 0.08 };
  return pose;
}

function weakEndpointPose() {
  const pose = withCorePose();
  pose[13] = { ...pose[13]!, visibility: 0.02 };
  pose[15] = { ...pose[15]!, visibility: 0.13 };
  return pose;
}

function armTargetLandmarks(pose: TrackingLandmark[]) {
  return pose.map((landmark) => ({
    x: landmark.x,
    y: landmark.y,
    z: landmark.z ?? 0,
    visibility: landmark.visibility ?? 0.8,
  }));
}

function frame(pose: TrackingLandmark[]): MovementDebugReplayFrame {
  return {
    bodyConfidence: {},
    capturedAt: 1000,
    fallbacks: {},
    tracking: {
      pose,
      worldPose: pose,
    },
  };
}

function session(samples: MovementDebugReplayFrame[]): MovementDebugReplaySession {
  return {
    baselineSummary: "manual-calibration:1",
    durationMs: 1600,
    endedAt: 2600,
    id: "game-path-session",
    movementId: "movement-1",
    sampleCount: samples.length,
    samples,
    startedAt: 1000,
    trigger: "debug-tracking",
    warningSummary: "none",
  };
}

const neutralHeadMotion: MovementHeadMotionIntent = {
  confidence: 1,
  depth: 0,
  label: "neutral",
  lateral: 0,
  vertical: 0,
};

const debugLowerBodyIntent: MovementLowerBodyIntent = {
  confidence: 0.86,
  label: "squat",
  leftKneeRaise: 0.12,
  rightKneeRaise: 0.08,
  squatDepth: 0.34,
  squatSignals: {
    headDrop: 0.11,
    hipDrop: 0.22,
    kneeBend: 0.31,
    torsoDrop: 0.18,
  },
};

const debugArmTargets = {
  left: {
    elbowTarget: null,
    frontBias: 0,
    wristSource: "pose",
    wristTarget: null,
  },
  right: {
    elbowTarget: null,
    frontBias: 0,
    wristSource: "hand",
    wristTarget: null,
  },
};

const proofPipelineParityModes: MovementAvatarProofMode[] = [
  "standing",
  "side-bend",
  "hands-front",
  "squat",
  "far-squat",
  "left-leg-raise",
  "far-left-leg-raise",
  "right-leg-raise",
  "far-right-leg-raise",
  "weak-feet-standing",
  "lower-body-out-of-frame",
  "upper-body-auto",
  "upper-body-auto-rejected",
];

const proofPipelineParityModeSet = new Set<MovementAvatarProofMode>(proofPipelineParityModes);

function movementAvatarDecisionParitySnapshot(
  decision: ReturnType<typeof resolveMovementAvatarStudioDecision>,
) {
  return {
    feetOwner: decision.feetOwner,
    leftArmEndpointConfidence: decision.leftArm.endpointConfidence,
    leftArmFallback: decision.leftArm.unreadyFallback,
    leftArmReady: decision.leftArm.isTrackingReady,
    lowerBodyTrackingReady: decision.lowerBodyTrackingReady,
    lowerLabel: decision.lowerLabel,
    lowerOwner: decision.lowerOwner,
    rightArmEndpointConfidence: decision.rightArm.endpointConfidence,
    rightArmFallback: decision.rightArm.unreadyFallback,
    rightArmReady: decision.rightArm.isTrackingReady,
    shouldApplyLowerBody: decision.shouldApplyLowerBody,
    shouldDrivePlayerLegRaise: decision.lowerBodyDrive.shouldDrivePlayerLegRaise,
    shouldDrivePlayerSquat: decision.lowerBodyDrive.shouldDrivePlayerSquat,
    spineOwner: decision.spineDrive.owner,
    torsoOwner: decision.torsoOwner,
  };
}

function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: false,
      rightFoot: false,
      ...overrides.contacts,
    },
    debug: {
      heldSegments: [],
      solvedSegments: ["leftFoot", "rightFoot", "leftUpperArm", "rightUpperArm"],
      sourceQuality: 0.8,
      ...overrides.debug,
    },
    hipDrop: 0,
    kneeLift: {
      left: 0,
      right: 0,
      ...overrides.kneeLift,
    },
    segments: {
      leftFoot: { confidence: 0.9, direction: { x: 0, y: 1, z: 0 }, length: 1 },
      rightFoot: { confidence: 0.9, direction: { x: 0, y: 1, z: 0 }, length: 1 },
      leftUpperArm: { confidence: 0.9, direction: { x: 1, y: 0, z: 0 }, length: 1 },
      rightUpperArm: { confidence: 0.9, direction: { x: -1, y: 0, z: 0 }, length: 1 },
      ...overrides.segments,
    },
    squatDepth: 0,
    ...overrides,
  };
}

describe("movementGamePathSimulation", () => {
  it.each([
    ["standing neutral", withCorePose()],
    ["planted squat", squatPose()],
    ["single knee lift", leftKneeLiftPose()],
    ["weak feet", weakFeetPose()],
    ["lower body out of frame", lowerBodyOutOfFramePose()],
  ])("keeps replay and studio source wrappers in parity for %s", (_label, pose) => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const replayDecision = resolveMovementAvatarReplayDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: pose },
    });
    const studioDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: pose },
    });

    expect(movementAvatarDecisionParitySnapshot(studioDecision)).toEqual(
      movementAvatarDecisionParitySnapshot(replayDecision),
    );
  });

  it("builds deterministic proof motion payloads in the same shape as live player tracking", () => {
    const payload = makeMovementAvatarProofMotionPayload("squat");
    const proofPose = makeMovementAvatarProofPose("squat");

    expect(payload.landmarks).toHaveLength(33);
    expect(payload.landmarks?.[0]).toEqual({
      ...proofPose[0],
      z: proofPose[0]!.z ?? 0,
      visibility: proofPose[0]!.visibility ?? 0.9,
    });
    expect(payload.landmarks?.every((landmark) => (
      landmark.z !== undefined && landmark.visibility !== undefined
    ))).toBe(true);
    expect(payload.hands?.left?.landmarks).toHaveLength(21);
    expect(payload.hands?.right?.landmarks).toHaveLength(21);
    expect(payload.hands?.left?.landmarks.every((landmark) => (
      landmark.z !== undefined && landmark.visibility !== undefined
    ))).toBe(true);
  });

  it("keeps every deterministic proof mode in wrapper and game-path parity coverage", () => {
    expect(proofPipelineParityModes).toEqual(MOVEMENT_AVATAR_PROOF_MODES);
    expect(proofPipelineParityModeSet.size).toBe(MOVEMENT_AVATAR_PROOF_MODES.length);
  });

  it.each(proofPipelineParityModes)(
    "keeps deterministic %s proof payloads in parity across replay and studio wrappers",
    (mode) => {
      const neutralPayload = makeMovementAvatarProofMotionPayload("standing");
      const proofPayload = makeMovementAvatarProofMotionPayload(mode);
      const calibration = buildMovementCalibration({ poseLandmarks: neutralPayload.landmarks });
      const retargetSourceModel = buildMovementRetargetSourceModel({
        poseLandmarks: neutralPayload.landmarks,
      });
      const source = {
        hands: proofPayload.hands,
        poseLandmarks: proofPayload.landmarks,
      };
      const replayDecision = resolveMovementAvatarReplayDecision({
        avatarRole: "player",
        calibration,
        retargetSourceModel,
        source,
      });
      const studioDecision = resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration,
        retargetSourceModel,
        source,
      });

      expect(movementAvatarDecisionParitySnapshot(studioDecision)).toEqual(
        movementAvatarDecisionParitySnapshot(replayDecision),
      );
    },
  );

  it.each(proofPipelineParityModes)(
    "keeps deterministic %s proof payloads aligned with the game-path simulation",
    (mode) => {
      const neutralPayload = makeMovementAvatarProofMotionPayload("standing");
      const proofPayload = makeMovementAvatarProofMotionPayload(mode);
      const simulation = buildMovementGamePathSimulation(session([
        frame(neutralPayload.landmarks),
        frame(proofPayload.landmarks),
      ]));
      const gamePathDecision = simulation.decisions[1];
      expect(gamePathDecision, `Expected game-path decision for ${mode}`).toBeDefined();

      const studioDecision = resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: simulation.calibration,
        retargetSourceModel: simulation.retargetSourceModel,
        source: {
          hands: proofPayload.hands,
          poseLandmarks: proofPayload.landmarks,
        },
      });

      expect({
        lowerBodyTrackingReady: studioDecision.lowerBodyTrackingReady,
        lowerLabel: studioDecision.lowerLabel,
        shouldApplyLowerBody: studioDecision.shouldApplyLowerBody,
        spineOwner: studioDecision.spineDrive.owner,
        torsoOwner: studioDecision.torsoOwner,
      }).toEqual({
        lowerBodyTrackingReady: gamePathDecision!.lowerBodyTrackingReady,
        lowerLabel: gamePathDecision!.lowerLabel,
        shouldApplyLowerBody: gamePathDecision!.shouldApplyLowerBody,
        spineOwner: gamePathDecision!.spineDrive.owner,
        torsoOwner: gamePathDecision!.torsoOwner,
      });
    },
  );

  it("keeps a weak elbow usable when the live hand endpoint is visible", () => {
    const pose = weakElbowVisibleHandPose();
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const decision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: {
        hands: {
          left: { landmarks: [{ x: 0.32, y: 0.68, z: 0, visibility: 0.8 }] },
        },
        poseLandmarks: pose,
      },
    });

    expect(decision.leftArm.endpointConfidence).toBeGreaterThan(0.7);
    expect(decision.leftArm.isTrackingReady).toBe(true);
  });

  it("holds the last good player arm pose when the endpoint is weak but not gone", () => {
    const pose = weakEndpointPose();
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const decision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: pose },
    });

    expect(decision.leftArm.isTrackingReady).toBe(false);
    expect(decision.leftArm.unreadyFallback).toBe("hold-last-good");
  });

  it("uses shared front-body arm cleanup for live player wrist and elbow targets", () => {
    const pose = withCorePose();
    const playerLandmarks = armTargetLandmarks(pose);
    const solverLandmarks = armTargetLandmarks(pose);
    playerLandmarks[15] = { ...playerLandmarks[15]!, visibility: 0.2 };
    const calibration = buildMovementCalibration({ poseLandmarks: pose });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: pose });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: pose },
    });
    const targets = resolveMovementAvatarArmTargets({
      handWristFallbacks: {
        left: { x: 0.5, y: 0.58, z: -0.2, visibility: 0.9 },
      },
      isPlayer: true,
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      playerLandmarks,
      solverLandmarks,
    });

    expect(targets.left.wristSource).toBe("hand");
    expect(targets.left.frontBias).toBeGreaterThan(0);
    expect(targets.left.elbowTarget?.x).not.toBe(playerLandmarks[13]!.x);
    expect(targets.left.safeZScale).toBe(0.24);
  });

  it("keeps recorded arm target cleanup free of live front-body bias", () => {
    const pose = withCorePose();
    const landmarks = armTargetLandmarks(pose);
    const calibration = buildMovementCalibration({ poseLandmarks: pose });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: pose });
    const pipelineDecision = resolveMovementAvatarReplayDecision({
      avatarRole: "instructor",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: pose },
    });
    const targets = resolveMovementAvatarArmTargets({
      handWristFallbacks: {
        left: { x: 0.5, y: 0.58, z: -0.2, visibility: 0.9 },
      },
      isPlayer: false,
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      playerLandmarks: landmarks,
      solverLandmarks: landmarks,
    });

    expect(targets.left.wristSource).toBe("pose");
    expect(targets.left.frontBias).toBe(0);
    expect(targets.left.elbowTarget).toEqual(landmarks[13]);
    expect(targets.left.safeZScale).toBeUndefined();
  });

  it("smooths player lower-body visual depth with shared live rules", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: squatPose() },
    });
    const visualDecision = resolveMovementAvatarLowerBodyVisualDecision({
      avatarRole: "player",
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      previousState: { squatPresentationDepth: 0, visualRootDrop: 0 },
      recordedSquatPresentationDepth: 0,
    });

    expect(visualDecision.playerSquatPresentationDepth).toBeGreaterThan(0);
    expect(visualDecision.playerSquatPresentationDepth).toBeLessThan(
      pipelineDecision.lowerBodyDrive.playerSquatPresentationDepth,
    );
    expect(visualDecision.visualRootDrop).toBeGreaterThan(0);
  });

  it("requires stronger recorded squat evidence before entering instructor visual squat", () => {
    const neutralDrive = {
      groundedSquatDepth: 0,
      liveSquatDepth: 0,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "neutral" as const,
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: false,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: false,
      visualRootDrop: 0,
    };
    const lowMotionDecision = resolveMovementAvatarLowerBodyVisualDecision({
      avatarRole: "instructor",
      lowerBodyDrive: neutralDrive,
      previousState: { squatPresentationDepth: 0, visualRootDrop: 0 },
      recordedSquatPresentationDepth: 0.12,
    });
    const enteringDecision = resolveMovementAvatarLowerBodyVisualDecision({
      avatarRole: "instructor",
      lowerBodyDrive: neutralDrive,
      previousState: { squatPresentationDepth: 0, visualRootDrop: 0 },
      recordedSquatPresentationDepth: 0.28,
    });

    expect(lowMotionDecision.instructorSquatPresentationDepth).toBe(0);
    expect(enteringDecision.instructorSquatPresentationDepth).toBeGreaterThan(0);
  });

  it("resolves player foot fallback after leg retarget application without foot segments", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: sideReachWithoutFootSegmentsPose() },
    });
    const appliedDecision = resolveMovementAvatarAppliedLowerBodyDecision({
      appliedFootSegments: 0,
      appliedLegSegments: 4,
      appliedLowerBodySegments: 4,
      avatarRole: "player",
      balancedPlantedSquatDepth: 0,
      instructorSquatPresentationDepth: 0,
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      lowerBodySegmentMotion: pipelineDecision.lowerBodySegmentMotion,
      lowerBodyTrackingReady: pipelineDecision.lowerBodyTrackingReady,
      playerRetargetLowerBodyMotion: pipelineDecision.playerRetargetLowerBodyMotion,
      retargetFrame: pipelineDecision.retargetFrame,
      shouldApplyLowerBody: pipelineDecision.shouldApplyLowerBody,
      shouldHoldPlayerSquatPose: false,
    });

    expect(appliedDecision.lowerBodyOwner).toBe("player-retarget");
    expect(appliedDecision.feetOwner).toBe("player-legacy-foot-fallback");
    expect(appliedDecision.shouldUsePlayerFootFallback).toBe(true);
    expect(appliedDecision.shouldUseLegacyLowerBody).toBe(false);
  });

  it("resolves held player source ownership from the smoothed visual squat depth", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: withCorePose() },
    });
    const sourceOwner = resolveMovementAvatarPlayerSourceOwnerDecision({
      avatarRole: "player",
      decision: pipelineDecision,
      playerSquatPresentationDepth: 0.24,
      shouldHoldPlayerSquatPose: true,
    });

    expect(sourceOwner.playerRetargetLowerBodyMotion).toBe(0.24);
    expect(sourceOwner.lowerBodyOwnerDecision?.lowerBodyOwner).toBe(
      "player-stable-squat-held",
    );
    expect(sourceOwner.lowerBodyOwnerDecision?.feetOwner).toBe("recorded-retarget");
  });

  it("selects a player leg-raise stage before retarget application when retarget cannot own it", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: leftKneeLiftPose() },
    });
    const stageDecision = resolveMovementAvatarLowerBodyApplicationStage({
      avatarRole: "player",
      instructorLowerBodyMotion: 0,
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      playerRetargetLowerBodyMotion: pipelineDecision.playerRetargetLowerBodyMotion,
      retargetSourceQuality: 0.4,
      sourceOwnerDecision: {
        ...pipelineDecision.lowerBodyOwnerDecision!,
        canUsePlayerRetargetLegRaise: false,
      },
      shouldHoldPlayerSquatPose: false,
    });

    expect(stageDecision.stage).toBe("player-leg-raise");
    expect(stageDecision.anchoredPlayerLegRaiseSide).toBe("left");
    expect(stageDecision.lowerBodyOwner).toBe("player-left-leg-raise");
  });

  it("keeps neutral player frames out of lower-body retarget even when distance adds segment motion", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: scalePoseInFrame(withCorePose(), 0.68) },
    });
    const stageDecision = resolveMovementAvatarLowerBodyApplicationStage({
      avatarRole: "player",
      instructorLowerBodyMotion: 0,
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      playerRetargetLowerBodyMotion: 0.24,
      retargetSourceQuality: pipelineDecision.retargetFrame.debug.sourceQuality,
      sourceOwnerDecision: {
        canUsePlayerRetargetLegRaise: false,
        feetOwner: "recorded-retarget",
        lowerBodyOwner: "player-retarget",
        shouldUsePlayerFootFallback: false,
      },
      shouldHoldPlayerSquatPose: false,
    });

    expect(pipelineDecision.lowerBodyIntent.label).toBe("neutral");
    expect(pipelineDecision.lowerBodyDrive.playerLowerBodyState).toBe("neutral");
    expect(stageDecision.stage).toBe("player-neutral");
    expect(stageDecision.lowerBodyOwner).toBe("player-lower-body-neutral");
    expect(stageDecision.feetOwner).toBe("neutral");
  });

  it("selects recorded neutral stage for low-motion instructor frames", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarReplayDecision({
      avatarRole: "instructor",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: withCorePose() },
    });
    const stageDecision = resolveMovementAvatarLowerBodyApplicationStage({
      avatarRole: "instructor",
      instructorLowerBodyMotion: 0.02,
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      playerRetargetLowerBodyMotion: 0,
      retargetSourceQuality: pipelineDecision.retargetFrame.debug.sourceQuality,
      sourceOwnerDecision: null,
      shouldHoldPlayerSquatPose: false,
    });

    expect(stageDecision.stage).toBe("recorded-neutral");
    expect(stageDecision.lowerBodyOwner).toBe("recorded-neutral");
    expect(stageDecision.feetOwner).toBe("neutral");
  });

  it("composes planted instructor foot ownership labels without duplicating them", () => {
    expect(resolveMovementAvatarPlantedFootOwner("neutral")).toBe("planted-flat");
    expect(resolveMovementAvatarPlantedFootOwner("recorded-retarget")).toBe(
      "recorded-retarget+planted-flat",
    );
    expect(resolveMovementAvatarPlantedFootOwner("recorded-retarget+planted-flat")).toBe(
      "recorded-retarget+planted-flat",
    );
  });

  it("skips recorded foot retargeting while a foot is planted", () => {
    const decision = resolveMovementAvatarRetargetSegmentApplication({
      avatarRole: "instructor",
      hasWorldLandmarks: false,
      instructorSquatPresentationDepth: 0.3,
      lowerBodySegmentMotion: 0.3,
      retargetFrame: retargetFrame({
        contacts: { leftFoot: true, rightFoot: false },
        kneeLift: { left: 0.7, right: 0 },
      }),
      segmentName: "leftFoot",
      segmentType: "foot",
      shouldUseRetargetedUpperBody: false,
    });

    expect(decision).toMatchObject({
      reason: "recorded-foot-planted",
      shouldApply: false,
      zScale: 0.18,
    });
  });

  it("allows recorded foot retargeting for lifted active feet", () => {
    const decision = resolveMovementAvatarRetargetSegmentApplication({
      avatarRole: "instructor",
      hasWorldLandmarks: true,
      instructorSquatPresentationDepth: 0.3,
      lowerBodySegmentMotion: 0.3,
      retargetFrame: retargetFrame({
        kneeLift: { left: 0.7, right: 0 },
      }),
      segmentName: "leftFoot",
      segmentType: "foot",
      shouldUseRetargetedUpperBody: false,
    });

    expect(decision).toMatchObject({
      reason: "active",
      shouldApply: true,
      slerp: 0.36,
      zScale: 1,
    });
  });

  it("uses avatar profile slerp for live player retarget segments", () => {
    const profile = {
      ...DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
      upperArmSlerp: 0.51,
      legSlerp: 0.43,
    };
    const rightArmDecision = resolveMovementAvatarRetargetSegmentApplication({
      avatarRole: "player",
      hasWorldLandmarks: false,
      instructorSquatPresentationDepth: 0,
      lowerBodySegmentMotion: 0,
      profile,
      retargetFrame: retargetFrame(),
      segmentName: "rightUpperArm",
      segmentType: "arm",
      shouldUseRetargetedUpperBody: false,
    });
    const legDecision = resolveMovementAvatarRetargetSegmentApplication({
      avatarRole: "player",
      hasWorldLandmarks: false,
      instructorSquatPresentationDepth: 0,
      lowerBodySegmentMotion: 0,
      profile,
      retargetFrame: retargetFrame({
        segments: {
          leftThigh: { confidence: 0.9, direction: { x: 0, y: -1, z: 0 }, length: 1 },
        },
      }),
      segmentName: "leftThigh",
      segmentType: "leg",
      shouldUseRetargetedUpperBody: false,
    });

    expect(rightArmDecision.slerp).toBe(0.51);
    expect(legDecision.slerp).toBe(0.43);
  });

  it("resolves player arm aim options from the avatar profile", () => {
    const profile = {
      ...DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
      armStoreVisibility: 0.33,
      armVisibility: 0.12,
      lowerArmSlerp: 0.62,
      upperArmSlerp: 0.57,
    };
    const options = resolveMovementAvatarArmAimOptions({
      avatarRole: "player",
      frontBias: 0.2,
      profile,
      safeZScale: 0.24,
    });

    expect(options.upperArm).toEqual({
      frontBias: 0.18000000000000002,
      minVectorLengthSq: 0.00002,
      slerpOverride: 0.57,
      storeVisibilityThreshold: 0.33,
      visibilityThreshold: 0.12,
      zScale: 0.24,
    });
    expect(options.lowerArm).toMatchObject({
      frontBias: 0.22999999999999998,
      slerpOverride: 0.62,
    });
  });

  it("resolves recorded arm aim options with replay defaults", () => {
    const options = resolveMovementAvatarArmAimOptions({
      avatarRole: "instructor",
      frontBias: 0.2,
      safeZScale: 0.24,
    });

    expect(options.upperArm).toMatchObject({
      slerpOverride: 0.42,
      storeVisibilityThreshold: 0.6,
      visibilityThreshold: 0.2,
    });
    expect(options.lowerArm).toMatchObject({
      slerpOverride: 0.45,
      storeVisibilityThreshold: 0.6,
      visibilityThreshold: 0.2,
    });
  });

  it("resolves legacy lower-body aim options for player and recorded roles", () => {
    const profile = {
      ...DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
      footSlerp: 0.41,
      footVisibility: 0.22,
      legSlerp: 0.52,
      legStoreVisibility: 0.44,
      legVisibility: 0.18,
    };
    const playerOptions = resolveMovementAvatarLegacyLowerBodyAimOptions({
      avatarRole: "player",
      profile,
    });
    const recordedOptions = resolveMovementAvatarLegacyLowerBodyAimOptions({
      avatarRole: "instructor",
      profile,
    });

    expect(playerOptions.leg).toMatchObject({
      slerpOverride: 0.52,
      storeVisibilityThreshold: 0.44,
      visibilityThreshold: 0.18,
    });
    expect(playerOptions.foot).toMatchObject({
      slerpOverride: 0.41,
      visibilityThreshold: 0.22,
    });
    expect(recordedOptions.leg).toMatchObject({
      slerpOverride: 0.36,
      storeVisibilityThreshold: 0.6,
      visibilityThreshold: 0.2,
    });
    expect(recordedOptions.foot).toMatchObject({
      slerpOverride: 0.32,
      visibilityThreshold: 0.2,
    });
  });

  it("resolves lower-body target selections with role-specific endpoint thresholds", () => {
    const pose = withCorePose();
    pose[27] = { ...pose[27]!, visibility: 0.19 };
    pose[31] = { ...pose[31]!, visibility: 0.19 };

    const playerSelections = resolveMovementAvatarLowerBodyTargetSelections({
      avatarRole: "player",
      landmarks: pose,
    });
    const recordedSelections = resolveMovementAvatarLowerBodyTargetSelections({
      avatarRole: "instructor",
      landmarks: pose,
    });

    expect(playerSelections.endpointVisibilityThreshold).toBe(0.18);
    expect(playerSelections.leftAnkle.source).toBe("pose");
    expect(playerSelections.leftToe.source).toBe("pose");
    expect(playerSelections.leftKnee.source).toBe("synthetic");
    expect(recordedSelections.endpointVisibilityThreshold).toBe(0.2);
    expect(recordedSelections.leftAnkle.source).toBe("last-good");
    expect(recordedSelections.leftToe.source).toBe("last-good");
    expect(recordedSelections.leftKnee.source).toBe("synthetic");
  });

  it("resolves planted squat IK slerp options for player and recorded roles", () => {
    expect(resolveMovementAvatarPlantedSquatIkOptions({ avatarRole: "player" })).toEqual({
      footSlerp: 0.3,
      legSlerp: 0.52,
    });
    expect(resolveMovementAvatarPlantedSquatIkOptions({ avatarRole: "instructor" })).toEqual({
      footSlerp: 0.34,
      legSlerp: 0.66,
    });
  });

  it("resolves planted squat IK direction recipes outside avatar application", () => {
    const playerPose = resolveMovementAvatarPlantedSquatIkPose({
      avatarRole: "player",
      depth: 0.74,
    });
    const instructorPose = resolveMovementAvatarPlantedSquatIkPose({
      avatarRole: "instructor",
      depth: 0.74,
    });

    expect(playerPose.ikDepth).toBeGreaterThan(0.7);
    expect(playerPose.specs).toHaveLength(6);
    expect(playerPose.specs.map((spec) => spec.bone)).toEqual([
      "rightUpperLeg",
      "leftUpperLeg",
      "rightLowerLeg",
      "leftLowerLeg",
      "rightFoot",
      "leftFoot",
    ]);
    expect(playerPose.specs[0]).toMatchObject({
      direction: {
        down: expect.any(Number),
        forward: expect.any(Number),
        side: expect.any(Number),
      },
      slerp: 0.52,
    });
    expect(playerPose.specs[0]!.direction.side).toBeLessThan(0);
    expect(playerPose.specs[1]!.direction.side).toBeGreaterThan(0);
    expect(playerPose.specs[4]!.direction.forward).toBe(1);
    expect(playerPose.specs[4]!.slerp).toBe(0.3);
    expect(instructorPose.specs[0]!.slerp).toBe(0.66);
    expect(instructorPose.specs[4]!.slerp).toBe(0.34);
    expect(resolveMovementAvatarPlantedSquatIkPose({
      avatarRole: "player",
      depth: 0.05,
    })).toEqual({
      ikDepth: 0,
      specs: [],
    });
  });

  it("resolves hips positioning options for player squat and recorded roles", () => {
    const playerOptions = resolveMovementAvatarHipsPositionOptions({
      avatarRole: "player",
      lowerBodyDrive: {
        ...debugLowerBodyIntent,
        groundedSquatDepth: 0.3,
        liveSquatDepth: 0.3,
        playerLegRaiseDepth: 0,
        playerLegRaiseSide: null,
        playerLowerBodyState: "planted-squat",
        playerSquatPresentationDepth: 0.3,
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: false,
        shouldDrivePlayerSquat: true,
        visualRootDrop: 0.3,
      },
    });
    const recordedOptions = resolveMovementAvatarHipsPositionOptions({
      avatarRole: "instructor",
      lowerBodyDrive: {
        groundedSquatDepth: 0,
        liveSquatDepth: 0,
        playerLegRaiseDepth: 0,
        playerLegRaiseSide: null,
        playerLowerBodyState: "neutral",
        playerSquatPresentationDepth: 0,
        shouldApplyLowerBody: false,
        shouldApplySolverTorso: false,
        shouldDrivePlayerLegRaise: false,
        shouldDrivePlayerSquat: false,
        visualRootDrop: 0,
      },
      profile: {
        ...DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
        squatHipDropLimit: 0.52,
        squatHipDropScale: 0.44,
      },
    });

    expect(playerOptions).toEqual({
      avatarRootVisualLerp: 0.28,
      floorContactCorrectionScale: 0.7,
      rootLerp: 0.38,
      shouldUseCalibratedFloorCorrection: true,
      squatHipDropLimit: 0.88,
      squatHipDropScale: 0.78,
    });
    expect(recordedOptions).toEqual({
      avatarRootVisualLerp: 0.34,
      floorContactCorrectionScale: 0.86,
      rootLerp: 0.48,
      shouldUseCalibratedFloorCorrection: false,
      squatHipDropLimit: 0.52,
      squatHipDropScale: 0.44,
    });
  });

  it("does not floor-correct neutral player hips after distance-only camera changes", () => {
    const neutralOptions = resolveMovementAvatarHipsPositionOptions({
      avatarRole: "player",
      lowerBodyDrive: {
        groundedSquatDepth: 0,
        liveSquatDepth: 0,
        playerLegRaiseDepth: 0,
        playerLegRaiseSide: null,
        playerLowerBodyState: "neutral",
        playerSquatPresentationDepth: 0,
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: false,
        shouldDrivePlayerSquat: false,
        visualRootDrop: 0,
      },
    });
    const squatOptions = resolveMovementAvatarHipsPositionOptions({
      avatarRole: "player",
      lowerBodyDrive: {
        groundedSquatDepth: 0.4,
        liveSquatDepth: 0.4,
        playerLegRaiseDepth: 0,
        playerLegRaiseSide: null,
        playerLowerBodyState: "planted-squat",
        playerSquatPresentationDepth: 0.4,
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: false,
        shouldDrivePlayerSquat: true,
        visualRootDrop: 0.69,
      },
    });

    expect(neutralOptions.floorContactCorrectionScale).toBe(0);
    expect(neutralOptions.squatHipDropScale).toBe(DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE.squatHipDropScale);
    expect(squatOptions.floorContactCorrectionScale).toBe(0.7);
    expect(squatOptions.squatHipDropScale).toBe(0.78);
    expect(resolveMovementAvatarHipsApplication({
      hipsPositionOptions: neutralOptions,
      lowerBodyTrackingReady: true,
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: true,
    })).toEqual({
      shouldApplyFloorContactCorrection: false,
      shouldApplySquatDrop: false,
      squatDrop: 0,
    });
    const squatApplication = resolveMovementAvatarHipsApplication({
      hipsPositionOptions: squatOptions,
      lowerBodyTrackingReady: true,
      playerSquatPresentationDepth: 0.4,
      shouldApplyLowerBody: true,
    });
    expect(squatApplication.shouldApplyFloorContactCorrection).toBe(true);
    expect(squatApplication.shouldApplySquatDrop).toBe(true);
    expect(squatApplication.squatDrop).toBeCloseTo(0.312);
  });

  it("resolves role-specific bone ease options outside avatar application", () => {
    expect(resolveMovementAvatarBoneEaseOptions({ avatarRole: "player" })).toEqual({
      armRelaxedSlerp: 0.16,
      demoFallbackSlerp: 0.18,
      handNeutralSlerp: 0.48,
      lowerBodyNeutralSlerp: 0.12,
      singleLegRaiseSlerp: 0.72,
      solvedLowerBodySlerp: 0.62,
      squatFlexionSlerp: 0.84,
    });
    expect(resolveMovementAvatarBoneEaseOptions({ avatarRole: "instructor" })).toEqual({
      armRelaxedSlerp: 0.1,
      demoFallbackSlerp: 0.12,
      handNeutralSlerp: 0.32,
      lowerBodyNeutralSlerp: 0.08,
      singleLegRaiseSlerp: 0.58,
      solvedLowerBodySlerp: 0.54,
      squatFlexionSlerp: 0.62,
    });
  });

  it("resolves lower-body neutral rotations outside avatar application", () => {
    const specs = resolveMovementAvatarLowerBodyNeutralPose({ slerp: 0.12 });

    expect(specs).toHaveLength(6);
    expect(specs.map((spec) => spec.bone)).toEqual([
      "rightUpperLeg",
      "rightLowerLeg",
      "leftUpperLeg",
      "leftLowerLeg",
      "rightFoot",
      "leftFoot",
    ]);
    specs.forEach((spec) => {
      expect(spec.rotation).toEqual({ x: 0, y: 0, z: 0 });
      expect(spec.slerp).toBe(0.12);
    });
  });

  it("resolves solved lower-body retarget recipes outside avatar application", () => {
    const specs = resolveMovementAvatarSolvedLowerBodyPose({
      depth: 0.72,
      slerp: 0.62,
    });

    expect(specs).toHaveLength(4);
    expect(specs.map((spec) => spec.source)).toEqual([
      "RightUpperLeg",
      "LeftUpperLeg",
      "RightLowerLeg",
      "LeftLowerLeg",
    ]);
    expect(specs[0]).toMatchObject({
      bone: "rightUpperLeg",
      limits: {
        x: expect.any(Number),
        y: 0.8,
        z: 0.8,
      },
      remember: false,
      slerp: 0.62,
    });
    expect(specs[0]!.scale).toBeGreaterThan(1.5);
    expect(specs[0]!.limits.x).toBeGreaterThan(1.3);
    expect(specs[2]!.limits).toMatchObject({ y: 0.6, z: 0.6 });
    expect(resolveMovementAvatarSolvedLowerBodyPose({
      depth: 0.02,
      slerp: 0.62,
    })).toEqual([]);
  });

  it("resolves legacy lower-body aim recipes outside avatar application", () => {
    const specs = resolveMovementAvatarLegacyLowerBodyAimPose();

    expect(specs).toEqual([
      {
        bone: "rightUpperLeg",
        child: "rightLowerLeg",
        options: "leg",
        source: { index: 24, type: "landmark" },
        target: "rightKnee",
      },
      {
        bone: "rightLowerLeg",
        child: "rightFoot",
        options: "leg",
        source: { target: "rightKnee", type: "target" },
        target: "rightAnkle",
      },
      {
        bone: "leftUpperLeg",
        child: "leftLowerLeg",
        options: "leg",
        source: { index: 23, type: "landmark" },
        target: "leftKnee",
      },
      {
        bone: "leftLowerLeg",
        child: "leftFoot",
        options: "leg",
        source: { target: "leftKnee", type: "target" },
        target: "leftAnkle",
      },
      {
        bone: "rightFoot",
        child: "rightToes",
        options: "foot",
        source: { index: 30, type: "landmark" },
        target: "rightToe",
      },
      {
        bone: "leftFoot",
        child: "leftToes",
        options: "foot",
        source: { index: 29, type: "landmark" },
        target: "leftToe",
      },
    ]);
  });

  it("resolves squat flexion bone rotations outside avatar application", () => {
    const specs = resolveMovementAvatarSquatFlexionPose({
      bendBoost: 0.32,
      depth: 0.8,
      slerp: 0.84,
    });

    expect(specs).toHaveLength(6);
    expect(specs[0]).toMatchObject({
      bone: "rightUpperLeg",
      rotation: {
        x: expect.any(Number),
        y: 0,
        z: expect.any(Number),
      },
      slerp: 0.84,
    });
    expect(specs[0]!.rotation.x).toBeGreaterThan(1.8);
    expect(specs[0]!.rotation.z).toBeLessThan(0);
    expect(specs[1]!.bone).toBe("leftUpperLeg");
    expect(specs[1]!.rotation.z).toBeGreaterThan(0);
    expect(specs[4]).toMatchObject({
      bone: "rightFoot",
      slerp: 0.63,
    });
    expect(resolveMovementAvatarSquatFlexionPose({
      depth: 0.05,
      slerp: 0.84,
    })).toEqual([]);
  });

  it("resolves single-leg raise bone rotations outside avatar application", () => {
    const specs = resolveMovementAvatarSingleLegRaisePose({
      depth: 0.72,
      side: "left",
      slerp: 0.72,
    });

    expect(specs).toHaveLength(6);
    expect(specs.map((spec) => spec.bone)).toEqual([
      "leftUpperLeg",
      "leftLowerLeg",
      "leftFoot",
      "rightUpperLeg",
      "rightLowerLeg",
      "rightFoot",
    ]);
    expect(specs[0]!.rotation.x).toBeGreaterThan(0.9);
    expect(specs[0]!.rotation.z).toBeGreaterThan(0);
    expect(specs[1]!.rotation.x).toBeLessThan(-0.5);
    expect(specs[2]!.slerp).toBeCloseTo(0.5184);
    expect(specs[3]).toMatchObject({
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.28,
    });
    expect(resolveMovementAvatarSingleLegRaisePose({
      depth: 0.05,
      side: "right",
      slerp: 0.72,
    })).toEqual([]);
  });

  it("resolves spine application options and recorded retarget counting", () => {
    const playerOptions = resolveMovementAvatarSpineApplyOptions({
      avatarRole: "player",
      shouldApplySpine: true,
    });
    const instructorOptions = resolveMovementAvatarSpineApplyOptions({
      avatarRole: "instructor",
      shouldApplySpine: true,
    });

    expect(playerOptions).toEqual({
      activeDrive: {
        chest: 0.42,
        hips: 0.22,
        spine: 0.44,
        upperChest: 0.36,
      },
      shouldCountRecordedSpineRetarget: false,
      solver: {
        chest: 0.36,
        hips: 0.34,
        spine: 0.42,
        upperChest: 0.32,
      },
    });
    expect(instructorOptions).toEqual({
      activeDrive: {
        chest: 0.78,
        hips: 0.36,
        spine: 0.82,
        upperChest: 0.72,
      },
      shouldCountRecordedSpineRetarget: true,
      solver: {
        chest: 0.24,
        hips: 0.26,
        spine: 0.28,
        upperChest: 0.22,
      },
    });
    expect(resolveMovementAvatarSpineApplyOptions({
      avatarRole: "instructor",
      shouldApplySpine: false,
    }).shouldCountRecordedSpineRetarget).toBe(false);

    expect(resolveMovementAvatarSpineSolverPose({
      avatarRole: "player",
      spineApplyOptions: playerOptions,
    })).toEqual([
      {
        bone: "hips",
        limits: { x: 0.35, y: 0.75, z: 0.45 },
        mirrorZ: false,
        scale: 1,
        slerp: 0.34,
        source: "hips",
      },
      {
        bone: "spine",
        limits: { x: 0.45, y: 0.65, z: 0.45 },
        mirrorZ: false,
        scale: 0.65,
        slerp: 0.42,
        source: "spine",
      },
      {
        bone: "chest",
        limits: { x: 0.35, y: 0.5, z: 0.35 },
        mirrorZ: false,
        scale: 0.35,
        slerp: 0.36,
        source: "spine",
      },
      {
        bone: "upperChest",
        limits: { x: 0.25, y: 0.35, z: 0.25 },
        mirrorZ: false,
        scale: 0.2,
        slerp: 0.32,
        source: "spine",
      },
    ]);
    expect(resolveMovementAvatarSpineSolverPose({
      avatarRole: "instructor",
      spineApplyOptions: instructorOptions,
    }).every((spec) => spec.mirrorZ)).toBe(true);
    expect(resolveMovementAvatarSpineNeutralPose()).toEqual([
      { bone: "hips", rotation: { x: 0, y: 0, z: 0 }, slerp: 0.14 },
      { bone: "spine", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
      { bone: "chest", rotation: { x: 0.02, y: 0, z: 0 }, slerp: 0.14 },
      { bone: "upperChest", rotation: { x: 0.01, y: 0, z: 0 }, slerp: 0.14 },
    ]);
  });

  it("resolves head application options for player and recorded roles", () => {
    expect(resolveMovementAvatarHeadApplyOptions({
      avatarRole: "player",
      profile: {
        ...DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
        headSlerp: 0.61,
      },
    })).toEqual({
      headPositionSlerp: 0.3,
      headSlerp: 0.61,
      upperChestCompensationSlerp: 0.18,
    });
    expect(resolveMovementAvatarHeadApplyOptions({ avatarRole: "instructor" })).toEqual({
      headPositionSlerp: 0.3,
      headSlerp: 0.82,
      upperChestCompensationSlerp: 0.18,
    });
  });

  it("resolves head, neck, and upper-chest application poses outside avatar application", () => {
    const headMotionIntent = {
      confidence: 0.9,
      depth: 0.4,
      label: "mixed-head" as const,
      lateral: -0.25,
      vertical: 0.3,
    };
    const playerPose = resolveMovementAvatarHeadApplicationPose({
      headMotionIntent,
      headPitch: 0.2,
      headRoll: -0.1,
      headYaw: 0.15,
      profile: {
        ...DEFAULT_MOVEMENT_AVATAR_TRACKING_PROFILE,
        neckPitchShare: 0.5,
        neckRollShare: 0.3,
        neckYawShare: 0.4,
      },
      shouldApplyHeadMotion: true,
      shouldApplyLowerBody: false,
      shouldApplyPlayerHeadMotion: true,
      shouldApplySpine: false,
    });

    expect(playerPose.neckRotation).toEqual({
      rotationOrder: "YXZ",
      x: 0.14800000000000002,
      y: 0.039999999999999994,
      z: -0.009999999999999998,
    });
    expect(playerPose.headPositionOffset).toEqual({
      x: -0.00625,
      y: -0.0036,
      z: -0.0072,
    });
    expect(playerPose.upperChestCompensation).toEqual({
      x: 0.04000000000000001,
      y: -0.015,
      z: 0.02,
    });

    expect(resolveMovementAvatarHeadApplicationPose({
      headMotionIntent,
      headPitch: 0.2,
      headRoll: -0.1,
      headYaw: 0.15,
      shouldApplyHeadMotion: true,
      shouldApplyLowerBody: true,
      shouldApplyPlayerHeadMotion: true,
      shouldApplySpine: false,
    }).upperChestCompensation).toBeNull();
    expect(resolveMovementAvatarHeadApplicationPose({
      headMotionIntent,
      headPitch: 0.2,
      headRoll: -0.1,
      headYaw: 0.15,
      shouldApplyHeadMotion: false,
      shouldApplyLowerBody: false,
      shouldApplyPlayerHeadMotion: false,
      shouldApplySpine: false,
    })).toEqual({
      headPositionOffset: null,
      neckRotation: null,
      upperChestCompensation: null,
    });
  });

  it("resolves foot-lock options for player and recorded roles", () => {
    expect(resolveMovementAvatarFootLockOptions({ avatarRole: "player" })).toEqual({
      correctionScale: 0.4,
      engageSlerp: 0.32,
      initialStrength: 0.25,
      maxDriftBeforeReset: 0.55,
      minStrengthBeforeClear: 0.04,
      releaseSlerp: 0.28,
    });
    expect(resolveMovementAvatarFootLockOptions({ avatarRole: "instructor" })).toEqual({
      correctionScale: 0.5,
      engageSlerp: 0.32,
      initialStrength: 0.25,
      maxDriftBeforeReset: 0.55,
      minStrengthBeforeClear: 0.04,
      releaseSlerp: 0.28,
    });
  });

  it("keeps neutral player standing from engaging planted foot lock", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const neutralDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: scalePoseInFrame(withCorePose(), 0.68) },
    });
    const squatDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: scalePoseInFrame(squatPose(), 0.68) },
    });
    const recordedDecision = resolveMovementAvatarReplayDecision({
      avatarRole: "instructor",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: scalePoseInFrame(squatPose(), 0.68) },
    });

    expect(neutralDecision.lowerBodyIntent.label).toBe("neutral");
    expect(resolveMovementAvatarFootLockEngagement({
      avatarRole: "player",
      lowerBodyDrive: neutralDecision.lowerBodyDrive,
      lowerBodyTrackingReady: neutralDecision.lowerBodyTrackingReady,
      retargetFrame: neutralDecision.retargetFrame,
      shouldApplyLowerBody: neutralDecision.shouldApplyLowerBody,
    })).toEqual({ shouldEngage: false });
    expect(resolveMovementAvatarFootLockEngagement({
      avatarRole: "player",
      lowerBodyDrive: squatDecision.lowerBodyDrive,
      lowerBodyTrackingReady: squatDecision.lowerBodyTrackingReady,
      retargetFrame: squatDecision.retargetFrame,
      shouldApplyLowerBody: squatDecision.shouldApplyLowerBody,
    })).toEqual({ shouldEngage: true });
    expect(resolveMovementAvatarFootLockEngagement({
      avatarRole: "instructor",
      lowerBodyDrive: recordedDecision.lowerBodyDrive,
      lowerBodyTrackingReady: recordedDecision.lowerBodyTrackingReady,
      retargetFrame: recordedDecision.retargetFrame,
      shouldApplyLowerBody: recordedDecision.shouldApplyLowerBody,
    })).toEqual({ shouldEngage: true });
  });

  it("formats manual-calibrated player tracking fallback labels", () => {
    const labels = resolveMovementAvatarTrackingFallbackLabels({
      activeSpineOwner: "player-spine-model",
      armTargets: debugArmTargets,
      avatarRole: "player",
      bodyConfidence: { leftFoot: 0.8, rightFoot: 0.2 },
      feetOwner: "player-retarget",
      hasActiveCalibration: true,
      hasManualCalibration: true,
      headMotionIntent: neutralHeadMotion,
      headOwner: "player-calibrated",
      leftArmTrackingReady: false,
      leftFootSource: "pose-foot",
      leftKneeSource: "pose-knee",
      lowerBodyIntent: debugLowerBodyIntent,
      lowerBodyOwner: "player-stable-squat",
      lowerBodyTrackingReady: true,
      rawHead: { confidence: 0.9, pitch: 0, roll: 0, source: "pose", yaw: 0 },
      rightArmTrackingReady: true,
      rightFootSource: "toe",
      rightKneeSource: "knee",
      shouldApplyLowerBody: true,
      torsoOwner: "player-spine-model",
    });

    expect(labels).toMatchObject({
      armDepth: "player-2d-safe-arms",
      baseline: "manual-calibration",
      floor: "calibrated-floor",
      head: "pose",
      leftArm: "relaxed-arm",
      lowerBody: "squat d0.34 h0.22 k0.31 t0.18 l0.12 r0.08",
      owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet player-retarget",
      rightArm: "hand",
    });
  });

  it("formats auto-calibrated player tracking fallback labels", () => {
    const labels = resolveMovementAvatarTrackingFallbackLabels({
      activeSpineOwner: "player-spine-neutral",
      armTargets: debugArmTargets,
      autoCalibrationKind: "upper-body",
      avatarRole: "player",
      bodyConfidence: { leftFoot: 0.1, rightFoot: 0.1 },
      feetOwner: "neutral",
      hasActiveCalibration: true,
      hasManualCalibration: false,
      headMotionIntent: { ...neutralHeadMotion, label: "mixed-head" },
      headOwner: "neutral",
      leftArmTrackingReady: true,
      leftFootSource: "toe",
      leftKneeSource: "knee",
      lowerBodyIntent: debugLowerBodyIntent,
      lowerBodyOwner: "neutral",
      lowerBodyTrackingReady: true,
      rawHead: { confidence: 0.1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
      rightArmTrackingReady: true,
      rightFootSource: "toe",
      rightKneeSource: "knee",
      shouldApplyLowerBody: true,
      torsoOwner: "neutral",
    });

    expect(labels.baseline).toBe("upper-body-auto-baseline");
    expect(labels.floor).toBe("fixed-floor");
    expect(labels.head).toBe("last-good-auto");
    expect(labels.headMotion).toBe("mixed-head");
    expect(labels.lowerBody).toContain("squat-auto d0.34");
  });

  it("formats recorded tracking fallback labels", () => {
    const labels = resolveMovementAvatarTrackingFallbackLabels({
      activeSpineOwner: "recorded-spine",
      armTargets: debugArmTargets,
      avatarRole: "instructor",
      bodyConfidence: { leftFoot: 0.6, rightFoot: 0.7 },
      feetOwner: "recorded-retarget",
      hasActiveCalibration: false,
      hasManualCalibration: false,
      headMotionIntent: neutralHeadMotion,
      headOwner: "recorded-face",
      leftArmTrackingReady: true,
      leftFootSource: "toe",
      leftKneeSource: "knee",
      lowerBodyIntent: debugLowerBodyIntent,
      lowerBodyOwner: "recorded-retarget",
      lowerBodyTrackingReady: true,
      rawHead: { confidence: 0.7, pitch: 0, roll: 0, source: "face", yaw: 0 },
      rightArmTrackingReady: true,
      rightFootSource: "toe",
      rightKneeSource: "knee",
      shouldApplyLowerBody: true,
      torsoOwner: "recorded-spine",
    });

    expect(labels.armDepth).toBe("recorded-depth-arms");
    expect(labels.floor).toBe("recorded-floor");
    expect(labels.head).toBe("neutral");
    expect(labels.lowerBody).toContain("recorded d0.34");
  });

  it("formats retarget debug labels consistently", () => {
    const label = formatMovementAvatarRetargetDebugLabel({
      appliedLowerBody: 4,
      appliedUpperBody: 2,
      hipDrop: 0.123,
      leftFootContact: true,
      leftKneeLift: 0.4,
      lowerBodySegmentMotion: 0.56,
      plantedSquatIkDepth: 0.21,
      rightFootContact: false,
      rightKneeLift: 0.09,
      solvedSegments: 7,
      sourceQuality: 0.82,
      squatDepth: 0.31,
      totalLowerBody: 6,
      totalSegments: 9,
      totalUpperBody: 5,
      visualRootDrop: 0.14,
    });

    expect(label).toBe(
      "q0.82 s0.31 hip0.12 seg0.56 knee 0.40/0.09 feet L- bones 7/9 upper 2/5 lower 4/6 drop 0.14 ik 0.21",
    );
  });

  it("appends foot-lock telemetry to retarget debug labels", () => {
    expect(appendMovementAvatarFootLockDebugLabel("q0.82", {
      correction: 0.123,
      drift: 0.456,
      strength: 0.789,
    })).toBe("q0.82 lock 0.79 corr 0.12 drift 0.46");
  });

  it("marks unreliable recorded inactive lower-body frames as source limited", () => {
    expect(resolveMovementAvatarInactiveLowerBodyDecision({
      avatarRole: "instructor",
      lowerBodySourceReliable: false,
    })).toEqual({
      feetOwner: "recorded-source-limited",
      lowerBodyOwner: "recorded-source-limited",
    });
  });

  it("does not override inactive lower-body owners for player frames", () => {
    expect(resolveMovementAvatarInactiveLowerBodyDecision({
      avatarRole: "player",
      lowerBodySourceReliable: false,
    })).toEqual({
      feetOwner: null,
      lowerBodyOwner: null,
    });
  });

  it("resolves legacy fallback when no lower-body retarget segments apply", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: withCorePose() },
    });
    const appliedDecision = resolveMovementAvatarAppliedLowerBodyDecision({
      appliedFootSegments: 0,
      appliedLegSegments: 0,
      appliedLowerBodySegments: 0,
      avatarRole: "player",
      balancedPlantedSquatDepth: 0,
      instructorSquatPresentationDepth: 0,
      lowerBodyDrive: pipelineDecision.lowerBodyDrive,
      lowerBodySegmentMotion: pipelineDecision.lowerBodySegmentMotion,
      lowerBodyTrackingReady: pipelineDecision.lowerBodyTrackingReady,
      playerRetargetLowerBodyMotion: 0.22,
      retargetFrame: pipelineDecision.retargetFrame,
      shouldApplyLowerBody: true,
      shouldHoldPlayerSquatPose: false,
    });

    expect(appliedDecision.lowerBodyOwner).toBe("legacy-fallback");
    expect(appliedDecision.feetOwner).toBe("neutral");
    expect(appliedDecision.shouldUseLegacyLowerBody).toBe(true);
  });

  it("resolves player head ownership through calibration", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const decision = resolveMovementAvatarHeadDecision({
      avatarRole: "player",
      calibration,
      headMotionIntent: {
        ...neutralHeadMotion,
        depth: 0.3,
        lateral: 0.2,
        label: "mixed-head",
      },
      rawHead: {
        confidence: 0.9,
        pitch: 0.25,
        roll: 0.05,
        source: "pose",
        yaw: 0.1,
      },
    });

    expect(decision.headOwner).toBe("player-calibrated");
    expect(decision.shouldApplyHeadMotion).toBe(true);
    expect(decision.shouldApplyPlayerHeadMotion).toBe(true);
    expect(decision.headPitch).toBeGreaterThan(decision.appliedHead.pitch);
  });

  it("resolves raw head source from face landmarks before applying role ownership", () => {
    const face = Array.from({ length: 264 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
    face[1] = { x: 0.54, y: 0.48, z: 0 };
    face[33] = { x: 0.4, y: 0.45, z: 0 };
    face[263] = { x: 0.6, y: 0.45, z: 0 };

    const faceDecision = resolveMovementAvatarRawHeadDecision({
      faceLandmarks: face,
      poseLandmarks: withCorePose(),
    });
    const poseDecision = resolveMovementAvatarRawHeadDecision({
      faceLandmarks: null,
      poseLandmarks: withCorePose(),
    });

    expect(faceDecision.faceLandmarks).toBe(face);
    expect(faceDecision.rawHead.source).toBe("face");
    expect(faceDecision.rawHead.yaw).toBeGreaterThan(0);
    expect(poseDecision.faceLandmarks).toBeNull();
    expect(poseDecision.rawHead.source).toBe("pose");
  });

  it("uses recorded face head ownership for instructor replay frames", () => {
    const decision = resolveMovementAvatarHeadDecision({
      avatarRole: "instructor",
      calibration: null,
      headMotionIntent: neutralHeadMotion,
      rawHead: {
        confidence: 0.8,
        pitch: 0.2,
        roll: 0.1,
        source: "face",
        yaw: 0.15,
      },
    });

    expect(decision.headOwner).toBe("recorded-face");
    expect(decision.shouldApplyHeadMotion).toBe(true);
    expect(decision.shouldApplyPlayerHeadMotion).toBe(false);
  });

  it("keeps instructor pose-only head frames neutral until recorded face is reliable", () => {
    const decision = resolveMovementAvatarHeadDecision({
      avatarRole: "instructor",
      calibration: null,
      headMotionIntent: neutralHeadMotion,
      rawHead: {
        confidence: 0.8,
        pitch: 0.2,
        roll: 0.1,
        source: "pose",
        yaw: 0.15,
      },
    });

    expect(decision.headOwner).toBe("neutral");
    expect(decision.shouldApplyHeadMotion).toBe(false);
  });

  it("replays standing neutral through the game path without squat drive", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(withCorePose()),
    ]));

    const decision = simulation.decisions[1];

    expect(simulation.calibration?.quality).toBeGreaterThan(0.8);
    expect(simulation.retargetSourceModel?.quality).toBeGreaterThan(0.8);
    expect(decision?.lowerBodyIntent.label).toBe("neutral");
    expect(decision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(decision?.lowerOwner).toBe("player-lower-body-neutral");
    expect(decision?.feetOwner).toBe("neutral");
    expect(decision?.retarget.squatDepth).toBe(0);
    expect(decision?.lowerBodyDrive.visualRootDrop).toBe(0);
  });

  it("keeps standing neutral when the saved game frame moves farther from camera", () => {
    const neutralPose = withCorePose();
    const farStandingPose = scalePoseInFrame(neutralPose, 0.68);
    const simulation = buildMovementGamePathSimulation(session([
      frame(neutralPose),
      frame(farStandingPose),
    ]));

    const farDecision = simulation.decisions[1];

    expect(farDecision?.lowerBodyIntent.label).toBe("neutral");
    expect(farDecision?.lowerBodyIntent.leftKneeRaise).toBe(0);
    expect(farDecision?.lowerBodyIntent.rightKneeRaise).toBe(0);
    expect(farDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(farDecision?.lowerOwner).toBe("player-lower-body-neutral");
    expect(farDecision?.feetOwner).toBe("neutral");
    expect(farDecision?.retarget.hipDrop).toBeLessThan(0.05);
    expect(farDecision?.retarget.squatDepth).toBe(0);
    expect(farDecision?.lowerBodyDrive.visualRootDrop).toBe(0);
  });

  it("still drives a planted player squat when the saved game frame is farther from camera", () => {
    const farSquatPose = scalePoseInFrame(squatPose(), 0.68);
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(farSquatPose),
    ]));

    const squatDecision = simulation.decisions[1];

    expect(squatDecision?.lowerBodyIntent.label).toBe("squat");
    expect(squatDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(true);
    expect(squatDecision?.lowerOwner).toBe("player-stable-squat");
    expect(squatDecision?.feetOwner).toBe("recorded-retarget");
    expect(squatDecision?.retarget.squatDepth).toBeGreaterThan(0.55);
    expect(squatDecision?.lowerBodyDrive.visualRootDrop).toBeGreaterThan(0.8);
  });

  it("recovers to neutral after a far squat returns to standing", () => {
    const neutralPose = withCorePose();
    const simulation = buildMovementGamePathSimulation(session([
      frame(neutralPose),
      frame(scalePoseInFrame(squatPose(), 0.68)),
      frame(scalePoseInFrame(neutralPose, 0.68)),
    ]));

    const recoveryDecision = simulation.decisions[2];

    expect(recoveryDecision?.lowerBodyIntent.label).toBe("neutral");
    expect(recoveryDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(recoveryDecision?.lowerOwner).not.toContain("squat");
    expect(recoveryDecision?.retarget.squatDepth).toBe(0);
    expect(recoveryDecision?.lowerBodyDrive.visualRootDrop).toBe(0);
  });

  it("keeps a single knee lift separate from squat root drop", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(leftKneeLiftPose()),
    ]));

    const kneeDecision = simulation.decisions[1];

    expect(kneeDecision?.lowerBodyIntent.label).toBe("left-knee-raise");
    expect(kneeDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(kneeDecision?.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(true);
    expect(kneeDecision?.retarget.squatDepth).toBe(0);
    expect(kneeDecision?.lowerBodyDrive.visualRootDrop).toBe(0);
  });

  it("keeps weak feet from becoming recorded-retarget feet during standing", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(weakFeetPose()),
    ]));

    const weakFeetDecision = simulation.decisions[1];

    expect(weakFeetDecision?.bodyConfidence.hips).toBeGreaterThan(0.8);
    expect(weakFeetDecision?.bodyConfidence.leftKnee).toBeGreaterThan(0.8);
    expect(weakFeetDecision?.bodyConfidence.leftFoot).toBeLessThan(0.2);
    expect(weakFeetDecision?.lowerBodyIntent.label).toBe("neutral");
    expect(weakFeetDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(weakFeetDecision?.feetOwner).toBe("neutral");
    expect(weakFeetDecision?.lowerOwner).not.toContain("squat");
  });

  it("uses a player foot fallback when lower-leg retarget moves but foot segments are missing", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(sideReachWithoutFootSegmentsPose()),
    ]));

    const sideReachDecision = simulation.decisions[1];

    expect(sideReachDecision?.lowerBodyIntent.label).toBe("neutral");
    expect(sideReachDecision?.retarget.lowerBodySegmentMotion).toBeGreaterThan(0.16);
    expect(sideReachDecision?.lowerOwner).toBe("player-lower-body-neutral");
    expect(sideReachDecision?.feetOwner).toBe("neutral");
  });

  it("does not apply lower-body ownership when the lower body is out of frame", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(lowerBodyOutOfFramePose()),
    ]));

    const outOfFrameDecision = simulation.decisions[1];

    expect(outOfFrameDecision?.bodyConfidence.hips).toBeLessThan(0.3);
    expect(outOfFrameDecision?.lowerBodyTrackingReady).toBe(false);
    expect(outOfFrameDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(outOfFrameDecision?.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(false);
    expect(outOfFrameDecision?.lowerOwner).toBe("neutral");
    expect(outOfFrameDecision?.feetOwner).toBe("neutral");
  });

  it("does not let a crouched startup frame poison later standing calibration", () => {
    const neutralPose = withCorePose();
    const simulation = buildMovementGamePathSimulation(session([
      frame(squatPose()),
      frame(neutralPose),
      frame(scalePoseInFrame(neutralPose, 0.68)),
    ]));

    const farStandingDecision = simulation.decisions[2];

    expect(simulation.calibration?.quality).toBeGreaterThan(0.8);
    expect(farStandingDecision?.lowerBodyIntent.label).toBe("neutral");
    expect(farStandingDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(farStandingDecision?.retarget.squatDepth).toBe(0);
    expect(farStandingDecision?.lowerBodyDrive.visualRootDrop).toBe(0);
    expect(farStandingDecision?.lowerOwner).not.toContain("squat");
  });
});
