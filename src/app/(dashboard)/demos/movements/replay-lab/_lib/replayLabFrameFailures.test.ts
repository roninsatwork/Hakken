import { describe, expect, it } from "vitest";
import { getReplayLabLiveCurrentFrameFailures } from "./replayLabFrameFailures";

type FailureInput = Parameters<typeof getReplayLabLiveCurrentFrameFailures>[0];

function failureInput(overrides: Partial<FailureInput> = {}): FailureInput {
  return {
    currentAvatarDebug: null,
    currentFrameActiveLegMotion: false,
    currentFrameSourceReady: false,
    currentFrameStationaryFeetFloorSideBend: false,
    currentFrameUsesSeatedSupport: false,
    safeFrameIndex: 12,
    ...overrides,
  };
}

describe("replay lab current-frame failures", () => {
  it("returns no failures without source or rendered-avatar evidence", () => {
    expect(getReplayLabLiveCurrentFrameFailures(failureInput())).toEqual([]);
  });

  it("keeps source framing failures tied to the selected frame", () => {
    const currentFrame = {
      poseBounds: {
        maxY: 1.12,
        outOfFrameCount: 5,
      },
    } as unknown as NonNullable<FailureInput["currentFrame"]>;

    expect(getReplayLabLiveCurrentFrameFailures(failureInput({ currentFrame }))).toContainEqual({
      code: "source_lower_body_out_of_frame",
      detail: expect.stringContaining("5 landmarks out of frame"),
      frameIndex: 12,
      severity: "warning",
    });
  });

  it("blocks active leg motion that is presented as seated support", () => {
    const failures = getReplayLabLiveCurrentFrameFailures(failureInput({
      currentFrameActiveLegMotion: true,
      currentFrameSourceReady: true,
      currentFrameUsesSeatedSupport: true,
    }));

    expect(failures).toContainEqual({
      code: "avatar_output_diverged",
      detail: expect.stringContaining("avatar support is seated"),
      frameIndex: 12,
      semanticCode: "movement-visible-but-unscored",
      severity: "error",
    });
  });
});
