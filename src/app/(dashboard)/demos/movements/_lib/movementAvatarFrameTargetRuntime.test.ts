import { describe, expect, it } from "vitest";
import { resolveMovementAvatarFrameTargetRuntime } from "./movementAvatarFrameTargetRuntime";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  normalizeVrmLandmark,
  type VrmSolverLandmark,
} from "./vrmRigging";

function solverLandmarks(): VrmSolverLandmark[] {
  return makeMovementAvatarProofMotionPayload("standing").landmarks.map(normalizeVrmLandmark);
}

describe("movementAvatarFrameTargetRuntime", () => {
  it("resolves player lower-body target selections with the player threshold", () => {
    const runtime = resolveMovementAvatarFrameTargetRuntime({
      avatarRole: "player",
      targetSolverLandmarks: solverLandmarks(),
    });

    expect(runtime.lowerBodyTargetComposition.selections.endpointVisibilityThreshold).toBe(0.18);
    expect(runtime.lowerBodyTargetComposition.aimTargets.leftKnee).toEqual(
      runtime.lowerBodyTargetComposition.leftKneeTarget,
    );
  });

  it("resolves instructor lower-body target selections with the recorded threshold", () => {
    const runtime = resolveMovementAvatarFrameTargetRuntime({
      avatarRole: "instructor",
      targetSolverLandmarks: solverLandmarks(),
    });

    expect(runtime.lowerBodyTargetComposition.selections.endpointVisibilityThreshold).toBe(0.2);
    expect(runtime.lowerBodyTargetComposition.aimTargets.rightToe).toEqual(
      runtime.lowerBodyTargetComposition.rightToeTarget,
    );
  });
});
