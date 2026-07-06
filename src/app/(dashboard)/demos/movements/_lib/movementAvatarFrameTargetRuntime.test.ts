import { describe, expect, it } from "vitest";
import { resolveMovementAvatarFrameTargetRuntime } from "./movementAvatarFrameTargetRuntime";
import type { MovementAvatarLowerBodyDrive } from "./movementAvatarLowerBody";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  createVrmImageSolverLandmarks,
  normalizeVrmLandmark,
  type VrmHandsPayload,
  type VrmSolverLandmark,
} from "./vrmRigging";

function solverLandmarks(): VrmSolverLandmark[] {
  return makeMovementAvatarProofMotionPayload("standing").landmarks.map(normalizeVrmLandmark);
}

function lowerBodyDrive(overrides: Partial<MovementAvatarLowerBodyDrive> = {}): MovementAvatarLowerBodyDrive {
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

describe("movementAvatarFrameTargetRuntime", () => {
  it("composes player arm targets and lower-body target selections together", () => {
    const imageLandmarks = solverLandmarks();
    imageLandmarks[15] = {
      ...imageLandmarks[15]!,
      visibility: 0.2,
    };
    const targetSolverLandmarks = createVrmImageSolverLandmarks(imageLandmarks);
    const rigHands: VrmHandsPayload = {
      left: {
        landmarks: [{
          x: 0.68,
          y: 0.42,
          z: -0.09,
          visibility: 0.95,
        }],
      },
    };

    const runtime = resolveMovementAvatarFrameTargetRuntime({
      avatarRole: "player",
      imageLandmarks,
      lowerBodyDrive: lowerBodyDrive(),
      rigHands,
      solverLandmarks: imageLandmarks,
      targetSolverLandmarks,
    });

    expect(runtime.armTargetComposition.armTargets.left.wristSource).toBe("hand");
    expect(runtime.armTargetComposition.leftWristTarget).toEqual(
      runtime.armTargetComposition.armTargets.left.wristTarget,
    );
    expect(runtime.lowerBodyTargetComposition.selections.endpointVisibilityThreshold).toBe(0.18);
    expect(runtime.lowerBodyTargetComposition.aimTargets.leftKnee).toEqual(
      runtime.lowerBodyTargetComposition.leftKneeTarget,
    );
  });

  it("keeps instructor target composition on recorded same-side landmarks", () => {
    const imageLandmarks = solverLandmarks();

    const runtime = resolveMovementAvatarFrameTargetRuntime({
      avatarRole: "instructor",
      imageLandmarks,
      lowerBodyDrive: lowerBodyDrive(),
      rigHands: undefined,
      solverLandmarks: imageLandmarks,
      targetSolverLandmarks: imageLandmarks,
    });

    expect(runtime.armTargetComposition.armTargets.left.wristSource).toBe("pose");
    expect(runtime.armTargetComposition.leftWristTarget).toEqual(imageLandmarks[15]);
    expect(runtime.lowerBodyTargetComposition.selections.endpointVisibilityThreshold).toBe(0.2);
    expect(runtime.lowerBodyTargetComposition.aimTargets.rightToe).toEqual(
      runtime.lowerBodyTargetComposition.rightToeTarget,
    );
  });
});
