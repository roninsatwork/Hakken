import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mediaPipeMocks = vi.hoisted(() => ({
  calls: [] as string[],
  faceCreate: vi.fn(),
  handCreate: vi.fn(),
  poseCreate: vi.fn(),
  resolveFiles: vi.fn(),
}));

vi.mock("@mediapipe/tasks-vision", () => ({
  FaceLandmarker: { createFromOptions: mediaPipeMocks.faceCreate },
  FilesetResolver: { forVisionTasks: mediaPipeMocks.resolveFiles },
  HandLandmarker: { createFromOptions: mediaPipeMocks.handCreate },
  PoseLandmarker: { createFromOptions: mediaPipeMocks.poseCreate },
}));

vi.mock("../_lib/movementPlayerInputContract", () => ({
  MOVEMENT_PLAYER_INPUT_CONTRACT: {
    detector: {
      faceModelUrl: "/face.task",
      handConfidence: 0.5,
      handModelUrl: "/hand.task",
      poseConfidence: 0.5,
      poseModelUrl: "/pose.task",
      wasmUrl: "/wasm",
    },
  },
}));

import { useMediaPipeVision } from "./useMediaPipeVision";

function createModel() {
  return { close: vi.fn() };
}

describe("useMediaPipeVision", () => {
  beforeEach(() => {
    mediaPipeMocks.calls.length = 0;
    mediaPipeMocks.faceCreate.mockReset().mockImplementation(async () => {
      mediaPipeMocks.calls.push("face");
      return createModel();
    });
    mediaPipeMocks.handCreate.mockReset().mockImplementation(async () => {
      mediaPipeMocks.calls.push("hands");
      return createModel();
    });
    mediaPipeMocks.poseCreate.mockReset().mockImplementation(async () => {
      mediaPipeMocks.calls.push("pose");
      return createModel();
    });
    mediaPipeMocks.resolveFiles.mockReset().mockResolvedValue({});
  });

  it("waits for capture mode resolution and starts every Deep Capture task in order", async () => {
    const { result, rerender } = renderHook(
      ({ enabled }) => useMediaPipeVision({
        enabled,
        enableDeepRefinement: true,
        enableSegmentation: true,
      }),
      { initialProps: { enabled: false } },
    );

    expect(result.current.status).toBe("idle");
    expect(mediaPipeMocks.resolveFiles).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(mediaPipeMocks.resolveFiles).toHaveBeenCalledTimes(1);
    expect(mediaPipeMocks.calls).toEqual(["pose", "face", "hands", "face", "hands"]);
    expect(result.current.isReady).toBe(true);
  });

  it("turns the raw ModuleFactory failure into a useful retry message", async () => {
    mediaPipeMocks.poseCreate.mockRejectedValueOnce(new Error("ModuleFactory not set."));
    const { result } = renderHook(() => useMediaPipeVision({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.error).toMatch(/tracking engine did not finish starting/i);
    expect(result.current.isReady).toBe(false);
  });
});
