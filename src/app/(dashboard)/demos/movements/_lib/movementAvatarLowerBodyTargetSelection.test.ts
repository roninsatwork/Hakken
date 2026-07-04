import { describe, expect, it } from "vitest";
import { resolveMovementAvatarLowerBodyTargetSelectionComposition } from "./movementAvatarLowerBodyTargetSelection";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import {
  createVrmImageSolverLandmarks,
  normalizeVrmLandmark,
  type VrmSolverLandmark,
} from "./vrmRigging";

function solverLandmarks(): VrmSolverLandmark[] {
  return makeMovementAvatarProofMotionPayload("standing").landmarks.map(normalizeVrmLandmark);
}

describe("movement avatar lower-body target selection composition", () => {
  it("returns shared lower-body selections with stable target fallbacks", () => {
    const targetSolverLandmarks = solverLandmarks();
    const target = resolveMovementAvatarLowerBodyTargetSelectionComposition({
      avatarRole: "instructor",
      targetSolverLandmarks,
    });

    expect(target.selections.endpointVisibilityThreshold).toBe(0.2);
    expect(target.rightKneeTarget).toEqual(target.selections.rightKnee.target ?? targetSolverLandmarks[26]);
    expect(target.leftKneeTarget).toEqual(target.selections.leftKnee.target ?? targetSolverLandmarks[25]);
    expect(target.rightAnkleTarget).toEqual(target.selections.rightAnkle.target ?? targetSolverLandmarks[28]);
    expect(target.leftAnkleTarget).toEqual(target.selections.leftAnkle.target ?? targetSolverLandmarks[27]);
    expect(target.rightToeTarget).toEqual(target.selections.rightToe.target ?? targetSolverLandmarks[32]);
    expect(target.leftToeTarget).toEqual(target.selections.leftToe.target ?? targetSolverLandmarks[31]);
  });

  it("keeps player display landmarks on the explicit target solver side", () => {
    const imageLandmarks = solverLandmarks();
    const targetSolverLandmarks = createVrmImageSolverLandmarks(imageLandmarks);
    const target = resolveMovementAvatarLowerBodyTargetSelectionComposition({
      avatarRole: "player",
      targetSolverLandmarks,
    });

    expect(target.selections.endpointVisibilityThreshold).toBe(0.18);
    expect(target.rightKneeTarget).toEqual(target.selections.rightKnee.target ?? targetSolverLandmarks[26]);
    expect(target.leftKneeTarget).toEqual(target.selections.leftKnee.target ?? targetSolverLandmarks[25]);
  });
});
