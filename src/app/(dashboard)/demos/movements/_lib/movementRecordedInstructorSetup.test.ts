import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementRecordedInstructorCalibration } from "./movementRecordedInstructorSetup";

describe("buildMovementRecordedInstructorCalibration", () => {
  it("builds one deterministic calibration from the known instructor recording", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing");
    const raised = makeMovementAvatarProofMotionPayload("far-left-leg-raise");
    const calibration = buildMovementRecordedInstructorCalibration([
      raised,
      neutral,
      neutral,
    ]);

    expect(calibration).not.toBeNull();
    expect(calibration?.quality).toBeGreaterThan(0);
    expect(buildMovementRecordedInstructorCalibration([
      raised,
      neutral,
      neutral,
    ])).toEqual(calibration);
  });

  it("reports missing calibration when no genuine pose evidence exists", () => {
    expect(buildMovementRecordedInstructorCalibration([{}, { landmarks: [] }])).toBeNull();
  });
});
