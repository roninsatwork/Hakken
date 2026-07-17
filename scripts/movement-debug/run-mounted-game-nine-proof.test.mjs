import { describe, expect, it } from "vitest";
import { buildRecordedMovementCoverage } from "./run-mounted-game-nine-proof.mjs";

function pose(offset = 0) {
  return Array.from({ length: 33 }, (_, index) => ({
    visibility: 1,
    x: index / 100 + offset,
    y: index / 100,
    z: 0,
  }));
}

describe("mounted Game nine-video coverage", () => {
  it("evaluates every frame and discovers movement without exercise labels", () => {
    const coverage = buildRecordedMovementCoverage({
      sampleCount: 3,
      samples: [0, 0.01, 0.02].map((offset) => ({
        tracking: { pose: pose(offset), worldPose: pose(offset) },
      })),
    });
    expect(coverage.evaluatedFrameCount).toBe(3);
    expect(coverage.unmeasuredFrameCount).toBe(0);
    expect(coverage.channelPresentFrames.pose).toBe(3);
    expect(coverage.regions.leftLeg.evaluatedTransitionCount).toBe(2);
    expect(coverage.regions.leftLeg.movementTransitionCount).toBe(2);
  });
});
