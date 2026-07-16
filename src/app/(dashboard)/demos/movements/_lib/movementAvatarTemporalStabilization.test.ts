import { describe, expect, it } from "vitest";
import { stabilizeMovementAvatarPipelineDecision } from "./movementAvatarTemporalStabilization";
import type { MovementAvatarPipelineDecision } from "./movementAvatarPipeline";

function decision({ held = false } = {}): Pick<
  MovementAvatarPipelineDecision,
  "retargetFrame" | "spineDrive"
> & Partial<Pick<MovementAvatarPipelineDecision, "lowerBodyDrive">> {
  return {
    retargetFrame: {
      contacts: { leftFoot: false, rightFoot: false },
      debug: {
        heldSegments: [],
        solvedSegments: ["leftLowerArm"],
        sourceQuality: 0.9,
      },
      hipDrop: 0,
      kneeLift: { left: 0, right: 0 },
      segments: {
        leftLowerArm: {
          confidence: 0.9,
          direction: { x: 1, y: 0, z: 0 },
          length: 1,
        },
      },
      space: "world",
      squatDepth: 0,
    },
    spineDrive: {
      confidence: 0.9,
      forwardLean: 0,
      owner: held ? "player-spine-held" : "player-spine-model",
      rotations: {
        hips: { x: 0, y: 0, z: 0 },
        spine: { x: 0, y: 0, z: 0 },
        chest: { x: 0, y: 0, z: 0 },
        upperChest: { x: 0, y: 0, z: 0 },
      },
      shouldApplySpine: !held,
      sideBend: 0,
      twist: 0,
    },
  };
}

describe("movement avatar temporal target stabilization", () => {
  it("bounds continuous arm direction steps before VRM application", () => {
    const previous = decision();
    const current = decision();
    current.retargetFrame.segments.leftLowerArm!.direction = { x: 0, y: 1, z: 0 };

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous,
      sourceDeltaMs: 30,
    });
    const direction = stabilized.retargetFrame.segments.leftLowerArm!.direction;
    const angle = Math.acos(direction.x);

    expect(angle).toBeCloseTo(0.144, 6);
  });

  it("bounds continuous spine target steps before bone easing", () => {
    const previous = decision();
    const current = decision();
    current.spineDrive.rotations.chest.x = 0.5;

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous,
      sourceDeltaMs: 30,
    });

    expect(stabilized.spineDrive.rotations.chest.x).toBeCloseTo(0.072, 6);
  });

  it("carries the last intended spine target through held frames", () => {
    const previous = decision();
    previous.spineDrive.rotations.chest.x = 0.24;
    const current = decision({ held: true });

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous,
      sourceDeltaMs: 30,
    });

    expect(stabilized.spineDrive.rotations.chest.x).toBe(0.24);
    expect(stabilized.spineDrive.owner).toBe("player-spine-held");
  });

  it("holds foot contact through a low-confidence boundary crossing", () => {
    const previous = decision();
    const current = decision();
    previous.retargetFrame.contacts.rightFoot = true;
    current.retargetFrame.contacts.rightFoot = false;
    current.retargetFrame.segments.rightFoot = {
      confidence: 0.338,
      direction: { x: 0, y: -1, z: 0 },
      length: 1,
    };

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous,
      sourceDeltaMs: 30,
    });

    expect(stabilized.retargetFrame.contacts.rightFoot).toBe(true);
  });

  it("accepts a high-confidence foot contact change", () => {
    const previous = decision();
    const current = decision();
    previous.retargetFrame.contacts.rightFoot = true;
    current.retargetFrame.contacts.rightFoot = false;
    current.retargetFrame.segments.rightFoot = {
      confidence: 0.9,
      direction: { x: 0, y: -1, z: 0 },
      length: 1,
    };

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous,
      sourceDeltaMs: 30,
    });

    expect(stabilized.retargetFrame.contacts.rightFoot).toBe(false);
  });

  it("keeps planted squat presentation on the stabilized contact model", () => {
    const previous = decision();
    const current = decision();
    previous.retargetFrame.contacts = { leftFoot: true, rightFoot: true };
    current.retargetFrame.contacts = { leftFoot: true, rightFoot: false };
    current.retargetFrame.hipDrop = 0.93;
    current.retargetFrame.segments.rightFoot = {
      confidence: 0.338,
      direction: { x: 0, y: -1, z: 0 },
      length: 1,
    };
    previous.lowerBodyDrive = {
      groundedSquatDepth: 0,
      liveSquatDepth: 1,
      playerLegRaiseDepth: 0,
      playerLegRaiseSide: null,
      playerLowerBodyState: "planted-squat",
      playerSquatPresentationDepth: 0,
      shouldApplyLowerBody: true,
      shouldApplySolverTorso: true,
      shouldDrivePlayerLegRaise: false,
      shouldDrivePlayerSquat: true,
      visualRootDrop: 0,
    };
    current.lowerBodyDrive = {
      ...previous.lowerBodyDrive,
      playerLowerBodyState: "neutral",
      shouldDrivePlayerSquat: false,
    };

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous,
      sourceDeltaMs: 30,
    });

    expect(stabilized.lowerBodyDrive?.playerSquatPresentationDepth).toBe(0.93);
    expect(stabilized.lowerBodyDrive?.playerLowerBodyState).toBe("planted-squat");
    expect(stabilized.lowerBodyDrive?.shouldDrivePlayerSquat).toBe(true);
    expect(stabilized.lowerBodyDrive?.visualRootDrop).toBeCloseTo(0.5208, 6);
  });

  it("caps a recorded timestamp stall instead of snapping to the raw target", () => {
    const previous = decision();
    const current = decision();
    current.retargetFrame.segments.leftLowerArm!.direction = { x: 0, y: 1, z: 0 };
    current.spineDrive.rotations.chest.x = 0.5;

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous,
      sourceDeltaMs: 500,
    });

    expect(Math.acos(stabilized.retargetFrame.segments.leftLowerArm!.direction.x)).toBeCloseTo(0.48, 6);
    expect(stabilized.spineDrive.rotations.chest.x).toBeCloseTo(0.24, 6);
  });

  it("does not interpolate after manual seek orchestration clears the previous frame", () => {
    const current = decision();
    current.retargetFrame.segments.leftLowerArm!.direction = { x: 0, y: 1, z: 0 };

    const stabilized = stabilizeMovementAvatarPipelineDecision({
      current,
      previous: null,
      sourceDeltaMs: 500,
    });

    expect(stabilized).toBe(current);
  });
});
