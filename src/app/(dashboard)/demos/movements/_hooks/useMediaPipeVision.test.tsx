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

import {
  isMovementMediaPipeGpuStartupError,
  isMovementMediaPipeRuntimeAbortError,
  useMediaPipeVision,
} from "./useMediaPipeVision";

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

  it("recognizes MediaPipe GPU startup failures", () => {
    expect(isMovementMediaPipeGpuStartupError(new Error("Error querying for GL extensions"))).toBe(true);
    expect(isMovementMediaPipeGpuStartupError(new Error("Service kGpuService was not provided"))).toBe(true);
    expect(isMovementMediaPipeGpuStartupError(new Error("StartGraph failed"))).toBe(true);
    expect(isMovementMediaPipeGpuStartupError(new Error("Unexpected model download failure"))).toBe(false);
  });

  it("recognizes MediaPipe runtime abort failures", () => {
    expect(isMovementMediaPipeRuntimeAbortError(new Error("Aborted()"))).toBe(true);
    expect(isMovementMediaPipeRuntimeAbortError(new Error("RuntimeError: Aborted()"))).toBe(true);
    expect(isMovementMediaPipeRuntimeAbortError(new Error("Unexpected model download failure"))).toBe(false);
  });

  it("falls back to CPU tracking when GPU startup fails", async () => {
    mediaPipeMocks.poseCreate.mockRejectedValueOnce(new Error("Error querying for GL extensions"));

    const { result } = renderHook(() => useMediaPipeVision({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(mediaPipeMocks.poseCreate.mock.calls[0]?.[1].baseOptions.delegate).toBe("GPU");
    expect(mediaPipeMocks.poseCreate.mock.calls[1]?.[1].baseOptions.delegate).toBe("CPU");
    expect(mediaPipeMocks.faceCreate.mock.calls[0]?.[1].baseOptions.delegate).toBe("CPU");
    expect(mediaPipeMocks.handCreate.mock.calls[0]?.[1].baseOptions.delegate).toBe("CPU");
    expect(result.current.error).toBeNull();
    expect(result.current.isReady).toBe(true);
  });

  it("can start directly in CPU mode after a live runtime recovery", async () => {
    const { result } = renderHook(() => useMediaPipeVision({
      enabled: true,
      forceCpu: true,
    }));

    await waitFor(() => expect(result.current.status).toBe("ready"));

    expect(mediaPipeMocks.poseCreate).toHaveBeenCalledTimes(1);
    expect(mediaPipeMocks.poseCreate.mock.calls[0]?.[1].baseOptions.delegate).toBe("CPU");
    expect(mediaPipeMocks.faceCreate.mock.calls[0]?.[1].baseOptions.delegate).toBe("CPU");
    expect(mediaPipeMocks.handCreate.mock.calls[0]?.[1].baseOptions.delegate).toBe("CPU");
    expect(result.current.isReady).toBe(true);
  });

  it("keeps raw internal MediaPipe startup text out of the visible error", async () => {
    mediaPipeMocks.poseCreate.mockRejectedValueOnce(new Error("Unexpected raw internal MediaPipe failure"));

    const { result } = renderHook(() => useMediaPipeVision({ enabled: true }));

    await waitFor(() => expect(result.current.status).toBe("failed"));
    expect(result.current.error).toBe("Tracking had trouble starting. Press Retry Tracking; if it repeats, refresh this page.");
  });
});
