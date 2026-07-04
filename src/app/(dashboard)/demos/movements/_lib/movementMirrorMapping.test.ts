import { describe, expect, it } from "vitest";
import {
  getMovementDisplayMapping,
  mapMovementDisplaySide,
  mirrorMovementLandmarksForDisplay,
} from "./movementMirrorMapping";
import type { TrackingLandmark } from "./movementTrackingCalibration";

const makePose = (): TrackingLandmark[] =>
  Array.from({ length: 33 }, (_, index) => ({
    x: 0.1 + index * 0.01,
    y: 0.2 + index * 0.01,
    z: index * 0.001,
    visibility: 0.9,
  }));

describe("movementMirrorMapping", () => {
  it("maps source side to avatar side for facing-player and same-side modes", () => {
    expect(mapMovementDisplaySide("left", "facing-player")).toBe("right");
    expect(mapMovementDisplaySide("right", "facing-player")).toBe("left");
    expect(mapMovementDisplaySide("left", "same-side")).toBe("left");
    expect(mapMovementDisplaySide("right", "same-side")).toBe("right");
    expect(getMovementDisplayMapping("left", "facing-player")).toEqual({
      avatarSide: "right",
      mirrorMode: "facing-player",
      sourceSide: "left",
    });
  });

  it("swaps anatomical landmark pairs once in facing-player mode", () => {
    const pose = makePose();
    const mirrored = mirrorMovementLandmarksForDisplay(pose, {
      mapX: (x) => 1 - x,
      mirrorMode: "facing-player",
    });

    expect(mirrored[11]).toEqual({
      ...pose[12],
      x: 1 - pose[12]!.x,
    });
    expect(mirrored[12]).toEqual({
      ...pose[11],
      x: 1 - pose[11]!.x,
    });
    expect(mirrored[23]).toEqual({
      ...pose[24],
      x: 1 - pose[24]!.x,
    });
    expect(mirrored[24]).toEqual({
      ...pose[23],
      x: 1 - pose[23]!.x,
    });
  });

  it("preserves anatomical landmark sides in same-side mode", () => {
    const pose = makePose();
    const mapped = mirrorMovementLandmarksForDisplay(pose, {
      mapX: (x) => 1 - x,
      mirrorMode: "same-side",
    });

    expect(mapped).toEqual(pose);
    expect(mapped).not.toBe(pose);
    expect(mapped[11]).not.toBe(pose[11]);
  });
});
