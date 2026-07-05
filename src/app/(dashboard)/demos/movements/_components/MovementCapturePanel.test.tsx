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

  it("shows capture countdown and blocks duplicate starts", () => {
    const onToggleRecording = vi.fn();

    render(
      <MovementCapturePanel
        {...baseProps}
        isVisionReady
        visionStatus="ready"
        isPoseReady
        captureReadinessCountdownSeconds={3}
        captureReadinessMessage="Walk back into frame."
        captureReadinessStatus="countdown"
        onToggleRecording={onToggleRecording}
      />,
    );

    expect(screen.getByText("Get ready: 3")).toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Stop posture capture" })).toBeEnabled();
  });
});
