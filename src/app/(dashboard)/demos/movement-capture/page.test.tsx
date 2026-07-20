import React, { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMovementCapture } from "../movements/_hooks/useMovementCapture";
import type { MovementStartReadiness } from "../movements/_lib/movementSourceFrame";
import MovementCapturePage, {
  resolveMovementCaptureRouteMode,
  resolveMovementRecordingSaveRequirements,
} from "./MovementCaptureClient";

const startRecordingMock = vi.hoisted(() => vi.fn());
const stopRecordingMock = vi.hoisted(() => vi.fn());
const mediaPipeVisionMockState = vi.hoisted(() => ({
  options: [] as Array<{ enableSegmentation?: boolean; forceCpu?: boolean }>,
  retry: vi.fn(),
}));
const movementCaptureMockState = vi.hoisted(() => ({
  latestInput: null as null | { onTrackingRuntimeFailure?: () => void },
}));

vi.mock("convex/react", () => ({
  useMutation: () => vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock("lucide-react", () => ({
  ArrowLeft: () => <span aria-hidden="true">Back</span>,
}));

vi.mock("@/src/ui/components/layout/Header", () => ({
  default: () => <header>Header</header>,
}));

vi.mock("../movements/_hooks/useMediaPipeVision", () => ({
  useMediaPipeVision: (options: { enableSegmentation?: boolean; forceCpu?: boolean }) => {
    mediaPipeVisionMockState.options.push(options);
    return {
    error: null,
    faceLandmarker: {},
    handLandmarker: {},
    isReady: true,
    poseLandmarker: {},
      retry: mediaPipeVisionMockState.retry,
    status: "ready",
    };
  },
}));

vi.mock("../movements/_hooks/useMovementCapture", () => ({
  useMovementCapture: vi.fn(),
}));

vi.mock("../movements/_lib/movementBodyPixDenseCaptureAdapter", () => ({
  createMovementBodyPixDenseCaptureAdapter: vi.fn(async () => ({
    infer: vi.fn(),
  })),
}));

vi.mock("../movements/_components/MovementCapturePanel", () => ({
  default: ({
    capturePreflight,
    captureReadinessCountdownSeconds,
    captureReadinessMessage,
    captureReadinessStatus,
    isRecording,
    onToggleRecording,
    showTrackingOverlay,
    showTrackingDetailToggle,
  }: {
    capturePreflight?: unknown;
    captureReadinessCountdownSeconds?: number;
    captureReadinessMessage?: string | null;
    captureReadinessStatus: string;
    isRecording: boolean;
    onToggleRecording: () => void;
    showTrackingOverlay?: boolean;
    showTrackingDetailToggle?: boolean;
  }) => (
    <section>
      {capturePreflight ? <p>Capture channel preflight</p> : null}
      <output data-testid="capture-gate-status">{captureReadinessStatus}</output>
      <output data-testid="capture-gate-message">{captureReadinessMessage}</output>
      <output data-testid="capture-gate-countdown">{captureReadinessCountdownSeconds}</output>
      <output data-testid="capture-tracking-overlay">{String(showTrackingOverlay)}</output>
      <output data-testid="capture-tracking-toggle">{String(showTrackingDetailToggle)}</output>
      <button type="button" onClick={onToggleRecording}>
        {isRecording ? "Stop test capture" : "Start test capture"}
      </button>
    </section>
  ),
}));

vi.mock("../movements/_components/MovementSaveDialog", () => ({
  default: ({ frameCount, isOpen }: { frameCount: number; isOpen: boolean }) => (
    isOpen ? <div role="dialog">Save recording with {frameCount} frames</div> : null
  ),
}));

const readyCapture: MovementStartReadiness = {
  blockedReasons: [],
  calibrationQuality: 0.92,
  canStartGame: true,
  canStartRecording: true,
  countdownMsRemaining: 0,
  promptEvents: [],
  requiredBodyParts: [
    "head",
    "torso",
    "leftArm",
    "rightArm",
    "leftLeg",
    "rightLeg",
    "leftFoot",
    "rightFoot",
  ],
  state: "ready",
  visibleBodyParts: [
    "head",
    "torso",
    "leftArm",
    "rightArm",
    "leftLeg",
    "rightLeg",
    "leftFoot",
    "rightFoot",
  ],
};
let captureStartReadinessMock: MovementStartReadiness = readyCapture;
const trustworthyWholeBody = { missingBodyParts: [], wholeBodyVisible: true };
let captureStartWholeBodyMock: {
  missingBodyParts: string[];
  wholeBodyVisible: boolean;
} = trustworthyWholeBody;

function advanceCaptureSteadyHold() {
  act(() => vi.advanceTimersByTime(1_100));
}

function advanceCaptureCountdown() {
  act(() => vi.advanceTimersByTime(1_000));
  act(() => vi.advanceTimersByTime(1_000));
  act(() => vi.advanceTimersByTime(1_000));
}

describe("MovementCapturePage", () => {
  it("lets Deep Capture supersede schema-v2 commissioning when the canonical URL enables both", () => {
    expect(resolveMovementRecordingSaveRequirements({
      commissioningMode: true,
      deepCaptureMode: true,
    })).toEqual({
      proofCommand: "movement:replay-game:deep-commissioning-proof",
      proofProfile: "schema-v3 Deep Capture",
      requireCommissioningPacket: false,
      requireDeepCapturePacket: true,
    });
  });

  it("retains the older schema-v2 commissioning requirement outside Deep Capture", () => {
    expect(resolveMovementRecordingSaveRequirements({
      commissioningMode: true,
      deepCaptureMode: false,
    })).toEqual({
      proofCommand: "movement:replay-game:commissioning-proof",
      proofProfile: "schema-v2 commissioning",
      requireCommissioningPacket: true,
      requireDeepCapturePacket: false,
    });
  });

  it("locks the canonical path to schema-v3 Deep Capture without query parameters", () => {
    expect(resolveMovementCaptureRouteMode({
      pathname: "/demos/movement-capture/deep",
      search: "",
    })).toEqual({
      commissioningMode: true,
      deepCaptureMode: true,
    });
  });

  it("treats the base capture path as latest Deep Capture", () => {
    expect(resolveMovementCaptureRouteMode({
      pathname: "/demos/movement-capture",
      search: "",
    })).toEqual({
      commissioningMode: true,
      deepCaptureMode: true,
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T08:00:00.000Z"));
    startRecordingMock.mockReset();
    stopRecordingMock.mockReset();
    mediaPipeVisionMockState.options = [];
    mediaPipeVisionMockState.retry.mockReset();
    movementCaptureMockState.latestInput = null;
    captureStartReadinessMock = readyCapture;
    captureStartWholeBodyMock = trustworthyWholeBody;

    vi.mocked(useMovementCapture).mockImplementation((input) => {
      movementCaptureMockState.latestInput = input;
      const [isRecording, setIsRecording] = React.useState(false);
      const [frameCount, setFrameCount] = React.useState(0);
      const recordedFramesRef = React.useRef(
        Array.from({ length: 180 }, (_, index) => ({
          acquisitionProfileId: "movement-player-input-v1" as const,
          camera: { facingMode: "user" as const, frameHeight: 1080, frameWidth: 1920 },
          capturedAt: index * 33,
          landmarks: [],
          sourceTimestampMs: index * 33,
          startReadiness: readyCapture,
          timestamp: index * 33,
        })),
      );

      const startRecording = React.useCallback(() => {
        startRecordingMock();
        setFrameCount(0);
        setIsRecording(true);
      }, []);
      const stopRecording = React.useCallback(() => {
        stopRecordingMock();
        setFrameCount(recordedFramesRef.current.length);
        setIsRecording(false);
        return recordedFramesRef.current;
      }, []);
      const getRecordedFrames = React.useCallback(() => recordedFramesRef.current, []);
      const resetTrackingFailure = React.useCallback(() => undefined, []);

      return {
        capturePreflight: {
          channels: [{
            id: "denseBody",
            label: "Dense body surface",
            message: "400/200 persistent anchors",
            status: "ready",
          }],
          currentRecordingReady: true,
          denseCaptureOperational: true,
          deepCaptureBlockers: [],
          deepCaptureReady: true,
          readyChannelCount: 1,
          totalChannelCount: 1,
        },
        captureStartReadiness: captureStartReadinessMock,
        captureStartWholeBody: captureStartWholeBodyMock,
        denseCaptureFailure: null,
        denseCaptureOperational: true,
        denseCaptureQualityTier: null,
        frameCount,
        getRecordedFrames,
        isRecording,
        resetTrackingFailure,
        spineQuality: 92,
        startRecording,
        stopRecording,
        trackingFailure: null,
        trackingFailureDetail: null,
        trackingQuality: 96,
      } as ReturnType<typeof useMovementCapture>;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
  });

  it("shows a simple countdown before recording starts", () => {
    render(<MovementCapturePage />);

    fireEvent.click(screen.getByRole("button", { name: "Start test capture" }));
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("waiting-for-body");
    expect(screen.getByTestId("capture-gate-message")).toHaveTextContent("Perfect — hold still.");
    expect(startRecordingMock).not.toHaveBeenCalled();

    advanceCaptureSteadyHold();
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("countdown");
    expect(screen.getByTestId("capture-gate-countdown")).toHaveTextContent("3");
    expect(startRecordingMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId("capture-gate-countdown")).toHaveTextContent("2");
    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByTestId("capture-gate-countdown")).toHaveTextContent("1");
    act(() => vi.advanceTimersByTime(1_000));

    expect(startRecordingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop test capture" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Stop test capture" }));

    expect(stopRecordingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveTextContent("Save recording with 180 frames");
  });

  it("waits without a deadline and starts whenever full-body readiness arrives", () => {
    captureStartReadinessMock = {
      ...readyCapture,
      blockedReasons: ["leftFoot-missing", "rightFoot-missing"],
      canStartRecording: false,
      promptEvents: ["show-your-feet"],
      state: "blocked",
      visibleBodyParts: readyCapture.visibleBodyParts.filter((part) => (
        part !== "leftFoot" && part !== "rightFoot"
      )),
    };
    const { rerender } = render(<MovementCapturePage />);

    fireEvent.click(screen.getByRole("button", { name: "Start test capture" }));
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("waiting-for-body");
    expect(screen.getByTestId("capture-gate-message")).toHaveTextContent(
      "Walk back until your feet are visible. The countdown starts when you are fully detected.",
    );
    expect(startRecordingMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(startRecordingMock).not.toHaveBeenCalled();

    captureStartReadinessMock = readyCapture;
    rerender(<MovementCapturePage />);
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("waiting-for-body");
    advanceCaptureSteadyHold();
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("countdown");
    expect(startRecordingMock).not.toHaveBeenCalled();

    advanceCaptureCountdown();
    expect(startRecordingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop test capture" })).toBeInTheDocument();
  });

  it("never starts the countdown while seated, even when the pose model guesses hidden legs", () => {
    // Seated close to the camera: the pose model reports in-frame guesses for
    // the hidden lower body, so the recorded readiness looks "ready" while the
    // strict per-landmark visibility check knows the legs and feet are not
    // actually visible.
    captureStartWholeBodyMock = {
      missingBodyParts: ["leftLeg", "rightLeg", "leftFoot", "rightFoot"],
      wholeBodyVisible: false,
    };
    render(<MovementCapturePage />);

    fireEvent.click(screen.getByRole("button", { name: "Start test capture" }));
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("waiting-for-body");
    expect(screen.getByTestId("capture-gate-message")).toHaveTextContent(
      "Walk back until your feet are visible. The countdown starts when you are fully detected.",
    );

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("waiting-for-body");
    expect(startRecordingMock).not.toHaveBeenCalled();
  });

  it("keeps the capture page simple and leaves stopping under user control", async () => {
    window.history.replaceState(
      {},
      "",
      "/demos/movement-capture?commissioning=1&deepCapture=1",
    );
    render(<MovementCapturePage />);
    await act(async () => undefined);

    expect(screen.getByTestId("capture-profile-mode")).toHaveAttribute(
      "data-capture-profile",
      "schema-v3-deep-capture",
    );
    expect(screen.queryByText("Optional movement coverage checklist")).not.toBeInTheDocument();
    expect(screen.queryByText("Replay/Game commissioning capture")).not.toBeInTheDocument();
    expect(screen.getByText("Capture channel preflight")).toBeInTheDocument();
    expect(screen.getByTestId("capture-tracking-overlay")).toHaveTextContent("true");
    expect(screen.getByTestId("capture-tracking-toggle")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Start test capture" }));
    advanceCaptureSteadyHold();
    expect(screen.getByTestId("capture-gate-status")).toHaveTextContent("countdown");
    advanceCaptureCountdown();
    expect(startRecordingMock).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(stopRecordingMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop test capture" }));
    expect(stopRecordingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveTextContent("Save recording with 180 frames");
  });

  it("does not expose standard capture on the base route", async () => {
    window.history.replaceState({}, "", "/demos/movement-capture");
    render(<MovementCapturePage />);
    await act(async () => undefined);

    expect(screen.getByTestId("capture-profile-mode")).toHaveAttribute(
      "data-capture-profile",
      "schema-v3-deep-capture",
    );
    expect(screen.queryByText("Standard capture")).not.toBeInTheDocument();
  });

  it("shows the locked Deep Capture profile on the canonical path", async () => {
    window.history.replaceState({}, "", "/demos/movement-capture/deep");
    render(<MovementCapturePage />);
    await act(async () => undefined);

    expect(screen.getByTestId("capture-profile-mode")).toHaveAttribute(
      "data-capture-profile",
      "schema-v3-deep-capture",
    );
    expect(screen.queryByText("Capture profile locked: schema-v3 Deep Capture")).not.toBeInTheDocument();
    expect(screen.getByText("Capture channel preflight")).toBeInTheDocument();
  });

  it("falls back from GPU to CPU, disables segmentation, then auto-restarts a bounded number of times", async () => {
    window.history.replaceState({}, "", "/demos/movement-capture/deep");
    render(<MovementCapturePage />);
    await act(async () => undefined);

    expect(mediaPipeVisionMockState.options.at(-1)?.forceCpu).toBe(false);
    expect(mediaPipeVisionMockState.options.at(-1)?.enableSegmentation).toBe(true);
    expect(movementCaptureMockState.latestInput?.onTrackingRuntimeFailure).toBeTypeOf("function");

    act(() => {
      movementCaptureMockState.latestInput?.onTrackingRuntimeFailure?.();
    });
    await act(async () => undefined);

    expect(mediaPipeVisionMockState.retry).toHaveBeenCalledTimes(1);
    expect(mediaPipeVisionMockState.options.at(-1)?.forceCpu).toBe(true);
    expect(mediaPipeVisionMockState.options.at(-1)?.enableSegmentation).toBe(true);

    act(() => {
      movementCaptureMockState.latestInput?.onTrackingRuntimeFailure?.();
    });
    await act(async () => undefined);

    expect(mediaPipeVisionMockState.retry).toHaveBeenCalledTimes(2);
    expect(mediaPipeVisionMockState.options.at(-1)?.forceCpu).toBe(true);
    expect(mediaPipeVisionMockState.options.at(-1)?.enableSegmentation).toBe(false);

    // With both fallbacks engaged, further runtime failures trigger bounded
    // automatic model rebuilds instead of stranding tracking in a dead state.
    act(() => {
      movementCaptureMockState.latestInput?.onTrackingRuntimeFailure?.();
    });
    await act(async () => undefined);

    expect(mediaPipeVisionMockState.retry).toHaveBeenCalledTimes(3);
    expect(mediaPipeVisionMockState.options.at(-1)?.forceCpu).toBe(true);
    expect(mediaPipeVisionMockState.options.at(-1)?.enableSegmentation).toBe(false);

    act(() => {
      movementCaptureMockState.latestInput?.onTrackingRuntimeFailure?.();
    });
    await act(async () => undefined);

    expect(mediaPipeVisionMockState.retry).toHaveBeenCalledTimes(4);

    // After the bounded restarts are exhausted, the page stops retrying and
    // leaves the visible error plus manual Retry as the last resort.
    act(() => {
      movementCaptureMockState.latestInput?.onTrackingRuntimeFailure?.();
    });
    await act(async () => undefined);

    expect(mediaPipeVisionMockState.retry).toHaveBeenCalledTimes(4);
    expect(mediaPipeVisionMockState.options.at(-1)?.forceCpu).toBe(true);
    expect(mediaPipeVisionMockState.options.at(-1)?.enableSegmentation).toBe(false);
  });
});
