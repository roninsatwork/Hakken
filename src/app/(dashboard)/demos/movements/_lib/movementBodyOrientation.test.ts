import { describe, expect, it } from "vitest";
import {
  classifyMovementBodyOrientation,
  shouldHoldUnsupportedBodyOrientation,
} from "./movementBodyOrientation";
import { resolveMovementAvatarStudioDecision } from "./movementAvatarLegacyDecision";
import {
  makeMovementAvatarProofPose,
} from "./movementAvatarProofFixtures";
import { buildMovementCalibration } from "./movementTrackingCalibration";
import {
  quadrupedPoseFixture,
  pronePoseFixture,
  seatedPoseFixture,
  sideLyingPoseFixture,
  supinePoseFixture,
  kneelingPoseFixture,
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
