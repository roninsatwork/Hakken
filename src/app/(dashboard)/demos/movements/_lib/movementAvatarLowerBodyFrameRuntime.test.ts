import { describe, expect, it, vi } from "vitest";
import { applyMovementAvatarLowerBodyFrameRuntime } from "./movementAvatarLowerBodyFrameRuntime";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import type {
  MovementAvatarLowerBodyApplicationStageDecision,
} from "./movementAvatarPipeline";
import type { MovementAvatarLowerBodyTargetDecision } from "./movementAvatarTarget";
import type { MovementRetargetFrame } from "./movementRetargeting";

function drive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
  return {
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
    ...overrides,
  };
}

function stage(
  stageName: MovementAvatarLowerBodyApplicationStageDecision["stage"],
  overrides: Partial<MovementAvatarLowerBodyApplicationStageDecision> = {},
): MovementAvatarLowerBodyApplicationStageDecision {
  return {
    anchoredPlayerLegRaiseSide: null,
    canUsePlayerRetargetLegRaise: false,
    feetOwner: `${stageName}-feet`,
    lowerBodyOwner: `${stageName}-owner`,
    stage: stageName,
    ...overrides,
  };
}

function target(
  stageDecision: MovementAvatarLowerBodyApplicationStageDecision | null,
  overrides: Partial<MovementAvatarLowerBodyTargetDecision> = {},
): MovementAvatarLowerBodyTargetDecision {
  return {
    feetOwner: "target-feet",
    inactiveDecision: null,
    instructorLowerBodyMotion: 0,
    lowerBodyOwner: "target-owner",
    playerSourceOwner: {
      lowerBodyOwnerDecision: null,
      playerRetargetLowerBodyMotion: 0,
    },
    playerSquatPresentationDepth: 0,
    recordedSquatPresentationDepth: 0,
    shouldHoldPlayerSquatPose: false,
    stageDecision,
    ...overrides,
  };
}

function retargetFrame(overrides: Partial<MovementRetargetFrame> = {}): MovementRetargetFrame {
  return {
    contacts: {
      leftFoot: true,
      rightFoot: true,
    },
    debug: {
      heldSegments: [],
      solvedSegments: ["leftThigh", "leftShin", "rightThigh", "rightShin"],
      sourceQuality: 0.9,
    },
    hipDrop: 0,
    kneeLift: {
      left: 0,
      right: 0,
    },
    segments: {},
    squatDepth: 0,
    ...overrides,
  };
}

const boneEaseOptions = {
  lowerBodyNeutralSlerp: 1,
  singleLegRaiseSlerp: 1,
  solvedLowerBodySlerp: 1,
  squatFlexionSlerp: 1,
};

function applyRuntime(
  overrides: Partial<Parameters<typeof applyMovementAvatarLowerBodyFrameRuntime>[0]> = {},
) {
  return applyMovementAvatarLowerBodyFrameRuntime({
    applyPlantedSquatIk: (depth) => depth,
    applyRetargetMappings: () => ({
      applied: 0,
      feet: 0,
      legs: 0,
    }),
    avatarRole: "player",
    balancedPlantedSquatDepth: 0,
    boneEaseOptions,
    currentFeetOwner: "neutral",
    currentLowerBodyOwner: "neutral",
    instructorSquatPresentationDepth: 0,
    lookupBone: () => null,
    lowerBodyDrive: drive(),
    lowerBodySegmentMotion: 0,
    lowerBodyTarget: target(null),
    lowerBodyTrackingReady: true,
    playerRetargetLowerBodyMotion: 0,
    playerSquatPresentationDepth: 0,
    recordedLowerBodySourceReliable: true,
    retargetFrame: retargetFrame(),
    shouldApplyLowerBody: true,
    shouldHoldPlayerSquatPose: false,
    solvedLowerBodySources: {},
    updateWorldMatrix: () => {},
    ...overrides,
  });
}

describe("movementAvatarLowerBodyFrameRuntime", () => {
  it("applies a non-retarget player squat plan and returns owner/depth telemetry", () => {
    const result = applyRuntime({
      applyPlantedSquatIk: (depth) => depth + 0.1,
      lowerBodyDrive: drive({
        liveSquatDepth: 0.5,
        shouldDrivePlayerSquat: true,
      }),
      lowerBodyTarget: target(stage("player-squat"), {
        playerSquatPresentationDepth: 0.42,
        shouldHoldPlayerSquatPose: true,
      }),
      playerSquatPresentationDepth: 0.42,
      shouldHoldPlayerSquatPose: true,
    });

    expect(result).toMatchObject({
      footOwner: "player-squat-feet",
      lowerBodyOwner: "player-squat-owner",
      plantedSquatIkDepth: 0.52,
      retargetAppliedFeet: 0,
      retargetAppliedLegs: 0,
      retargetAppliedLowerBody: 0,
    });
  });

  it("continues retarget lower-body application and returns updated segment counts", () => {
    const applyRetargetMappings = vi.fn(() => ({
      applied: 3,
      feet: 1,
      legs: 2,
    }));
    const updateWorldMatrix = vi.fn();

    const result = applyRuntime({
      applyPlantedSquatIk: (depth) => depth,
      applyRetargetMappings,
      lowerBodyDrive: drive({
        liveSquatDepth: 0.58,
        shouldDrivePlayerSquat: true,
      }),
      lowerBodySegmentMotion: 0.6,
      lowerBodyTarget: target(stage("retarget"), {
        playerSquatPresentationDepth: 0.47,
      }),
      playerRetargetLowerBodyMotion: 0.5,
      playerSquatPresentationDepth: 0.47,
      retargetFrame: retargetFrame({
        squatDepth: 0.58,
      }),
      updateWorldMatrix,
    });

    expect(updateWorldMatrix).toHaveBeenCalledTimes(1);
    expect(applyRetargetMappings).toHaveBeenCalledTimes(1);
    expect(result.retargetAppliedLowerBody).toBe(3);
    expect(result.retargetAppliedLegs).toBe(2);
    expect(result.retargetAppliedFeet).toBe(1);
    expect(result.footOwner).not.toBe("neutral");
    expect(result.lowerBodyOwner).not.toBe("neutral");
  });

  it("reports player retarget ownership when complete solved leg retarget owns a leg raise", () => {
    const result = applyRuntime({
      applyRetargetMappings: () => ({
        applied: 6,
        feet: 2,
        legs: 4,
      }),
      lowerBodyDrive: drive({
        playerLegRaiseDepth: 0.334,
        playerLegRaiseSide: "right",
        playerLowerBodyState: "right-leg-raise",
        shouldDrivePlayerLegRaise: true,
      }),
      lowerBodySegmentMotion: 0.35,
      lowerBodyTarget: target(stage("player-leg-raise", {
        anchoredPlayerLegRaiseSide: "right",
        canUsePlayerRetargetLegRaise: true,
        feetOwner: "player-leg-raise-planted-flat",
        lowerBodyOwner: "player-right-leg-raise",
      }), {
        feetOwner: "player-leg-raise-planted-flat",
        lowerBodyOwner: "player-right-leg-raise",
      }),
      playerRetargetLowerBodyMotion: 0.35,
      retargetFrame: retargetFrame({
        kneeLift: { left: 0, right: 0.334 },
      }),
    });

    expect(result.lowerBodyOwner).toBe("player-retarget");
    expect(result.footOwner).toBe("player-leg-raise-planted-flat");
  });
});
