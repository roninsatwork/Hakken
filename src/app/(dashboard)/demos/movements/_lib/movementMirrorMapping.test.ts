import { describe, expect, it } from "vitest";
import {
  buildMovementSideOwnershipProof,
  getMovementDisplayMapping,
  mapMovementDisplaySide,
  mirrorMovementLandmarksForDisplay,
  MOVEMENT_SIDE_OWNERSHIP_PROOF_PAIRS,
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

  it("proves every bilateral landmark pair maps source left to avatar right in facing-player mode", () => {
    const pose = makePose();
    const displayPose = mirrorMovementLandmarksForDisplay(pose, {
      mapX: (x) => 1 - x,
      mirrorMode: "facing-player",
    });
    const proofRows = buildMovementSideOwnershipProof({
      displayLandmarks: displayPose,
      mapX: (x) => 1 - x,
      mirrorMode: "facing-player",
      sourceLandmarks: pose,
    });

    expect(proofRows).toHaveLength(MOVEMENT_SIDE_OWNERSHIP_PROOF_PAIRS.length);
    expect(proofRows.every((row) => row.sourceLeftAvatarSide === "avatarRight")).toBe(true);
    expect(proofRows.every((row) => row.sourceRightAvatarSide === "avatarLeft")).toBe(true);
    expect(proofRows.every((row) => row.sourceLeftMatchesDisplay)).toBe(true);
    expect(proofRows.every((row) => row.sourceRightMatchesDisplay)).toBe(true);
    expect(proofRows.find((row) => row.bodyPart === "knee")).toMatchObject({
      sourceLeftDisplayIndex: 26,
      sourceRightDisplayIndex: 25,
    });
  });

  it("proves every bilateral landmark pair stays same-side when mirror mode is same-side", () => {
    const pose = makePose();
    const displayPose = mirrorMovementLandmarksForDisplay(pose, {
      mapX: (x) => 1 - x,
      mirrorMode: "same-side",
    });
    const proofRows = buildMovementSideOwnershipProof({
      displayLandmarks: displayPose,
      mirrorMode: "same-side",
      sourceLandmarks: pose,
    });

    expect(proofRows).toHaveLength(MOVEMENT_SIDE_OWNERSHIP_PROOF_PAIRS.length);
    expect(proofRows.every((row) => row.sourceLeftAvatarSide === "avatarLeft")).toBe(true);
    expect(proofRows.every((row) => row.sourceRightAvatarSide === "avatarRight")).toBe(true);
    expect(proofRows.every((row) => row.sourceLeftMatchesDisplay)).toBe(true);
    expect(proofRows.every((row) => row.sourceRightMatchesDisplay)).toBe(true);
    expect(proofRows.find((row) => row.bodyPart === "wrist")).toMatchObject({
      sourceLeftDisplayIndex: 15,
      sourceRightDisplayIndex: 16,
    });
  });
});
