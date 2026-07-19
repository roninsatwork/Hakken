import React, { act } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMovementCapture } from "../movements/_hooks/useMovementCapture";
import type { MovementStartReadiness } from "../movements/_lib/movementSourceFrame";
import MovementCapturePage, {
  DEEP_CAPTURE_COVERAGE_CHECKLIST,
  resolveMovementCaptureRouteMode,
  resolveMovementRecordingSaveRequirements,
} from "./page";

const startRecordingMock = vi.hoisted(() => vi.fn());
const stopRecordingMock = vi.hoisted(() => vi.fn());

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
  useMediaPipeVision: () => ({
    error: null,
    faceLandmarker: {},
    handLandmarker: {},
    isReady: true,
    poseLandmarker: {},
    retry: vi.fn(),
    status: "ready",
  }),
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
    captureReadinessStatus,
    isRecording,
    onToggleRecording,
  }: {
    captureReadinessStatus: string;
    isRecording: boolean;
    onToggleRecording: () => void;
  }) => (
    <section>
      <output data-testid="capture-gate-status">{captureReadinessStatus}</output>
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

  it("keeps ordinary capture explicit and visibly separate", () => {
    expect(resolveMovementCaptureRouteMode({
      pathname: "/demos/movement-capture",
      search: "",
    })).toEqual({
      commissioningMode: false,
      deepCaptureMode: false,
    });
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T08:00:00.000Z"));
    startRecordingMock.mockReset();
    stopRecordingMock.mockReset();
    captureStartReadinessMock = readyCapture;

    vi.mocked(useMovementCapture).mockImplementation(() => {
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

      return {
        capturePreflight: {
          channels: [],
          currentRecordingReady: true,
          deepCaptureBlockers: [],
          deepCaptureReady: false,
          readyChannelCount: 0,
          totalChannelCount: 0,
        },
        captureStartReadiness: captureStartReadinessMock,
        denseCaptureQualityTier: null,
        frameCount,
        getRecordedFrames,
        isRecording,
        spineQuality: 92,
        startRecording,
        stopRecording,
        trackingQuality: 96,
      } as ReturnType<typeof useMovementCapture>;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    window.history.replaceState({}, "", "/");
  });

  it("starts as soon as the body is ready and reaches save without a timed check", () => {
    render(<MovementCapturePage />);

    fireEvent.click(screen.getByRole("button", { name: "Start test capture" }));
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
    expect(startRecordingMock).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(startRecordingMock).not.toHaveBeenCalled();

    captureStartReadinessMock = readyCapture;
    rerender(<MovementCapturePage />);
    expect(startRecordingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Stop test capture" })).toBeInTheDocument();
  });

  it("shows an untimed optional checklist and leaves stopping under user control", async () => {
    window.history.replaceState(
      {},
      "",
      "/demos/movement-capture?commissioning=1&deepCapture=1",
    );
    render(<MovementCapturePage />);
    await act(async () => undefined);

    expect(screen.getByText("Optional movement coverage checklist")).toBeInTheDocument();
    for (const item of DEEP_CAPTURE_COVERAGE_CHECKLIST) {
      expect(screen.getByText(item.label)).toBeInTheDocument();
      expect(screen.getByText(item.instruction)).toBeInTheDocument();
    }
    expect(screen.getByText(/Nothing here is timed or compulsory/i)).toBeInTheDocument();
    expect(screen.getByTestId("capture-profile-mode")).toHaveAttribute(
      "data-capture-profile",
      "schema-v3-deep-capture",
    );

    fireEvent.click(screen.getByRole("button", { name: "Start test capture" }));
    expect(startRecordingMock).toHaveBeenCalledTimes(1);

    act(() => vi.advanceTimersByTime(5 * 60_000));
    expect(stopRecordingMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop test capture" }));
    expect(stopRecordingMock).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog")).toHaveTextContent("Save recording with 180 frames");
  });

  it("cannot silently look like Deep Capture on the standard route", async () => {
    window.history.replaceState({}, "", "/demos/movement-capture");
    render(<MovementCapturePage />);
    await act(async () => undefined);

    expect(screen.getByTestId("capture-profile-mode")).toHaveAttribute(
      "data-capture-profile",
      "schema-v2-standard",
    );
    expect(screen.getByRole("link", { name: "Switch to schema-v3 Deep Capture" })).toHaveAttribute(
      "href",
      "/demos/movement-capture/deep",
    );
  });

  it("shows the locked Deep Capture profile on the canonical path", async () => {
    window.history.replaceState({}, "", "/demos/movement-capture/deep");
    render(<MovementCapturePage />);
    await act(async () => undefined);

    expect(screen.getByTestId("capture-profile-mode")).toHaveAttribute(
      "data-capture-profile",
      "schema-v3-deep-capture",
    );
    expect(screen.getByText("Capture profile locked: schema-v3 Deep Capture")).toBeInTheDocument();
  });
});
