import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import type Webcam from "react-webcam";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MovementHud from "./MovementHud";

/**
 * Changing camera without leaving practice.
 *
 * The studio deliberately shipped without a picker: it honoured whatever the
 * capture screen had been set to, so a student would not have to choose twice.
 * That reasoning holds right up until the chosen camera is the wrong one or has
 * been unplugged — and then the only route to a picture was to leave the studio,
 * change it elsewhere and come back, while the screen said "camera unavailable"
 * and offered nothing to do about it.
 *
 * What is pinned here is when it appears. A picker over a live 3D scene is
 * clutter unless it is answering a question somebody actually has.
 */

vi.mock("react-webcam", async () => {
  const ReactModule = await import("react");
  const MockWebcam = ReactModule.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    function MockWebcam(props, ref) {
      return <div ref={ref} data-testid="mock-webcam" {...props} />;
    },
  );
  return { default: MockWebcam };
});

const cameras = vi.hoisted(() => ({
  devices: [] as Array<{ deviceId: string; label: string }>,
  activeDeviceId: "",
  selectDevice: vi.fn(),
}));

vi.mock("../../../_hooks/useMovementCameraDevices", () => ({
  useMovementCameraDevices: () => ({
    devices: cameras.devices,
    activeDeviceId: cameras.activeDeviceId,
    preferredDeviceId: cameras.activeDeviceId,
    selectDevice: cameras.selectDevice,
    refreshDevices: vi.fn(),
  }),
}));

const baseProps = {
  movementTitle: "Randoms",
  difficulty: "Beginner",
  hudScore: 0,
  hudSync: 0,
  isPlaying: false,
  isVisionReady: true,
  isTrackingCalibrated: true,
  isCalibrating: false,
  visionStatus: "ready" as const,
  visionError: null,
  isCameraReady: true,
  cameraError: null,
  calibrationStatus: "Ready",
  webcamRef: React.createRef<Webcam>(),
  onTogglePlaying: vi.fn(),
  onRetryVision: vi.fn(),
  onCalibrate: vi.fn(),
  onResetStudio: vi.fn(),
};

describe("MovementHud camera picker", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cameras.devices = [];
    cameras.activeDeviceId = "";
  });

  it("stays out of the way when there is only one camera and it works", () => {
    cameras.devices = [{ deviceId: "facetime", label: "FaceTime HD Camera" }];
    render(<MovementHud {...baseProps} />);

    expect(screen.queryByLabelText("Camera")).not.toBeInTheDocument();
  });

  it("appears when there is a real choice to make", () => {
    cameras.devices = [
      { deviceId: "insta360", label: "Insta360 Link" },
      { deviceId: "facetime", label: "FaceTime HD Camera" },
    ];
    cameras.activeDeviceId = "insta360";
    render(<MovementHud {...baseProps} />);

    expect(screen.getByLabelText("Camera")).toHaveValue("insta360");
  });

  it("appears when the camera needs attention, even with only one", () => {
    // The case it exists for: the studio says it cannot see a camera, and this
    // is the only thing on screen a person can do about it.
    cameras.devices = [{ deviceId: "facetime", label: "FaceTime HD Camera" }];
    render(<MovementHud {...baseProps} isCameraReady={false} cameraError="Camera access unavailable" />);

    expect(screen.getByLabelText("Camera")).toBeInTheDocument();
  });

  it("switches camera without leaving the studio", () => {
    cameras.devices = [
      { deviceId: "insta360", label: "Insta360 Link" },
      { deviceId: "facetime", label: "FaceTime HD Camera" },
    ];
    cameras.activeDeviceId = "insta360";
    render(<MovementHud {...baseProps} />);

    fireEvent.change(screen.getByLabelText("Camera"), { target: { value: "facetime" } });

    expect(cameras.selectDevice).toHaveBeenCalledWith("facetime");
  });

  it("offers the browser's own default as a way back", () => {
    // A remembered choice that no longer works should not be a dead end.
    cameras.devices = [
      { deviceId: "insta360", label: "Insta360 Link" },
      { deviceId: "facetime", label: "FaceTime HD Camera" },
    ];
    render(<MovementHud {...baseProps} />);

    expect(screen.getByRole("option", { name: "Browser default" })).toBeInTheDocument();
  });

  it("is absent in preview mode, where there is no camera at all", () => {
    cameras.devices = [
      { deviceId: "insta360", label: "Insta360 Link" },
      { deviceId: "facetime", label: "FaceTime HD Camera" },
    ];
    render(<MovementHud {...baseProps} isPreviewMode />);

    expect(screen.queryByLabelText("Camera")).not.toBeInTheDocument();
  });
});
