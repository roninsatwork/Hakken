import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import { buildMovementGameInstructorRuntimeFrame } from "./movementGameRuntimeFrame";

describe("buildMovementGameInstructorRuntimeFrame", () => {
  const pose = makeMovementAvatarProofPose("standing");

  it("preserves a recorded payload timestamp", () => {
    const frame = buildMovementGameInstructorRuntimeFrame({
      isPlaying: true,
      motionRef: { capturedAt: 123_456, landmarks: pose },
      retargetSourceModel: null,
    });

    expect(frame?.source.capturedAt).toBe(123_456);
  });

  it("allows an explicit adapter timestamp to override the payload", () => {
    const frame = buildMovementGameInstructorRuntimeFrame({
      capturedAt: 654_321,
      isPlaying: true,
      motionRef: { capturedAt: 123_456, landmarks: pose },
      retargetSourceModel: null,
    });

    expect(frame?.source.capturedAt).toBe(654_321);
  });
});
