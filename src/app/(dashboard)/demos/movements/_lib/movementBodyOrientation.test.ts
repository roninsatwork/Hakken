import { describe, expect, it } from "vitest";
import {
  classifyMovementBodyOrientation,
  shouldHoldUnsupportedBodyOrientation,
} from "./movementBodyOrientation";
import { resolveMovementAvatarStudioDecision } from "./movementAvatarLegacyDecision";
import {
  makeMovementAvatarProofPose,
  movementAvatarProofLandmark,
} from "./movementAvatarProofFixtures";
import { buildMovementCalibration } from "./movementTrackingCalibration";
import {
  quadrupedPoseFixture,
  pronePoseFixture,
  seatedPoseFixture,
  sideLyingPoseFixture,
  supinePoseFixture,
  kneelingPoseFixture,
  movementOrientationPoseWith,
} from "./movementBodyOrientation.testFixtures";

describe("movementBodyOrientation", () => {
  it("keeps an upright side bend in the upright movement family", () => {
    const decision = classifyMovementBodyOrientation(makeMovementAvatarProofPose("side-bend"));

    expect(decision.orientation).toBe("upright");
    expect(decision.coverageFamily).toBe("upright");
    expect(shouldHoldUnsupportedBodyOrientation(decision)).toBe(false);
  });

  it("diagnoses side lying as floor work instead of upright side bend", () => {
    const decision = classifyMovementBodyOrientation(sideLyingPoseFixture());

    expect(decision.orientation).toBe("sideLyingLeft");
    expect(decision.coverageFamily).toBe("lying-floor-work");
    expect(decision.status).toBe("approximate");
    expect(shouldHoldUnsupportedBodyOrientation(decision)).toBe(true);
  });

  it("diagnoses seated, kneeling, and quadruped body orientations", () => {
    expect(classifyMovementBodyOrientation(seatedPoseFixture())).toMatchObject({
      coverageFamily: "sitting",
      orientation: "seated",
      status: "approximate",
    });
    expect(classifyMovementBodyOrientation(kneelingPoseFixture())).toMatchObject({
      coverageFamily: "kneeling",
      orientation: "kneeling",
      status: "approximate",
    });
    expect(classifyMovementBodyOrientation(quadrupedPoseFixture())).toMatchObject({
      coverageFamily: "quadruped",
      orientation: "quadruped",
      status: "approximate",
    });
  });

  it("keeps frontal seated leg-extension variations in the seated family", () => {
    const pose = movementOrientationPoseWith({
      0: movementAvatarProofLandmark(0.43, 0.08, -0.38),
      7: movementAvatarProofLandmark(0.39, 0.1, -0.25),
      8: movementAvatarProofLandmark(0.47, 0.1, -0.25),
      11: movementAvatarProofLandmark(0.36, 0.21, -0.06),
      12: movementAvatarProofLandmark(0.51, 0.21, -0.06),
      23: movementAvatarProofLandmark(0.51, 0.47, -0.01),
      24: movementAvatarProofLandmark(0.42, 0.5, 0.01),
      25: movementAvatarProofLandmark(0.52, 0.49, -0.5),
      26: movementAvatarProofLandmark(0.44, 0.74, -0.04),
      27: movementAvatarProofLandmark(0.51, 0.75, -0.28),
      28: movementAvatarProofLandmark(0.45, 0.93, 0.16),
    });

    expect(classifyMovementBodyOrientation(pose)).toMatchObject({
      coverageFamily: "sitting",
      orientation: "seated",
    });
  });

  it("does not classify ordinary standing knee lifts as seated", () => {
    const pose = movementOrientationPoseWith({
      0: movementAvatarProofLandmark(0.5, 0.14),
      7: movementAvatarProofLandmark(0.46, 0.16),
      8: movementAvatarProofLandmark(0.54, 0.16),
      11: movementAvatarProofLandmark(0.4, 0.3),
      12: movementAvatarProofLandmark(0.6, 0.3),
      23: movementAvatarProofLandmark(0.44, 0.55),
      24: movementAvatarProofLandmark(0.56, 0.55),
      25: movementAvatarProofLandmark(0.44, 0.75),
      26: movementAvatarProofLandmark(0.58, 0.5),
      27: movementAvatarProofLandmark(0.44, 0.93),
      28: movementAvatarProofLandmark(0.58, 0.68),
    });

    expect(classifyMovementBodyOrientation(pose)).toMatchObject({
      coverageFamily: "upright",
      orientation: "upright",
    });
  });

  it("diagnoses supine and prone floor-contact orientations", () => {
    expect(classifyMovementBodyOrientation(supinePoseFixture())).toMatchObject({
      coverageFamily: "lying-floor-work",
      orientation: "supine",
      status: "approximate",
    });
    expect(classifyMovementBodyOrientation(pronePoseFixture())).toMatchObject({
      coverageFamily: "lying-floor-work",
      orientation: "prone",
      status: "approximate",
    });
  });

  it("holds the upright spine solver for unsupported side-lying player frames", () => {
    const calibration = buildMovementCalibration({
      poseLandmarks: makeMovementAvatarProofPose("standing"),
    });
    const decision = resolveMovementAvatarStudioDecision({
      avatarRole: "player",
      calibration,
      retargetSourceModel: null,
      source: { poseLandmarks: sideLyingPoseFixture() },
    });

    expect(decision.bodyOrientation.orientation).toBe("sideLyingLeft");
    expect(decision.bodySupport.primarySurface).toBe("floor");
    expect(decision.bodySupport.supportLabel).toContain("sideBody:inferred");
    expect(decision.bodyOrientation.status).toBe("approximate");
    expect(decision.spineDrive.shouldApplySpine).toBe(false);
    expect(decision.spineDrive.sideBend).toBe(0);
  });
});
