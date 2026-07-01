import { describe, expect, it } from "vitest";
import {
  buildMovementSpineModel,
  compareMovementSpineModels,
} from "./movementSpineMetrics";
import type { MovementLandmark } from "./movementTypes";

function visible(x: number, y: number, z = 0, visibility = 0.9): MovementLandmark {
  return { x, y, z, visibility };
}

function makeNeutralPose(visibility = 0.9) {
  const pose = Array.from({ length: 33 }, () => visible(0.5, 0.5, 0, visibility));
  pose[0] = visible(0.5, 0.25, 0, visibility);
  pose[7] = visible(0.46, 0.27, 0, visibility);
  pose[8] = visible(0.54, 0.27, 0, visibility);
  pose[11] = visible(0.39, 0.42, 0, visibility);
  pose[12] = visible(0.61, 0.42, 0, visibility);
  pose[23] = visible(0.43, 0.66, 0, visibility);
  pose[24] = visible(0.57, 0.66, 0, visibility);
  return pose;
}

function makeHipHingePose(visibility = 0.9) {
  const pose = makeNeutralPose(visibility);
  pose[0] = visible(0.66, 0.31, 0, visibility);
  pose[7] = visible(0.62, 0.32, 0, visibility);
  pose[8] = visible(0.7, 0.32, 0, visibility);
  pose[11] = visible(0.52, 0.48, 0, visibility);
  pose[12] = visible(0.74, 0.48, 0, visibility);
  pose[23] = visible(0.43, 0.66, 0, visibility);
  pose[24] = visible(0.57, 0.66, 0, visibility);
  return pose;
}

describe("movement spine metrics", () => {
  it("builds a high-confidence neutral stack model", () => {
    const model = buildMovementSpineModel(makeNeutralPose());

    expect(model).not.toBeNull();
    expect(model?.confidence).toBeCloseTo(0.9);
    expect(model?.neutralStackScore).toBeGreaterThan(70);
    expect(model?.symmetryScore).toBeGreaterThan(80);
    expect(model?.coachingCue).toBe("Tall spine.");
  });

  it("detects head drift away from pelvis", () => {
    const pose = makeNeutralPose();
    pose[0] = visible(0.66, 0.25);
    pose[7] = visible(0.62, 0.27);
    pose[8] = visible(0.7, 0.27);

    const model = buildMovementSpineModel(pose);

    expect(model?.neutralStackScore).toBeLessThan(75);
    expect(model?.coachingCue).toBe("Stack head over hips.");
  });

  it("returns low confidence guidance for weak spine landmarks", () => {
    const model = buildMovementSpineModel(makeNeutralPose(0.2));

    expect(model?.confidence).toBeCloseTo(0.2);
    expect(model?.neutralStackScore).toBeLessThan(25);
    expect(model?.coachingCue).toBe("Bring shoulders and hips into view.");
  });

  it("compares student and instructor spine shape", () => {
    const instructor = buildMovementSpineModel(makeNeutralPose());
    const matchingStudent = buildMovementSpineModel(makeNeutralPose());
    const driftingPose = makeNeutralPose();
    driftingPose[11] = visible(0.48, 0.42);
    driftingPose[12] = visible(0.7, 0.42);
    const driftingStudent = buildMovementSpineModel(driftingPose);

    const goodMatch = compareMovementSpineModels(matchingStudent, instructor);
    const weakMatch = compareMovementSpineModels(driftingStudent, instructor);

    expect(goodMatch.score).toBeGreaterThan(80);
    expect(goodMatch.cue).toBe("Spine shape matches.");
    expect(weakMatch.score).toBeLessThan(goodMatch.score);
  });

  it("weights the match by the routine spine goal", () => {
    const instructor = buildMovementSpineModel(makeHipHingePose());
    const matchingStudent = buildMovementSpineModel(makeHipHingePose());
    const neutralStudent = buildMovementSpineModel(makeNeutralPose());

    const goodMatch = compareMovementSpineModels(matchingStudent, instructor, "hipHinge");
    const weakMatch = compareMovementSpineModels(neutralStudent, instructor, "hipHinge");

    expect(goodMatch.score).toBeGreaterThan(80);
    expect(weakMatch.score).toBeLessThan(goodMatch.score - 25);
    expect(weakMatch.cue).toBe("Let the hips lead while the spine stays long.");
  });

  it("uses roll down coaching cues for roll down routines", () => {
    const instructor = buildMovementSpineModel(makeHipHingePose());
    const neutralStudent = buildMovementSpineModel(makeNeutralPose());

    const result = compareMovementSpineModels(neutralStudent, instructor, "rollDown");

    expect(result.score).toBeLessThan(75);
    expect(result.cue).toBe("Move through the spine with control.");
  });
});
