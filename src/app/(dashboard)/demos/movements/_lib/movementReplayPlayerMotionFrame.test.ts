import { describe, expect, it } from "vitest";
import { buildLiveMovementMotionFrame } from "./movementLiveMotionFrame";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildReplayPlayerMovementMotionFrame } from "./movementReplayPlayerMotionFrame";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementCalibration } from "./movementTrackingCalibration";

describe("movementReplayPlayerMotionFrame", () => {
  it("uses the same player-avatar result as Game while retaining recorded provenance", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const motionRef = makeMovementAvatarProofMotionPayload("left-arm-raise");
    const calibration = buildMovementCalibration({ poseLandmarks: neutral });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: neutral });
    const common = {
      calibration,
      capturedAt: 1234,
      isPlaying: true,
      motionRef,
      retargetSourceModel,
    };
    const replay = buildReplayPlayerMovementMotionFrame(common);
    const game = buildLiveMovementMotionFrame(common);

    expect(replay?.source.sourceOrigin).toBe("recorded-replay");
    expect(replay?.source.sourceStatus).toBe("decoded");
    expect(replay?.avatarDecision).toEqual(game?.avatarDecision);
    expect(replay?.avatarDisplayDecision).toEqual(game?.avatarDisplayDecision);
    expect(replay?.display).toEqual(game?.display);
  });
});
