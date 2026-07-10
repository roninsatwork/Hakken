import { describe, expect, it } from "vitest";
import type {
  MovementDebugReplayFrame,
  MovementDebugReplaySession,
} from "./movementDebugReplay";
import {
  appendMovementAvatarFootLockDebugLabel,
  formatMovementAvatarRetargetDebugLabel,
  resolveMovementAvatarAppliedLowerBodyDecision,
  resolveMovementAvatarBoneEaseOptions,
  resolveMovementAvatarFootLockEngagement,
  resolveMovementAvatarFootLockOptions,
  resolveMovementAvatarHeadApplicationPose,
  resolveMovementAvatarHeadBonePitch,
  resolveMovementAvatarHeadDecision,
  resolveMovementAvatarHeadApplyOptions,
  resolveMovementAvatarMirrorHeadForDisplay,
  resolveMovementAvatarHipsApplication,
  resolveMovementAvatarHipsPositionOptions,
  resolveMovementAvatarInactiveLowerBodyDecision,
  resolveMovementAvatarLowerBodyApplicationStage,
  resolveMovementAvatarLowerBodyNeutralPose,
  resolveMovementAvatarLowerBodyTargetSelections,
  resolveMovementAvatarLowerBodyVisualDecision,
  resolveMovementAvatarPlantedFootOwner,
  resolveMovementAvatarPlantedSquatIkOptions,
  resolveMovementAvatarPlantedSquatIkPose,
  resolveMovementAvatarActiveSpinePose,
  resolveMovementAvatarPlayerSourceOwnerDecision,
  resolveMovementAvatarRawHeadDecision,
  resolveMovementAvatarRetargetSegmentApplication,
  resolveMovementAvatarSingleLegRaisePose,
  resolveMovementAvatarSpineApplyOptions,
  resolveMovementAvatarSpineNeutralPose,
  resolveMovementAvatarSpineSolverPose,
  resolveMovementAvatarSquatFlexionPose,
  resolveMovementAvatarTrackingFallbackLabels,
} from "./movementAvatarPipeline";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipelineDecision";

type MovementAvatarPipelineDecisionInput = Parameters<typeof resolveMovementAvatarPipelineDecision>[0];

const resolveMovementAvatarReplayDecision = (
  input: Omit<MovementAvatarPipelineDecisionInput, "sourceOrigin">,
) => resolveMovementAvatarPipelineDecision({ ...input, sourceOrigin: "replay" });

const resolveMovementAvatarStudioDecision = (
  input: Omit<MovementAvatarPipelineDecisionInput, "sourceOrigin">,
) => resolveMovementAvatarPipelineDecision({ ...input, sourceOrigin: "studio" });
import {
  MOVEMENT_AVATAR_PROOF_MODES,
  type MovementAvatarProofMode,
  makeMovementAvatarProofMotionPayload,
  makeMovementAvatarProofPose,
  makeMovementAvatarProofRootBaselinePayload,
} from "./movementAvatarProofFixtures";
import { buildMovementGamePathSimulation } from "./movementGamePathSimulation";
import {
  selectMovementGameVisualParityProofFrames,
} from "./movementGameVisualParityProof";
import { prepareVrmSolverInput } from "./vrmRigging";
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

function sideBendPose() {
  const pose = withCorePose();
  pose[0] = { ...pose[0]!, x: 0.66 };
  pose[7] = { ...pose[7]!, x: 0.62 };
  pose[8] = { ...pose[8]!, x: 0.7 };
  pose[11] = { ...pose[11]!, x: 0.54 };
  pose[12] = { ...pose[12]!, x: 0.76 };
  return pose;
}

function worldHeadingPose(yaw: number, offset = { x: 0, z: 0 }) {
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

function clippedFeetPose(pose: TrackingLandmark[]) {
  return pose.map((landmark, index) => (
    index >= 27 && index <= 32
      ? { ...landmark, y: 1.16, visibility: 0.12 }
      : landmark
  ));
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

function frameWithWorld(
  pose: TrackingLandmark[],
  worldPose: TrackingLandmark[] | null | undefined,
): MovementDebugReplayFrame {
  return {
    bodyConfidence: {},
    capturedAt: 1000,
    fallbacks: {},
    tracking: {
      pose,
      worldPose: worldPose ?? [],
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

const proofPipelineParityModes: MovementAvatarProofMode[] = [
  "standing",
  "side-bend",
  "hands-front",
  "standing-arm-raise",
  "standing-twist",
  "yoga-half-lift",
  "yoga-forward-fold",
  "yoga-chair",
  "yoga-warrior-one",
  "yoga-warrior-two",
  "yoga-triangle",
  "yoga-tree",
  "head-up",
  "head-down",
  "head-left",
  "head-right",
  "squat",
  "far-squat",
  "forward-lunge",
  "side-lunge",
  "jumping-jack",
  "left-leg-raise",
  "far-left-leg-raise",
  "right-leg-raise",
  "far-right-leg-raise",
  "root-turn-left",
  "root-turn-right",
  "root-travel-left",
  "root-travel-right",
  "root-travel-forward",
  "root-travel-back",
  "root-turn-travel",
  "seated",
  "seated-twist",
  "seated-forward-fold",
  "seated-leg-lift",
  "kneeling",
  "half-kneeling",
  "low-lunge",
  "quadruped",
  "bear-crawl",
  "quadruped-bird-dog",
  "yoga-child-pose",
  "yoga-cat",
  "yoga-cow",
  "yoga-plank",
  "yoga-down-dog",
  "side-lying",
  "side-lying-leg-lift",
  "supine",
  "supine-bridge",
  "pilates-single-leg-stretch",
  "pilates-dead-bug",
  "pilates-hollow-hold",
  "pilates-double-leg-stretch",
  "pilates-hundred",
  "pilates-clam",
  "prone",
  "prone-cobra",
  "pilates-swimming",
  "weak-spine-standing",
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
    exercisePose: decision.exercisePose.poseKey,
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

  it("keeps recorded source frames attached to the game-path simulation", () => {
    const replay = session([frame(withCorePose()), frame(squatPose())]);
    const simulation = buildMovementGamePathSimulation(replay);

    expect(simulation.mirrorMode).toBe("facing-player");
    expect(simulation.sourceFrames).toHaveLength(2);
    expect(simulation.motionFrames).toHaveLength(2);
    expect(simulation.gameplayEvents).toHaveLength(2);
    expect(simulation.sourceFrames[0]?.sourceOrigin).toBe("recorded-replay");
    expect(simulation.sourceFrames[0]?.sourceStatus).toBe("decoded");
    expect(simulation.sourceFrames[0]?.landmarks.pose).toHaveLength(33);
    expect(simulation.sourceFrames[0]?.cameraConfidence.scoreAllowed).toBe(true);
    expect(simulation.sourceFrames[0]?.startReadiness.state).toBe("ready");
    expect(simulation.motionFrames[0]?.source).toBe(simulation.sourceFrames[0]);
    expect(simulation.motionFrames[0]?.mirrorMode).toBe("facing-player");
    expect(simulation.motionFrames[0]?.avatarDecision.lowerLabel).toBe(simulation.decisions[0]?.lowerLabel);
    expect(simulation.gameplayEvents[1]?.scoreAllowed).toBe(true);
    expect(simulation.gameplayEvents[1]?.events.map((event) => event.eventType)).toContain("clear-movement-match");
  });

  it("selects deterministic Game visual parity proof frames from simulation motion", () => {
    const replay = session([
      frame(withCorePose()),
      frame(squatPose()),
      frame(leftKneeLiftPose()),
      frame(weakFeetPose()),
    ]);
    const proofFrames = selectMovementGameVisualParityProofFrames(buildMovementGamePathSimulation(replay));
    const proofCases = proofFrames.flatMap((proofFrame) => proofFrame.cases);

    expect(proofFrames[0]).toMatchObject({
      cases: expect.arrayContaining(["baseline"]),
      frameIndex: 0,
      mirrorMode: "facing-player",
    });
    expect(proofCases).toContain("first-scoring-frame");
    expect(proofCases).toContain("strongest-squat");
    expect(proofCases.some((proofCase) => (
      proofCase === "strongest-left-leg-lift" || proofCase === "strongest-right-leg-lift"
    ))).toBe(true);
    expect(proofFrames.every((proofFrame) => proofFrame.sourceLowerLabel)).toBe(true);
    expect(proofFrames.every((proofFrame) => proofFrame.displayLowerLabel)).toBe(true);
  });

  it("selects Game root-motion frames for focused visual parity capture", () => {
    const replay = session([
      frameWithWorld(withCorePose(), worldHeadingPose(0, { x: 0, z: 0 })),
      frameWithWorld(withCorePose(), worldHeadingPose(0.82, { x: 0.24, z: 0.02 })),
    ]);
    const proofFrames = selectMovementGameVisualParityProofFrames(
      buildMovementGamePathSimulation(replay),
      {
        minRootTravel: 0.01,
        minRootTurnYaw: 0.1,
      },
    );
    const proofCases = proofFrames.flatMap((proofFrame) => proofFrame.cases);

    expect(proofCases).toContain("strongest-root-turn");
    expect(proofCases).toContain("strongest-root-travel");
  });

  it("selects facing/occlusion Game visual parity frames for focused diagnostic capture", () => {
    const proofFrames = selectMovementGameVisualParityProofFrames(
      buildMovementGamePathSimulation(session([
        frameWithWorld(withCorePose(), worldHeadingPose(0, { x: 0, z: 0 })),
        frameWithWorld(withCorePose(), worldHeadingPose(0.9, { x: 0.02, z: 0.01 })),
        frameWithWorld(withCorePose(), worldHeadingPose(-0.1, { x: 0.02, z: 0.01 })),
      ])),
      {
        includeFacingOcclusionTargets: true,
        minRootTurnYaw: 0.3,
      },
    );
    const proofCases = proofFrames.flatMap((proofFrame) => proofFrame.cases);

    expect(proofCases).toContain("strongest-facing-occlusion-recovery");
    expect(proofCases).toContain("strongest-side-swap-recovery");
  });

  it("selects upper-body Game visual parity frames for side bend and head direction", () => {
    const proofFrames = selectMovementGameVisualParityProofFrames(
      buildMovementGamePathSimulation(session([
        frame(withCorePose()),
        frame(sideBendPose()),
        frame(makeMovementAvatarProofPose("head-up")),
      ])),
      {
        minHeadDirection: 0.02,
        minSideBend: 0.12,
      },
    );
    const proofCases = proofFrames.flatMap((proofFrame) => proofFrame.cases);
    const sideBendFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-side-bend")
    ));
    const headDirectionFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-head-direction")
    ));

    expect(proofCases).toContain("strongest-side-bend");
    expect(proofCases).toContain("strongest-head-direction");
    expect(Math.abs(sideBendFrame?.sideBend ?? 0)).toBeGreaterThan(0.12);
    expect(Math.max(
      Math.abs(headDirectionFrame?.headPitch ?? 0),
      Math.abs(headDirectionFrame?.headRoll ?? 0),
      Math.abs(headDirectionFrame?.headYaw ?? 0),
    )).toBeGreaterThan(0.02);
  });

  it("selects standing arm-raise, twist, and reach Game visual parity frames", () => {
    const proofFrames = selectMovementGameVisualParityProofFrames(
      buildMovementGamePathSimulation(session([
        frame(withCorePose()),
        frame(makeMovementAvatarProofPose("standing-arm-raise")),
        frame(makeMovementAvatarProofPose("standing-twist")),
      ])),
      {
        includeStandingUpperBodyTargets: true,
        minStandingTwist: 0.01,
      },
    );
    const proofCases = proofFrames.flatMap((proofFrame) => proofFrame.cases);
    const armRaiseFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-standing-arm-raise")
    ));
    const twistFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-standing-twist")
    ));
    const reachFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-standing-reach")
    ));

    expect(proofCases).toContain("strongest-standing-arm-raise");
    expect(proofCases).toContain("strongest-standing-twist");
    expect(proofCases).toContain("strongest-standing-reach");
    expect(armRaiseFrame?.supportPresentationOwner).toBe("support-presentation-standing-arm-raise");
    expect(twistFrame?.supportPresentationOwner).toBe("support-presentation-standing-twist");
    expect(twistFrame?.supportPresentationMaxSpineTwist ?? 0).toBeGreaterThan(0.45);
    expect(reachFrame?.supportPresentationArmSpecCount ?? 0).toBeGreaterThan(0);
  });

  it("selects seated Game visual parity frames for the first expansion proof handoff", () => {
    const proofFrames = selectMovementGameVisualParityProofFrames(
      buildMovementGamePathSimulation(session([
        frame(makeMovementAvatarProofPose("seated")),
        frame(makeMovementAvatarProofPose("seated-twist")),
        frame(makeMovementAvatarProofPose("seated-forward-fold")),
        frame(makeMovementAvatarProofPose("seated-leg-lift")),
      ])),
      {
        includeSeatedTargets: true,
      },
    );
    const proofCases = proofFrames.flatMap((proofFrame) => proofFrame.cases);
    const chairContactFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-seated-chair-contact")
    ));
    const twistFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-seated-twist")
    ));
    const foldFrame = proofFrames.find((proofFrame) => (
      proofFrame.cases.includes("strongest-seated-forward-fold")
    ));

    expect(proofCases).toContain("strongest-seated-chair-contact");
    expect(proofCases).toContain("strongest-seated-twist");
    expect(proofCases).toContain("strongest-seated-forward-fold");
    expect(proofCases).not.toContain("strongest-seated-leg-lift");
    expect(chairContactFrame?.supportPresentationOwner).toMatch(/^support-presentation-seated/);
    expect(twistFrame?.supportPresentationOwner).toBe("support-presentation-seated-twist");
    expect(foldFrame?.supportPresentationOwner).toBe("support-presentation-seated-forward-fold");
  });

  it("marks the first source/display semantic divergence for visual proof", () => {
    const simulation = buildMovementGamePathSimulation(session([frame(withCorePose())]));
    const motionFrame = simulation.motionFrames[0]!;
    const proofFrames = selectMovementGameVisualParityProofFrames({
      ...simulation,
      motionFrames: [{
        ...motionFrame,
        avatarDisplayDecision: {
          ...motionFrame.avatarDisplayDecision,
          lowerLabel: "squat",
        },
      }],
    });

    expect(proofFrames[0]).toMatchObject({
      cases: expect.arrayContaining(["first-source-display-divergence"]),
      displayLowerLabel: "squat",
      sourceLowerLabel: motionFrame.avatarDecision.lowerLabel,
    });
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

  it.each([
    ["seated", "seated", "chair", "seat:inferred", false, true, "body-orientation-seated", "chair-seated", "seat-chair", "support-presentation-seated"],
    ["seated-twist", "seated", "chair", "seat:inferred", false, true, "body-orientation-seated", "seated-twist", "seat-chair", "support-presentation-seated-twist"],
    ["seated-forward-fold", "seated", "chair", "seat:inferred", false, true, "body-orientation-seated", "seated-forward-fold", "seat-chair", "support-presentation-seated-forward-fold"],
    ["seated-leg-lift", "seated", "chair", "seat:inferred", false, true, "body-orientation-seated", "seated-leg-lift", "feet-floor", "support-presentation-none"],
    ["kneeling", "kneeling", "floor", "leftKnee:active", false, true, "body-orientation-kneeling", "kneeling-floor", "knees-floor", "support-presentation-kneeling"],
    ["half-kneeling", "kneeling", "floor", "leftKnee:active", false, true, "body-orientation-kneeling", "half-kneeling-floor", "knees-floor", "support-presentation-half-kneeling"],
    ["low-lunge", "kneeling", "floor", "leftKnee:active", false, true, "body-orientation-kneeling", "low-lunge-floor", "knees-floor", "support-presentation-low-lunge"],
    ["quadruped", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "tabletop-all-fours", "hands-knees-floor", "support-presentation-all-fours"],
    ["bear-crawl", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "bear-crawl-prep", "hands-feet-floor", "support-presentation-bear-crawl"],
    ["quadruped-bird-dog", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "quadruped-bird-dog-prep", "hands-knees-floor", "support-presentation-bird-dog"],
    ["yoga-child-pose", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "yoga-child-pose-prep", "hands-knees-floor", "support-presentation-child-pose"],
    ["yoga-cat", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "yoga-cat-prep", "hands-knees-floor", "support-presentation-yoga-cat"],
    ["yoga-cow", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "yoga-cow-prep", "hands-knees-floor", "support-presentation-yoga-cow"],
    ["yoga-plank", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "yoga-plank-prep", "hands-feet-floor", "support-presentation-plank"],
    ["yoga-down-dog", "quadruped", "floor", "leftHand:active", true, true, "body-orientation-quadruped", "yoga-down-dog-prep", "hands-feet-floor", "support-presentation-down-dog"],
    ["side-lying", "sideLyingLeft", "floor", "sideBody:inferred", true, true, "body-orientation-side-lying-left", "side-lying-mat", "side-body-floor", "support-presentation-side-lying"],
    ["side-lying-leg-lift", "sideLyingLeft", "floor", "sideBody:inferred", true, true, "body-orientation-side-lying-left", "pilates-side-lying-leg-lift", "side-body-floor", "support-presentation-side-leg-lift"],
    ["pilates-clam", "sideLyingLeft", "floor", "sideBody:inferred", true, true, "body-orientation-side-lying-left", "pilates-clam-prep", "side-body-floor", "support-presentation-clam-prep"],
    ["supine", "supine", "floor", "back:inferred", true, true, "body-orientation-supine", "supine-mat", "back-floor", "support-presentation-supine"],
    ["supine-bridge", "supine", "floor", "back:inferred", true, true, "body-orientation-supine", "pilates-bridge-prep", "back-floor", "support-presentation-bridge"],
    ["pilates-single-leg-stretch", "supine", "floor", "back:inferred", true, true, "body-orientation-supine", "pilates-single-leg-stretch-prep", "back-floor", "support-presentation-single-leg-stretch"],
    ["pilates-dead-bug", "supine", "floor", "back:inferred", true, true, "body-orientation-supine", "pilates-dead-bug-prep", "back-floor", "support-presentation-dead-bug"],
    ["pilates-hollow-hold", "supine", "floor", "back:inferred", true, true, "body-orientation-supine", "pilates-hollow-hold-prep", "back-floor", "support-presentation-hollow-hold"],
    ["pilates-double-leg-stretch", "supine", "floor", "back:inferred", true, true, "body-orientation-supine", "pilates-double-leg-stretch-prep", "back-floor", "support-presentation-double-leg-stretch"],
    ["pilates-hundred", "supine", "floor", "back:inferred", true, true, "body-orientation-supine", "pilates-hundred-prep", "back-floor", "support-presentation-hundred-prep"],
    ["prone", "prone", "floor", "chest:inferred", true, true, "body-orientation-prone", "prone-mat", "chest-floor", "support-presentation-prone"],
    ["prone-cobra", "prone", "floor", "chest:inferred", true, true, "body-orientation-prone", "prone-back-extension-prep", "chest-floor", "support-presentation-prone-extension"],
    ["pilates-swimming", "prone", "floor", "chest:inferred", true, true, "body-orientation-prone", "pilates-swimming-prep", "chest-floor", "support-presentation-swimming-prep"],
  ] as const)(
    "classifies deterministic %s proof payload orientation and support",
    (
      mode,
      orientation,
      primarySurface,
      supportPart,
      rootShouldApply,
      rootShouldApplyHeight,
      rootOwner,
      exercisePoseKey,
      supportIntentKey,
      supportPresentationOwner,
    ) => {
      const proofPayload = makeMovementAvatarProofMotionPayload(mode);
      const calibration = buildMovementCalibration({
        poseLandmarks: makeMovementAvatarProofMotionPayload("standing").landmarks,
      });
      const decision = resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration,
        retargetSourceModel: null,
        source: {
          hands: proofPayload.hands,
          poseLandmarks: proofPayload.landmarks,
        },
      });

      expect(decision.bodyOrientation.orientation).toBe(orientation);
      expect(decision.bodyOrientation.status).toBe("approximate");
      expect(decision.bodySupport.primarySurface).toBe(primarySurface);
      expect(decision.bodySupport.supportLabel).toContain(supportPart);
      expect(decision.rootOrientation.shouldApply).toBe(rootShouldApply);
      expect(decision.rootOrientation.shouldApplyHeight).toBe(rootShouldApplyHeight);
      expect(decision.rootOrientation.targetHeightDrop).toBeGreaterThan(0.45);
      expect(decision.rootOrientation.owner).toBe(rootOwner);
      expect(decision.exercisePose.poseKey).toBe(exercisePoseKey);
      expect(decision.exercisePose.status).toBe("diagnostic-only");
      expect(decision.supportIntent.key).toBe(supportIntentKey);
      if (supportPresentationOwner === "support-presentation-none") {
        expect(decision.supportConstraint.status).toBe("active");
        expect(decision.supportContactLocks.shouldApply).toBe(false);
        expect(decision.supportContactLocks.anchors).toEqual([]);
      } else {
        expect(decision.supportConstraint.status).toBe("partial-contact-correction");
        expect(decision.supportContactLocks.shouldApply).toBe(true);
        expect(decision.supportContactLocks.anchors.length).toBeGreaterThan(0);
      }
      expect(decision.supportPresentation.owner).toBe(supportPresentationOwner);
      if (supportPresentationOwner === "support-presentation-none") {
        expect(decision.supportPresentation.shouldApply).toBe(false);
        expect(decision.supportPresentation.specs).toEqual([]);
        expect(decision.supportPresentation.armSpecs).toEqual([]);
        expect(decision.supportPresentation.spineSpecs).toEqual([]);
      } else {
        expect(decision.supportPresentation.shouldApply).toBe(true);
        expect(decision.supportPresentation.specs.length).toBeGreaterThanOrEqual(6);
        expect(decision.supportPresentation.armSpecs.length).toBeGreaterThan(0);
        expect(decision.supportPresentation.spineSpecs.length).toBeGreaterThan(0);
      }
      expect(decision.spineDrive.shouldApplySpine).toBe(false);
    },
  );

  it("carries standing and seated transitions through the game-path simulation", () => {
    const standingPayload = makeMovementAvatarProofMotionPayload("standing");
    const seatedPayload = makeMovementAvatarProofMotionPayload("seated");
    const simulation = buildMovementGamePathSimulation(session([
      frame(standingPayload.landmarks),
      frame(seatedPayload.landmarks),
      frame(standingPayload.landmarks),
    ]));

    expect(simulation.decisions[0]?.exerciseTransition.key).toBe("stable-upright");
    expect(simulation.decisions[1]?.exerciseTransition.key).toBe("standing-to-seated");
    expect(simulation.decisions[2]?.exerciseTransition.key).toBe("seated-to-standing");
  });

  it("carries floor-entry and floor-variation transitions through the game-path simulation", () => {
    const kneelingPayload = makeMovementAvatarProofMotionPayload("kneeling");
    const quadrupedPayload = makeMovementAvatarProofMotionPayload("quadruped");
    const supinePayload = makeMovementAvatarProofMotionPayload("supine");
    const bridgePayload = makeMovementAvatarProofMotionPayload("supine-bridge");
    const pronePayload = makeMovementAvatarProofMotionPayload("prone");
    const simulation = buildMovementGamePathSimulation(session([
      frame(kneelingPayload.landmarks),
      frame(quadrupedPayload.landmarks),
      frame(supinePayload.landmarks),
      frame(bridgePayload.landmarks),
      frame(pronePayload.landmarks),
    ]));

    expect(simulation.decisions[0]?.exerciseTransition.key).toBe("stable-kneeling");
    expect(simulation.decisions[1]?.exerciseTransition.key).toBe("kneeling-to-floor");
    expect(simulation.decisions[2]?.exerciseTransition.key).toBe("quadruped-to-floor");
    expect(simulation.decisions[3]?.exerciseTransition.key).toBe("floor-variation");
    expect(simulation.decisions[4]?.exerciseTransition.key).toBe("floor-roll");
  });

  it("carries seated, kneeling, yoga, and pilates transitions through the game-path simulation", () => {
    const seatedPayload = makeMovementAvatarProofMotionPayload("seated");
    const seatedTwistPayload = makeMovementAvatarProofMotionPayload("seated-twist");
    const kneelingPayload = makeMovementAvatarProofMotionPayload("kneeling");
    const halfKneelingPayload = makeMovementAvatarProofMotionPayload("half-kneeling");
    const lowLungePayload = makeMovementAvatarProofMotionPayload("low-lunge");
    const quadrupedPayload = makeMovementAvatarProofMotionPayload("quadruped");
    const bearCrawlPayload = makeMovementAvatarProofMotionPayload("bear-crawl");
    const birdDogPayload = makeMovementAvatarProofMotionPayload("quadruped-bird-dog");
    const plankPayload = makeMovementAvatarProofMotionPayload("yoga-plank");
    const downDogPayload = makeMovementAvatarProofMotionPayload("yoga-down-dog");
    const childPosePayload = makeMovementAvatarProofMotionPayload("yoga-child-pose");
    const supinePayload = makeMovementAvatarProofMotionPayload("supine");
    const hundredPayload = makeMovementAvatarProofMotionPayload("pilates-hundred");
    const bridgePayload = makeMovementAvatarProofMotionPayload("supine-bridge");
    const simulation = buildMovementGamePathSimulation(session([
      frame(seatedPayload.landmarks),
      frame(seatedTwistPayload.landmarks),
      frame(kneelingPayload.landmarks),
      frame(halfKneelingPayload.landmarks),
      frame(lowLungePayload.landmarks),
      frame(quadrupedPayload.landmarks),
      frame(bearCrawlPayload.landmarks),
      frame(birdDogPayload.landmarks),
      frame(plankPayload.landmarks),
      frame(downDogPayload.landmarks),
      frame(childPosePayload.landmarks),
      frame(supinePayload.landmarks),
      frame(hundredPayload.landmarks),
      frame(bridgePayload.landmarks),
    ]));

    expect(simulation.decisions.map((decision) => decision?.exerciseTransition.key)).toEqual([
      "stable-seated",
      "seated-variation",
      "seated-to-kneeling",
      "kneeling-variation",
      "kneeling-variation",
      "kneeling-to-floor",
      "quadruped-variation",
      "quadruped-variation",
      "quadruped-to-plank",
      "plank-to-down-dog",
      "quadruped-variation",
      "quadruped-to-floor",
      "floor-variation",
      "floor-variation",
    ]);
  });

  it("drives deterministic root-turn proof through game-path root motion", () => {
    const baselinePayload = makeMovementAvatarProofRootBaselinePayload();
    const turnPayload = makeMovementAvatarProofMotionPayload("root-turn-left");
    const simulation = buildMovementGamePathSimulation(session([
      frameWithWorld(baselinePayload.landmarks, baselinePayload.worldLandmarks),
      frameWithWorld(turnPayload.landmarks, turnPayload.worldLandmarks),
    ]));
    const gamePathDecision = simulation.decisions[1];

    expect(gamePathDecision?.rootMotion.debug.source).toBe("world-landmarks");
    expect(Math.abs(gamePathDecision?.rootMotion.headingYaw ?? 0)).toBeCloseTo(Math.PI, 2);
    expect(gamePathDecision?.rootMotion.intent.key).toBe("turn-on-spot");
    expect(gamePathDecision?.rootMotion.headingConfidence).toBeGreaterThan(0.8);
    expect(simulation.rootMotion.summary.maxYawDelta).toBeCloseTo(Math.PI, 2);
    expect(simulation.rootMotion.summary.sourceLimitedFrameCount).toBe(0);
  });

  it("drives deterministic root-travel proof through game-path root motion", () => {
    const baselinePayload = makeMovementAvatarProofRootBaselinePayload();
    const travelPayload = makeMovementAvatarProofMotionPayload("root-travel-right");
    const simulation = buildMovementGamePathSimulation(session([
      frameWithWorld(baselinePayload.landmarks, baselinePayload.worldLandmarks),
      frameWithWorld(travelPayload.landmarks, travelPayload.worldLandmarks),
    ]));
    const gamePathDecision = simulation.decisions[1];

    expect(gamePathDecision?.rootMotion.debug.source).toBe("world-landmarks");
    expect(gamePathDecision?.rootMotion.headingYaw).toBeCloseTo(0, 2);
    expect(gamePathDecision?.rootMotion.intent.key).toBe("root-travel");
    expect(gamePathDecision?.rootMotion.intent.travelDirection).toBe("left");
    expect(gamePathDecision?.rootMotion.rootPosition.x).toBeLessThan(-0.5);
    expect(gamePathDecision?.rootMotion.rootPosition.z).toBeGreaterThan(0.18);
    expect(gamePathDecision?.rootMotion.rootPositionConfidence).toBeGreaterThan(0.8);
    expect(Math.hypot(
      gamePathDecision?.rootMotion.rootPosition.x ?? 0,
      gamePathDecision?.rootMotion.rootPosition.z ?? 0,
    )).toBeGreaterThan(0.6);
    expect(simulation.rootMotion.summary.sourceLimitedFrameCount).toBe(0);
  });

  it.each([
    {
      mode: "root-travel-left" as const,
      expected: { axis: "x" as const, sign: 1 },
    },
    {
      mode: "root-travel-forward" as const,
      expected: { axis: "z" as const, sign: 1 },
    },
    {
      mode: "root-travel-back" as const,
      expected: { axis: "z" as const, sign: -1 },
    },
  ])(
    "drives deterministic %s proof through game-path root motion",
    ({ mode, expected }) => {
      const baselinePayload = makeMovementAvatarProofRootBaselinePayload();
      const travelPayload = makeMovementAvatarProofMotionPayload(mode);
      const simulation = buildMovementGamePathSimulation(session([
        frameWithWorld(baselinePayload.landmarks, baselinePayload.worldLandmarks),
        frameWithWorld(travelPayload.landmarks, travelPayload.worldLandmarks),
      ]));
      const gamePathDecision = simulation.decisions[1];
      const signedTravel = gamePathDecision?.rootMotion.rootPosition[expected.axis] ?? 0;

      expect(gamePathDecision?.rootMotion.debug.source).toBe("world-landmarks");
      expect(gamePathDecision?.rootMotion.headingYaw).toBeCloseTo(0, 2);
      expect(gamePathDecision?.rootMotion.intent.key).toBe("root-travel");
      expect(Math.sign(signedTravel)).toBe(expected.sign);
      expect(Math.abs(signedTravel)).toBeGreaterThan(0.5);
      expect(gamePathDecision?.rootMotion.rootPositionConfidence).toBeGreaterThan(0.8);
      expect(simulation.rootMotion.summary.sourceLimitedFrameCount).toBe(0);
    },
  );

  it("drives deterministic right-turn proof through game-path root motion", () => {
    const baselinePayload = makeMovementAvatarProofRootBaselinePayload();
    const turnPayload = makeMovementAvatarProofMotionPayload("root-turn-right");
    const simulation = buildMovementGamePathSimulation(session([
      frameWithWorld(baselinePayload.landmarks, baselinePayload.worldLandmarks),
      frameWithWorld(turnPayload.landmarks, turnPayload.worldLandmarks),
    ]));
    const gamePathDecision = simulation.decisions[1];

    expect(gamePathDecision?.rootMotion.debug.source).toBe("world-landmarks");
    expect(gamePathDecision?.rootMotion.intent.key).toBe("turn-on-spot");
    expect(gamePathDecision?.rootMotion.headingYaw).toBeGreaterThan(1.2);
    expect(gamePathDecision?.rootMotion.headingYaw).toBeLessThan(1.9);
    expect(gamePathDecision?.rootMotion.headingConfidence).toBeGreaterThan(0.8);
    expect(simulation.rootMotion.summary.sourceLimitedFrameCount).toBe(0);
  });

  it("drives deterministic turn-and-travel proof through game-path root motion", () => {
    const baselinePayload = makeMovementAvatarProofRootBaselinePayload();
    const turnTravelPayload = makeMovementAvatarProofMotionPayload("root-turn-travel");
    const simulation = buildMovementGamePathSimulation(session([
      frameWithWorld(baselinePayload.landmarks, baselinePayload.worldLandmarks),
      frameWithWorld(turnTravelPayload.landmarks, turnTravelPayload.worldLandmarks),
    ]));
    const gamePathDecision = simulation.decisions[1];

    expect(gamePathDecision?.rootMotion.debug.source).toBe("world-landmarks");
    expect(gamePathDecision?.rootMotion.intent.key).toBe("turn-and-travel");
    expect(gamePathDecision?.rootMotion.headingYaw).toBeLessThan(-1.2);
    expect(gamePathDecision?.rootMotion.headingYaw).toBeGreaterThan(-1.9);
    expect(gamePathDecision?.rootMotion.rootPosition.x).toBeLessThan(-0.5);
    expect(gamePathDecision?.rootMotion.rootPosition.z).toBeGreaterThan(0.18);
    expect(gamePathDecision?.rootMotion.rootPositionConfidence).toBeGreaterThan(0.8);
    expect(simulation.rootMotion.summary.sourceLimitedFrameCount).toBe(0);
  });

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
      const preparedProofPayload = prepareVrmSolverInput({
        rawLandmarks: proofPayload.landmarks,
        payload: { hands: proofPayload.hands },
        isPlayer: true,
        isPlaying: true,
        mirrorForDisplay: true,
      });

      const studioDecision = resolveMovementAvatarStudioDecision({
        avatarRole: "player",
        calibration: simulation.calibration,
        retargetSourceModel: simulation.retargetSourceModel,
        source: {
          hands: preparedProofPayload.rigHands,
          poseLandmarks: preparedProofPayload.imageLandmarks,
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
    expect(enteringDecision.instructorSquatPresentationDepth).toBeGreaterThanOrEqual(0.18);
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
    expect(appliedDecision.feetOwner).toBe("player-foot-fallback");
    expect(appliedDecision.shouldUsePlayerFootFallback).toBe(true);
    expect(appliedDecision.hasCompleteLegRetarget).toBe(true);
  });

  it("keeps player leg-raise feet planted instead of handing them to recorded retarget", () => {
    const calibration = buildMovementCalibration({ poseLandmarks: withCorePose() });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: withCorePose() });
    const pipelineDecision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel,
      source: { poseLandmarks: leftKneeLiftPose() },
    });
    const appliedDecision = resolveMovementAvatarAppliedLowerBodyDecision({
      appliedFootSegments: 2,
      appliedLegSegments: 4,
      appliedLowerBodySegments: 6,
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

    expect(pipelineDecision.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(true);
    expect(appliedDecision.lowerBodyOwner).toBe("player-retarget");
    expect(appliedDecision.feetOwner).toBe("player-leg-raise-planted-flat");
    expect(appliedDecision.feetOwner).not.toBe("recorded-retarget");
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

  it("keeps strong player leg raises anchored even when retarget has enough leg segments", () => {
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
      playerRetargetLowerBodyMotion: 0.72,
      sourceOwnerDecision: {
        ...pipelineDecision.lowerBodyOwnerDecision!,
        canUsePlayerRetargetLegRaise: true,
        lowerBodyOwner: "player-retarget",
      },
      shouldHoldPlayerSquatPose: false,
    });

    expect(stageDecision.stage).toBe("player-leg-raise");
    expect(stageDecision.canUsePlayerRetargetLegRaise).toBe(true);
    expect(stageDecision.anchoredPlayerLegRaiseSide).toBe("left");
    expect(stageDecision.lowerBodyOwner).toBe("player-left-leg-raise");
    expect(stageDecision.feetOwner).toBe("player-leg-raise-planted-flat");
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

  it("keeps recorded foot retargeting active while contact handling owns the plant", () => {
    const decision = resolveMovementAvatarRetargetSegmentApplication({
      avatarRole: "instructor",
      instructorSquatPresentationDepth: 0.3,
      lowerBodySegmentMotion: 0.3,
      retargetFrame: retargetFrame({
        contacts: { leftFoot: true, rightFoot: false },
        kneeLift: { left: 0.7, right: 0 },
      }),
      segmentName: "leftFoot",
      segmentType: "foot",
    });

    expect(decision).toMatchObject({
      reason: "active",
      shouldApply: true,
      zScale: 0.18,
    });
  });

  it("allows recorded foot retargeting for lifted active feet", () => {
    const decision = resolveMovementAvatarRetargetSegmentApplication({
      avatarRole: "instructor",
      instructorSquatPresentationDepth: 0.3,
      lowerBodySegmentMotion: 0.3,
      retargetFrame: retargetFrame({
        kneeLift: { left: 0.7, right: 0 },
        space: "world",
      }),
      segmentName: "leftFoot",
      segmentType: "foot",
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
      instructorSquatPresentationDepth: 0,
      lowerBodySegmentMotion: 0,
      profile,
      retargetFrame: retargetFrame(),
      segmentName: "rightUpperArm",
      segmentType: "arm",
    });
    const legDecision = resolveMovementAvatarRetargetSegmentApplication({
      avatarRole: "player",
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
    });

    // Arms use the unified segment slerp; only legs remain profile-tuned.
    expect(rightArmDecision.slerp).toBe(0.72);
    expect(legDecision.slerp).toBe(0.43);
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

  it("derives presentation squat drop from rig leg length when measured", () => {
    const drive = {
      ...debugLowerBodyIntent,
      groundedSquatDepth: 0,
      liveSquatDepth: 0,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "neutral" as const,
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: false,
      visualRootDrop: 0,
    };

    const derived = resolveMovementAvatarHipsPositionOptions({
      avatarRole: "instructor",
      lowerBodyDrive: drive,
      rigMeasurements: { legLength: 0.708 },
    });
    expect(derived.squatHipDropScale).toBeCloseTo(0.708 * 0.54);
    expect(derived.squatHipDropLimit).toBeCloseTo(0.708 * 0.59);

    const fallback = resolveMovementAvatarHipsPositionOptions({
      avatarRole: "instructor",
      lowerBodyDrive: drive,
      rigMeasurements: null,
    });
    expect(fallback.squatHipDropScale).toBeCloseTo(0.38);
    expect(fallback.squatHipDropLimit).toBeCloseTo(0.42);
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
    expect(resolveMovementAvatarHipsPositionOptions({
      avatarRole: "player",
      lowerBodyDrive: {
        groundedSquatDepth: 0,
        liveSquatDepth: 0,
        playerLegRaiseDepth: 0.72,
        playerLegRaiseSide: "left",
        playerLowerBodyState: "left-leg-raise",
        playerSquatPresentationDepth: 0,
        shouldApplyLowerBody: true,
        shouldApplySolverTorso: true,
        shouldDrivePlayerLegRaise: true,
        shouldDrivePlayerSquat: false,
        visualRootDrop: 0,
      },
    }).floorContactCorrectionScale).toBe(0);
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
      lowerBodyNeutralSlerp: 0.12,
      singleLegRaiseSlerp: 0.72,
      squatFlexionSlerp: 0.84,
    });
    expect(resolveMovementAvatarBoneEaseOptions({ avatarRole: "instructor" })).toEqual({
      armRelaxedSlerp: 0.1,
      demoFallbackSlerp: 0.12,
      lowerBodyNeutralSlerp: 0.08,
      singleLegRaiseSlerp: 0.58,
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
    expect(specs[2]!.slerp).toBeCloseTo(0.5904);
    expect(specs[3]).toMatchObject({
      rotation: { x: 0, y: 0, z: 0 },
      slerp: 0.28,
    });
    expect(resolveMovementAvatarSingleLegRaisePose({
      depth: 0.05,
      side: "right",
      slerp: 0.72,
    })).toEqual([]);
    expect(resolveMovementAvatarSingleLegRaisePose({
      depth: 0.47,
      side: "left",
      slerp: 0.72,
    })[0]!.rotation.x).toBeGreaterThan(0.45);
    expect(resolveMovementAvatarSingleLegRaisePose({
      depth: 0.334,
      side: "right",
      slerp: 0.72,
    })[0]!.rotation.x).toBeGreaterThan(1.2);
    expect(resolveMovementAvatarSingleLegRaisePose({
      depth: 0.49,
      lowerLegBoost: 0.08,
      side: "right",
      slerp: 0.72,
      upperLegBoost: 0.18,
    })[0]!.rotation.x).toBeGreaterThan(1.25);
    expect(Math.abs(resolveMovementAvatarSingleLegRaisePose({
      depth: 0.49,
      side: "right",
      slerp: 0.72,
    })[0]!.rotation.z)).toBeGreaterThan(0.3);
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
        chest: 0.76,
        hips: 0.34,
        spine: 0.78,
        upperChest: 0.68,
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

    expect(resolveMovementAvatarActiveSpinePose({
      spineApplyOptions: playerOptions,
      spineDrive: {
        confidence: 0.9,
        forwardLean: 0.2,
        owner: "player-spine-model",
        rotations: {
          chest: { x: 0.3, y: 0.04, z: 0.02 },
          hips: { x: 0.1, y: 0.02, z: 0.01 },
          spine: { x: 0.2, y: 0.03, z: 0.015 },
          upperChest: { x: 0.25, y: 0.035, z: 0.018 },
        },
        shouldApplySpine: true,
        sideBend: 0.1,
        twist: 0.05,
      },
    })).toEqual([
      { bone: "hips", rotation: { x: 0.1, y: 0.02, z: 0.01 }, slerp: 0.34 },
      { bone: "spine", rotation: { x: 0.2, y: 0.03, z: 0.015 }, slerp: 0.78 },
      { bone: "chest", rotation: { x: 0.3, y: 0.04, z: 0.02 }, slerp: 0.76 },
      { bone: "upperChest", rotation: { x: 0.25, y: 0.035, z: 0.018 }, slerp: 0.68 },
    ]);

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

  it("keeps player and replay VRM bone pitch in the same direction", () => {
    expect(resolveMovementAvatarHeadBonePitch({
      avatarRole: "player",
      headPitch: 0.34,
    })).toBeCloseTo(0.34);
    expect(resolveMovementAvatarHeadBonePitch({
      avatarRole: "instructor",
      headPitch: 0.34,
    })).toBeCloseTo(0.34);
  });

  it("mirrors live player head yaw and roll while preserving pitch", () => {
    const sourceHead = {
      confidence: 0.9,
      pitch: 0.24,
      roll: -0.18,
      source: "face" as const,
      yaw: 0.42,
    };

    expect(resolveMovementAvatarMirrorHeadForDisplay({
      avatarRole: "player",
      head: sourceHead,
    })).toEqual({
      ...sourceHead,
      roll: 0.18,
      yaw: -0.42,
    });
    expect(resolveMovementAvatarMirrorHeadForDisplay({
      avatarRole: "instructor",
      head: sourceHead,
    })).toBe(sourceHead);
  });

  it("keeps moderate pose-only player head yaw facing forward", () => {
    const decision = resolveMovementAvatarHeadDecision({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: withCorePose() }),
      headMotionIntent: neutralHeadMotion,
      mirrorHeadForDisplay: false,
      rawHead: {
        confidence: 0.95,
        pitch: 0,
        roll: 0,
        source: "pose",
        yaw: 0.42,
      },
    });

    expect(decision.appliedHead.yaw).toBe(0);
    expect(decision.headYaw).toBe(0);
  });

  it("preserves strong pose-only player head yaw direction after damping", () => {
    const decision = resolveMovementAvatarHeadDecision({
      avatarRole: "player",
      calibration: buildMovementCalibration({ poseLandmarks: withCorePose() }),
      headMotionIntent: neutralHeadMotion,
      mirrorHeadForDisplay: false,
      rawHead: {
        confidence: 0.95,
        pitch: 0,
        roll: 0,
        source: "pose",
        yaw: 0.75,
      },
    });

    expect(decision.appliedHead.yaw).toBeGreaterThan(0);
    expect(decision.appliedHead.yaw).toBeLessThan(0.2);
    expect(Math.sign(decision.appliedHead.yaw)).toBe(Math.sign(decision.headYaw));
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
      lowerBodyTrackingReady: true,
      retargetFrame: retargetFrame({
        contacts: {
          leftFoot: true,
          rightFoot: false,
        },
      }),
      shouldApplyLowerBody: neutralDecision.shouldApplyLowerBody,
      shouldLockActiveTorso: true,
    })).toEqual({ shouldEngage: true });
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
      armApplicationModes: { left: "hold-last-good" as const, right: "retargeted" as const },
      avatarRole: "player",
      bodyConfidence: { leftFoot: 0.8, rightFoot: 0.2 },
      feetOwner: "player-retarget",
      hasActiveCalibration: true,
      hasManualCalibration: true,
      headMotionIntent: neutralHeadMotion,
      headOwner: "player-calibrated",
      leftFootSource: "pose-foot",
      leftKneeSource: "pose-knee",
      lowerBodyIntent: debugLowerBodyIntent,
      lowerBodyOwner: "player-stable-squat",
      lowerBodyTrackingReady: true,
      rawHead: { confidence: 0.9, pitch: 0, roll: 0, source: "pose", yaw: 0 },
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
      leftArm: "last-good",
      lowerBody: "squat d0.34 h0.22 k0.31 t0.18 l0.12 r0.08",
      owners: "head player-calibrated; torso player-spine-model; lower player-stable-squat; feet player-retarget",
      rightArm: "retargeted-arm",
    });
  });

  it("formats auto-calibrated player tracking fallback labels", () => {
    const labels = resolveMovementAvatarTrackingFallbackLabels({
      activeSpineOwner: "player-spine-neutral",
      armApplicationModes: { left: "hold-last-good" as const, right: "retargeted" as const },
      autoCalibrationKind: "upper-body",
      avatarRole: "player",
      bodyConfidence: { leftFoot: 0.1, rightFoot: 0.1 },
      feetOwner: "neutral",
      hasActiveCalibration: true,
      hasManualCalibration: false,
      headMotionIntent: { ...neutralHeadMotion, label: "mixed-head" },
      headOwner: "neutral",
      leftFootSource: "toe",
      leftKneeSource: "knee",
      lowerBodyIntent: debugLowerBodyIntent,
      lowerBodyOwner: "neutral",
      lowerBodyTrackingReady: true,
      rawHead: { confidence: 0.1, pitch: 0, roll: 0, source: "pose", yaw: 0 },
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
      armApplicationModes: { left: "hold-last-good" as const, right: "retargeted" as const },
      avatarRole: "instructor",
      bodyConfidence: { leftFoot: 0.6, rightFoot: 0.7 },
      feetOwner: "recorded-retarget",
      hasActiveCalibration: false,
      hasManualCalibration: false,
      headMotionIntent: neutralHeadMotion,
      headOwner: "recorded-face",
      leftFootSource: "toe",
      leftKneeSource: "knee",
      lowerBodyIntent: debugLowerBodyIntent,
      lowerBodyOwner: "recorded-retarget",
      lowerBodyTrackingReady: true,
      rawHead: { confidence: 0.7, pitch: 0, roll: 0, source: "face", yaw: 0 },
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

    expect(appliedDecision.lowerBodyOwner).toBe("neutral-fallback");
    expect(appliedDecision.feetOwner).toBe("neutral");
    expect(appliedDecision.hasCompleteLegRetarget).toBe(false);
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

  it("uses high-confidence recorded pose head ownership for instructor replay frames", () => {
    const decision = resolveMovementAvatarHeadDecision({
      avatarRole: "instructor",
      calibration: null,
      headMotionIntent: neutralHeadMotion,
      rawHead: {
        confidence: 0.8,
        pitch: 0.2,
        roll: 0.1,
        source: "pose",
        yaw: 1.29,
      },
    });

    expect(decision.headOwner).toBe("recorded-pose");
    expect(decision.shouldApplyHeadMotion).toBe(true);
    expect(decision.shouldApplyPlayerHeadMotion).toBe(false);
    expect(decision.appliedHead.yaw).toBeGreaterThan(0.08);
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

  it("carries root-motion heading and path through the game path simulation", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(worldHeadingPose(0)),
      frame(worldHeadingPose(Math.PI / 2, { x: 0.24, z: 0.18 })),
    ]));

    const decision = simulation.decisions[1];

    expect(simulation.rootMotion.summary.worldLandmarkFrameCount).toBe(2);
    expect(decision?.rootMotion.debug.source).toBe("world-landmarks");
    expect(decision?.rootMotion.headingYaw).toBeCloseTo(-Math.PI / 2, 2);
    expect(Math.hypot(
      decision?.rootMotion.rootPosition.x ?? 0,
      decision?.rootMotion.rootPosition.z ?? 0,
    )).toBeGreaterThan(0.25);
    expect(decision?.rootMotion.rootPositionConfidence).toBeGreaterThan(0.8);
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
    expect(squatDecision?.lowerBodyDrive.visualRootDrop).toBeGreaterThan(1.5);
    expect(squatDecision?.lowerBodyDrive.visualRootDrop).toBeLessThanOrEqual(1.72);
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

    expect(kneeDecision?.lowerBodyIntent.label).toBe("right-knee-raise");
    expect(kneeDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(kneeDecision?.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(true);
    expect(kneeDecision?.retarget.squatDepth).toBe(0);
    expect(kneeDecision?.lowerBodyDrive.visualRootDrop).toBe(0);
  });

  it("drives visible live side-bend while keeping the pelvis level", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(sideBendPose()),
    ]));

    const sideBendDecision = simulation.decisions[1];
    expect(sideBendDecision?.spineDrive.owner).toBe("player-spine-model");
    expect(sideBendDecision?.spineDrive.shouldApplySpine).toBe(true);
    expect(sideBendDecision?.spineDrive.sideBend).toBeLessThan(-0.4);
    expect(sideBendDecision?.spineDrive.rotations.hips.z).toBe(0);
    expect(Math.abs(sideBendDecision?.spineDrive.rotations.spine.z ?? 0)).toBeGreaterThan(0.2);
    expect(Math.abs(sideBendDecision?.spineDrive.rotations.chest.z ?? 0)).toBeGreaterThan(0.42);
    expect(Math.abs(sideBendDecision?.spineDrive.rotations.chest.z ?? 0)).toBeLessThan(0.45);
    expect(Math.abs(sideBendDecision?.spineDrive.rotations.chest.x ?? 0)).toBeLessThan(0.01);
    expect(Math.abs(sideBendDecision?.spineDrive.rotations.upperChest.x ?? 0)).toBeLessThan(0.01);
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

  it("uses a player foot fallback when side-leg retarget moves but foot segments are missing", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(sideReachWithoutFootSegmentsPose()),
    ]));

    const sideReachDecision = simulation.decisions[1];

    expect(sideReachDecision?.lowerBodyIntent.label).toBe("right-knee-raise");
    expect(sideReachDecision?.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(true);
    expect(sideReachDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(false);
    expect(sideReachDecision?.retarget.lowerBodySegmentMotion).toBeGreaterThan(0.16);
    expect(sideReachDecision?.lowerOwner).toBe("player-right-leg-raise");
    expect(sideReachDecision?.feetOwner).toBe("player-foot-fallback");
  });

  it("keeps live leg raises active when feet are clipped but hips and knees are in frame", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(clippedFeetPose(leftKneeLiftPose())),
    ]));

    const clippedLegDecision = simulation.decisions[1];

    expect(clippedLegDecision?.lowerBodyTrackingReady).toBe(true);
    expect(clippedLegDecision?.lowerBodyIntent.label).toBe("right-knee-raise");
    expect(clippedLegDecision?.lowerBodyDrive.shouldDrivePlayerLegRaise).toBe(true);
    expect(clippedLegDecision?.lowerOwner).toContain("leg-raise");
  });

  it("keeps live squats active when feet are clipped but hips and knees are in frame", () => {
    const simulation = buildMovementGamePathSimulation(session([
      frame(withCorePose()),
      frame(clippedFeetPose(squatPose())),
    ]));

    const clippedSquatDecision = simulation.decisions[1];

    expect(clippedSquatDecision?.lowerBodyTrackingReady).toBe(true);
    expect(clippedSquatDecision?.lowerBodyIntent.label).toBe("squat");
    expect(clippedSquatDecision?.lowerBodyDrive.shouldDrivePlayerSquat).toBe(true);
    expect(clippedSquatDecision?.lowerOwner).toBe("player-stable-squat");
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
