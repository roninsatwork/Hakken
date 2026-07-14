import { describe, expect, it } from "vitest";
import { makeMovementAvatarProofMotionPayload } from "./movementAvatarProofFixtures";
import { buildMovementRecordedPlayerSetup } from "./movementRecordedPlayerSetup";

describe("movementRecordedPlayerSetup", () => {
  it("uses neutral samples from the available prefix only", () => {
    const frames = [
      makeMovementAvatarProofMotionPayload("standing"),
      makeMovementAvatarProofMotionPayload("left-arm-raise"),
      makeMovementAvatarProofMotionPayload("squat"),
      makeMovementAvatarProofMotionPayload("standing"),
    ];
    const setup = buildMovementRecordedPlayerSetup({
      frameLimit: 2,
      frames,
      sampleLimit: 2,
    });

    expect(setup.calibration).not.toBeNull();
    expect(setup.retargetSourceModel).not.toBeNull();
    expect(setup.provenance.sampleIndexes).toContain(0);
    expect(setup.provenance.sampleIndexes).not.toContain(3);
    expect(setup.provenance).toMatchObject({
      builder: "recorded-player-neutral-prefix-v1",
      frameLimit: 2,
      sampleLimit: 2,
    });
  });
});
