import { describe, expect, it } from "vitest";
import {
  resolveMovementAvatarReplayDecision,
  resolveMovementAvatarStudioDecision,
} from "./movementAvatarLegacyDecision";
import { resolveMovementAvatarPipelineDecision } from "./movementAvatarPipeline";
import { makeMovementAvatarProofPose } from "./movementAvatarProofFixtures";
import { buildMovementCalibration } from "./movementTrackingCalibration";

describe("movement avatar legacy decision wrappers", () => {
  it("delegate to the core pipeline with explicit source origins", () => {
    const poseLandmarks = makeMovementAvatarProofPose("standing");
    const input = {
      avatarRole: "player" as const,
      calibration: buildMovementCalibration({ poseLandmarks }),
      retargetSourceModel: null,
      source: {
        poseLandmarks,
      },
    };

    expect(resolveMovementAvatarReplayDecision(input)).toEqual(
      resolveMovementAvatarPipelineDecision({
        ...input,
        sourceOrigin: "replay",
      }),
    );
    expect(resolveMovementAvatarStudioDecision(input)).toEqual(
      resolveMovementAvatarPipelineDecision({
        ...input,
        sourceOrigin: "studio",
      }),
    );
  });
});
