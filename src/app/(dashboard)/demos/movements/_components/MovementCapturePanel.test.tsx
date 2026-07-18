import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type Webcam from "react-webcam";
import { describe, expect, it, vi } from "vitest";
import MovementCapturePanel from "./MovementCapturePanel";

vi.mock("react-webcam", async () => {
  const ReactModule = await import("react");
  const MockWebcam = ReactModule.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    function MockWebcam(props, ref) {
      return <div ref={ref} data-testid="mock-webcam" {...props} />;
    },
  );

  return { default: MockWebcam };
});

const baseProps = {
  webcamRef: React.createRef<Webcam>(),
  canvasRef: React.createRef<HTMLCanvasElement>(),
  cameraError: false,
  isRecording: false,
  isVisionReady: false,
  visionStatus: "loading" as const,
  visionError: null,
  isPoseReady: false,
  frameCount: 0,
  trackingQuality: 0,
  spineQuality: 0,
  onCameraError: vi.fn(),
  onRetryVision: vi.fn(),
  onToggleRecording: vi.fn(),
};

describe("MovementCapturePanel", () => {
  it("shows camera permission guidance", () => {
    render(<MovementCapturePanel {...baseProps} cameraError />);

    expect(screen.getByText("Camera Check Needed")).toBeInTheDocument();
    expect(screen.getByText(/allow camera access/i)).toBeInTheDocument();
  });

  it("renders vision status, frame stats, and disabled capture until ready", () => {
    render(
      <MovementCapturePanel
        {...baseProps}
        frameCount={4}
        trackingQuality={72}
        spineQuality={81}
      />,
    );

    expect(screen.getByText("Preparing posture model...")).toBeInTheDocument();
    expect(screen.getByText("Moments 4")).toBeInTheDocument();
    expect(screen.getByText("Alignment 72%")).toBeInTheDocument();
    expect(screen.getByText("Spine 81%")).toBeInTheDocument();
    expect(screen.getByTestId("recording-lifecycle-status")).toHaveTextContent("Not recording");
    expect(screen.getByRole("button", { name: "Start posture capture" })).toBeDisabled();
  });

  it("forwards retry and recording actions", () => {
    const onRetryVision = vi.fn();
    const onToggleRecording = vi.fn();

    render(
      <MovementCapturePanel
        {...baseProps}
        isVisionReady
        visionStatus="failed"
        visionError="Model failed"
        onRetryVision={onRetryVision}
        onToggleRecording={onToggleRecording}
      />,
    );

    expect(screen.getByText("Posture Tracking: Check needed")).toBeInTheDocument();
    expect(screen.getByText("Model failed")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retry tracking" }));
    fireEvent.click(screen.getByRole("button", { name: "Start posture capture" }));

    expect(onRetryVision).toHaveBeenCalledTimes(1);
    expect(onToggleRecording).toHaveBeenCalledTimes(1);
  });

  it("keeps the lighter tracking overlay by default and exposes an explicit all-points toggle", () => {
    const onToggleTrackingDetail = vi.fn();
    const { rerender } = render(
      <MovementCapturePanel
        {...baseProps}
        onToggleTrackingDetail={onToggleTrackingDetail}
        showTrackingDetailToggle
      />,
    );

    const essentialButton = screen.getByRole("button", { name: "Show all tracking points" });
    expect(essentialButton).toHaveTextContent("Points: Essential");
    expect(essentialButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(essentialButton);
    expect(onToggleTrackingDetail).toHaveBeenCalledTimes(1);

    rerender(
      <MovementCapturePanel
        {...baseProps}
        onToggleTrackingDetail={onToggleTrackingDetail}
        showAllTrackingPoints
        showTrackingDetailToggle
      />,
    );
    expect(screen.getByRole("button", { name: "Show essential tracking points" }))
      .toHaveTextContent("Points: All");
  });

  it("shows an untimed armed state and blocks duplicate starts", () => {
    const onToggleRecording = vi.fn();

    render(
      <MovementCapturePanel
        {...baseProps}
        isVisionReady
        visionStatus="ready"
        isPoseReady
        captureReadinessMessage="Move into position at your own pace."
        captureReadinessStatus="waiting-for-body"
        onToggleRecording={onToggleRecording}
      />,
    );

    expect(screen.getByText("Move into position at your own pace.")).toBeInTheDocument();
    expect(screen.getByTestId("recording-lifecycle-status")).toHaveTextContent(
      "Armed — not recording yet",
    );
    expect(screen.getByRole("button", { name: "Start posture capture" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Start posture capture" }));

    expect(onToggleRecording).not.toHaveBeenCalled();
  });

  it("shows capture visibility block messages", () => {
    render(
      <MovementCapturePanel
        {...baseProps}
        isVisionReady
        visionStatus="ready"
        isPoseReady
        captureReadinessMessage="Show your whole body."
        captureReadinessStatus="blocked"
      />,
    );

    expect(screen.getByText("Show your whole body.")).toBeInTheDocument();
    expect(screen.getByTestId("recording-lifecycle-status")).toHaveTextContent(
      "Recording did not start",
    );
    expect(screen.getByRole("button", { name: "Start posture capture" })).toBeEnabled();
  });

  it("shows active capture state", () => {
    render(
      <MovementCapturePanel
        {...baseProps}
        isRecording
        isVisionReady
        visionStatus="ready"
        isPoseReady
      />,
    );

    expect(screen.getByText("Posture Tracking: Ready")).toBeInTheDocument();
    expect(screen.getByTestId("recording-lifecycle-status")).toHaveTextContent(
      "Recording — 0 moments saved",
    );
    expect(screen.getByRole("button", { name: "Stop posture capture" })).toBeEnabled();
  });

  it("shows exact current and planned Deep Capture channel evidence", () => {
    render(
      <MovementCapturePanel
        {...baseProps}
        isVisionReady
        visionStatus="ready"
        isPoseReady
        capturePreflight={{
          channels: [
            {
              id: "pose",
              label: "Body pose",
              message: "33/33 available",
              observedCount: 33,
              status: "ready",
              targetCount: 33,
            },
            {
              id: "palmWrist",
              label: "Palm and wrist rotation",
              message: "Planned: palm normal and wrist swing/twist are not captured yet",
              status: "planned",
            },
          ],
          currentRecordingReady: true,
          deepCaptureBlockers: [
            "Palm and wrist rotation: Planned: palm normal and wrist swing/twist are not captured yet",
          ],
          deepCaptureReady: false,
          readyChannelCount: 1,
          totalChannelCount: 2,
        }}
      />,
    );

    expect(screen.getByRole("region", { name: "Capture channel preflight" })).toBeInTheDocument();
    expect(screen.getByText("Current gate ready")).toBeInTheDocument();
    expect(screen.getByText("Deep Capture 1/2")).toBeInTheDocument();
    expect(screen.getByText("33/33 available")).toBeInTheDocument();
    expect(screen.getByText(/palm normal and wrist swing\/twist are not captured yet/i)).toBeInTheDocument();
  });
});
