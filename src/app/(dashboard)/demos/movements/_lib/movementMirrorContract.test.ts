import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildLiveMovementMotionFrame } from "./movementLiveMotionFrame";
import { buildRecordedMovementMotionFrame } from "./movementRecordedMotionFrame";
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
  it("uses anatomical identity for the instructor and anatomical opposite for the player avatar", () => {
    const { instructor, player } = buildMirrorArmPair();

    expect(instructor?.display.sideMap).toEqual({
      sourceLeft: "avatarLeft",
      sourceRight: "avatarRight",
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
});
