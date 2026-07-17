import { describe, expect, it } from "vitest";
import { buildLiveMovementMotionFrame } from "./movementLiveMotionFrame";
import {
  makeMovementAvatarProofMotionPayload,
  MOVEMENT_AVATAR_PROOF_MODES,
} from "./movementAvatarProofFixtures";
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
    expect(replay?.avatarDisplayHeadTarget).toEqual(game?.avatarDisplayHeadTarget);
    expect(replay?.display).toEqual(game?.display);
  });

  it("keeps Replay and Game player output aligned across the complete proof-mode catalogue", () => {
    const neutral = makeMovementAvatarProofMotionPayload("standing").landmarks;
    const calibration = buildMovementCalibration({ poseLandmarks: neutral });
    const retargetSourceModel = buildMovementRetargetSourceModel({ poseLandmarks: neutral });

    for (const mode of MOVEMENT_AVATAR_PROOF_MODES) {
      const common = {
        calibration,
        capturedAt: 1234,
        isPlaying: true,
        motionRef: makeMovementAvatarProofMotionPayload(mode),
        retargetSourceModel,
      };
      const replay = buildReplayPlayerMovementMotionFrame(common);
      const game = buildLiveMovementMotionFrame(common);

      expect(game?.avatarDecision, `${mode} source decision`).toEqual(replay?.avatarDecision);
      expect(game?.avatarDisplayDecision, `${mode} display decision`).toEqual(replay?.avatarDisplayDecision);
      expect(game?.avatarDisplayHeadTarget, `${mode} head target`).toEqual(replay?.avatarDisplayHeadTarget);
      expect(game?.display, `${mode} display map`).toEqual(replay?.display);
      expect(game?.rootMotionFrame, `${mode} root motion`).toEqual(replay?.rootMotionFrame);
      expect(game?.rootMotionHistory, `${mode} root history`).toEqual(replay?.rootMotionHistory);
    }
  });
});
