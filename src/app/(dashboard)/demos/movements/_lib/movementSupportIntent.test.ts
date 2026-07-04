import { describe, expect, it } from "vitest";
import { classifyMovementBodyOrientation } from "./movementBodyOrientation";
import {
  pronePoseFixture,
  quadrupedPoseFixture,
  seatedPoseFixture,
  sideLyingPoseFixture,
  supinePoseFixture,
} from "./movementBodyOrientation.testFixtures";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import { resolveMovementExercisePose } from "./movementExercisePose";
import { resolveMovementSupportContacts } from "./movementSupportContact";
import { resolveMovementSupportIntent } from "./movementSupportIntent";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function supportIntentFor(poseLandmarks: TrackingLandmark[]) {
  const bodyOrientation = classifyMovementBodyOrientation(poseLandmarks);
  const bodySupport = resolveMovementSupportContacts({
    bodyOrientation,
    poseLandmarks,
  });
  const exercisePose = resolveMovementExercisePose({
    bodyOrientation,
    bodySupport,
    poseLandmarks,
  });

  return resolveMovementSupportIntent({
    bodySupport,
    exercisePose,
  });
}

describe("movementSupportIntent", () => {
  it("uses active feet as supported standing anchors", () => {
    const intent = supportIntentFor(makeMovementAvatarProofPose("standing"));

    expect(intent.key).toBe("feet-floor");
    expect(intent.status).toBe("active");
    expect(intent.anchorPoints).toEqual(["leftFoot", "rightFoot"]);
  });

  it("prioritizes chair seat support over feet for seated posture", () => {
    const intent = supportIntentFor(seatedPoseFixture());

    expect(intent.key).toBe("seat-chair");
    expect(intent.primarySurface).toBe("chair");
    expect(intent.anchorPoints).toEqual(["seat"]);
  });

  it("maps floor work support anchors by contact family", () => {
    expect(supportIntentFor(quadrupedPoseFixture())).toMatchObject({
      anchorPoints: ["leftHand", "rightHand", "leftKnee", "rightKnee"],
      key: "hands-knees-floor",
    });
    expect(supportIntentFor(makeMovementAvatarProofPose("yoga-plank"))).toMatchObject({
      anchorPoints: ["leftHand", "rightHand", "leftFoot", "rightFoot"],
      key: "hands-feet-floor",
    });
    expect(supportIntentFor(sideLyingPoseFixture())).toMatchObject({
      anchorPoints: ["sideBody", "leftHip", "leftShoulder", "leftElbow"],
      key: "side-body-floor",
    });
    expect(supportIntentFor(supinePoseFixture())).toMatchObject({
      anchorPoints: [
        "back",
        "leftShoulder",
        "rightShoulder",
        "leftHip",
        "rightHip",
        "leftFoot",
        "rightFoot",
      ],
      key: "back-floor",
    });
    expect(supportIntentFor(pronePoseFixture())).toMatchObject({
      anchorPoints: [
        "chest",
        "belly",
        "leftHip",
        "rightHip",
        "leftHand",
        "rightHand",
        "leftFoot",
        "rightFoot",
      ],
      key: "chest-floor",
    });
  });
});
