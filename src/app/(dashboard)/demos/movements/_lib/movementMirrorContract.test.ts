import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildLiveMovementMotionFrame } from "./movementLiveMotionFrame";
import { buildRecordedMovementMotionFrame } from "./movementRecordedMotionFrame";
import { buildReplayPlayerMovementMotionFrame } from "./movementReplayPlayerMotionFrame";
import { buildMovementRetargetSourceModel } from "./movementRetargeting";
import { buildMovementCalibration } from "./movementTrackingCalibration";
import { prepareVrmSolverInput } from "./vrmRigging";

const expectedBilateralPosePairs = [
  [1, 4],
  [2, 5],
  [3, 6],
  [7, 8],
  [9, 10],
  [11, 12],
  [13, 14],
  [15, 16],
  [17, 18],
  [19, 20],
  [21, 22],
  [23, 24],
  [25, 26],
  [27, 28],
  [29, 30],
  [31, 32],
] as const;

const neutralPayload = makeMovementAvatarProofMotionPayload("standing");
const retargetSourceModel = buildMovementRetargetSourceModel({
  poseLandmarks: neutralPayload.landmarks,
});
const playerCalibration = buildMovementCalibration({
  poseLandmarks: neutralPayload.landmarks,
});

function buildMirrorArmPair() {
  return {
    instructor: buildRecordedMovementMotionFrame({
      isPlaying: true,
      motionRef: makeMovementAvatarProofMotionPayload("right-arm-raise"),
      retargetSourceModel,
    }),
    player: buildLiveMovementMotionFrame({
      calibration: playerCalibration,
      isPlaying: true,
      motionRef: makeMovementAvatarProofMotionPayload("left-arm-raise"),
      retargetSourceModel,
    }),
  };
}

describe("movement mirror contract", () => {
  // The recorded instructor runs the unified player lane, so BOTH avatars use
  // the facing-player anatomical mapping. This is what makes the Game
  // instructor render identically to the approved Replay Studio avatar.
  it("uses the same facing-player anatomical mapping for the recorded instructor and the live player", () => {
    const { instructor, player } = buildMirrorArmPair();

    expect(instructor?.display.sideMap).toEqual({
      sourceLeft: "avatarRight",
      sourceRight: "avatarLeft",
    });
    expect(player?.display.sideMap).toEqual({
      sourceLeft: "avatarRight",
      sourceRight: "avatarLeft",
    });
  });

  it("applies the role contract to every pose landmark from an independent expected table", () => {
    const rawLandmarks = Array.from({ length: 33 }, (_, index) => ({
      visibility: 0.9,
      x: index / 100,
      y: index,
      z: -index,
    }));
    const instructor = prepareVrmSolverInput({
      isPlayer: false,
      isPlaying: true,
      payload: null,
      rawLandmarks,
    });
    const player = prepareVrmSolverInput({
      isPlayer: true,
      isPlaying: true,
      mirrorForDisplay: true,
      payload: null,
      rawLandmarks,
    });

    expect(instructor.imageLandmarks[0]).toMatchObject({ x: 1, y: 0 });
    expect(player.imageLandmarks[0]).toMatchObject({ x: 1, y: 0 });

    expectedBilateralPosePairs.forEach(([leftIndex, rightIndex]) => {
      expect(instructor.imageLandmarks[leftIndex]).toMatchObject({
        x: 1 - leftIndex / 100,
        y: leftIndex,
        z: -leftIndex,
      });
      expect(instructor.imageLandmarks[rightIndex]).toMatchObject({
        x: 1 - rightIndex / 100,
        y: rightIndex,
        z: -rightIndex,
      });
      expect(player.imageLandmarks[leftIndex]).toMatchObject({
        x: 1 - rightIndex / 100,
        y: rightIndex,
        z: -rightIndex,
      });
      expect(player.imageLandmarks[rightIndex]).toMatchObject({
        x: 1 - leftIndex / 100,
        y: leftIndex,
        z: -leftIndex,
      });
    });
  });

  it("renders the recorded instructor identically to the Replay student for the same input", () => {
    // The unified-lane contract: the Game instructor and the approved Replay
    // Studio avatar are the SAME runtime, so identical inputs must produce
    // identical motion frames. This is the guard that stops the instructor
    // from ever diverging from the Replay rendering again.
    const payload = makeMovementAvatarProofMotionPayload("right-arm-raise");
    const model = buildMovementRetargetSourceModel({
      poseLandmarks: neutralPayload.landmarks,
    });
    const calibration = buildMovementCalibration({
      poseLandmarks: neutralPayload.landmarks,
    });
    const instructor = buildRecordedMovementMotionFrame({
      calibration,
      capturedAt: 7000,
      isPlaying: true,
      motionRef: payload,
      retargetSourceModel: model,
    });
    const replayStudent = buildReplayPlayerMovementMotionFrame({
      calibration,
      capturedAt: 7000,
      isPlaying: true,
      motionRef: payload,
      retargetSourceModel: model,
    });

    expect(instructor).not.toBeNull();
    expect(instructor?.displayLandmarks).toEqual(replayStudent?.displayLandmarks);
    expect(instructor?.avatarDisplayDecision.retargetFrame.segments).toEqual(
      replayStudent?.avatarDisplayDecision.retargetFrame.segments,
    );
    expect(instructor?.mirrorMode).toBe(replayStudent?.mirrorMode);
  });
});
