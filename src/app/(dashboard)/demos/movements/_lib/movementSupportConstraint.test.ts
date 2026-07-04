import { describe, expect, it } from "vitest";
import { classifyMovementBodyOrientation } from "./movementBodyOrientation";
import {
  pronePoseFixture,
  quadrupedPoseFixture,
  seatedPoseFixture,
  supinePoseFixture,
} from "./movementBodyOrientation.testFixtures";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import { resolveMovementExercisePose } from "./movementExercisePose";
import { resolveMovementSupportConstraint } from "./movementSupportConstraint";
import { resolveMovementSupportContacts } from "./movementSupportContact";
import { resolveMovementSupportIntent } from "./movementSupportIntent";
import type { TrackingLandmark } from "./movementTrackingCalibration";

function supportConstraintFor(poseLandmarks: TrackingLandmark[]) {
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
  const supportIntent = resolveMovementSupportIntent({
    bodySupport,
    exercisePose,
  });

  return resolveMovementSupportConstraint({
    exercisePose,
    supportIntent,
  });
}

describe("movementSupportConstraint", () => {
  it("marks standing feet-floor support as active foot locking", () => {
    const constraint = supportConstraintFor(makeMovementAvatarProofPose("standing"));

    expect(constraint.status).toBe("active");
    expect(constraint.activeLayers).toEqual(["foot-floor-lock"]);
    expect(constraint.missingLayers).toEqual([]);
  });

  it("marks seated support as contact correction until chair IK exists", () => {
    const constraint = supportConstraintFor(seatedPoseFixture());

    expect(constraint.status).toBe("partial-contact-correction");
    expect(constraint.activeLayers).toEqual(["root-height", "support-anchor-correction"]);
    expect(constraint.missingLayers).toContain("pelvis-chair-support");
  });

  it("marks floor support as contact correction while exact contact IK is missing", () => {
    expect(supportConstraintFor(quadrupedPoseFixture())).toMatchObject({
      activeLayers: ["root-height", "root-tilt", "support-anchor-correction"],
      missingLayers: ["hand-floor-lock", "knee-floor-lock", "wrist-support"],
      status: "partial-contact-correction",
    });
    expect(supportConstraintFor(supinePoseFixture())).toMatchObject({
      activeLayers: ["root-height", "root-tilt", "body-plane-floor-contact", "support-anchor-correction"],
      missingLayers: [],
      status: "partial-contact-correction",
    });
    expect(supportConstraintFor(pronePoseFixture())).toMatchObject({
      activeLayers: ["root-height", "root-tilt", "body-plane-floor-contact", "support-anchor-correction"],
      missingLayers: [],
      status: "partial-contact-correction",
    });
  });
});
