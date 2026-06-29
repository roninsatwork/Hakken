import { act, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type Webcam from "react-webcam";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarSelectorLobby from "./AvatarSelectorLobby";
import MovementCalibrationOverlay from "./MovementCalibrationOverlay";
import MovementCompletionDialog from "./MovementCompletionDialog";
import MovementDebugFrameScrubber from "./MovementDebugFrameScrubber";
import MovementFeedbackOverlay from "./MovementFeedbackOverlay";
import MovementHud from "./MovementHud";
import MovementTrackingDebugOverlay from "./MovementTrackingDebugOverlay";
import type {
  MovementCalibration,
  MovementTrackingDebugState,
} from "../../../_lib/movementTrackingCalibration";

vi.mock("react-webcam", async () => {
  const ReactModule = await import("react");
  const MockWebcam = ReactModule.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    function MockWebcam(props, ref) {
      return <div ref={ref} data-testid="mock-webcam" {...props} />;
    },
  );

  return { default: MockWebcam };
});

afterEach(() => {
  vi.useRealTimers();
});

describe("movement play components", () => {
  it("renders the avatar lobby with selectable player and instructor avatars", () => {
    const onStart = vi.fn();
    const setPlayerAvatarUrl = vi.fn();
    const setInstructorAvatarUrl = vi.fn();

    render(
      <AvatarSelectorLobby
        playerAvatarUrl="/models/VIPE_Hero__1793.vrm"
        setPlayerAvatarUrl={setPlayerAvatarUrl}
        instructorAvatarUrl="/models/VIPE_Hero__1914.vrm"
        setInstructorAvatarUrl={setInstructorAvatarUrl}
        onStart={onStart}
      />,
    );

    expect(screen.getByText("Private posture studio")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Select Coach & Student" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Begin Practice/i }));

    expect(onStart).toHaveBeenCalledTimes(1);

    const playerSection = screen.getByRole("heading", { name: "Student" }).closest("section");
    const instructorSection = screen.getByRole("heading", { name: "Coach" }).closest("section");

    expect(playerSection).not.toBeNull();
    expect(instructorSection).not.toBeNull();

    fireEvent.click(within(playerSection as HTMLElement).getByRole("button", { name: "Tom" }));
    fireEvent.click(within(instructorSection as HTMLElement).getByRole("button", { name: "Rachel" }));

    expect(setPlayerAvatarUrl).toHaveBeenCalledWith("/models/VIPE_Hero__949.vrm");
    expect(setInstructorAvatarUrl).toHaveBeenCalledWith("/models/VIPE_Hero__2575.vrm");
    expect(within(playerSection as HTMLElement).getByRole("button", { name: "Jane" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(
      within(instructorSection as HTMLElement).getByRole("button", { name: "Charlotte" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("hides and shows completion actions", () => {
    const onExitMatch = vi.fn();
    const onRematch = vi.fn();

    const { rerender } = render(
      <MovementCompletionDialog
        isOpen={false}
        finalScore={420}
        onExitMatch={onExitMatch}
        onRematch={onRematch}
      />,
    );

    expect(screen.queryByText("Practice Complete")).not.toBeInTheDocument();

    rerender(
      <MovementCompletionDialog
        isOpen
        finalScore={420}
        onExitMatch={onExitMatch}
        onRematch={onRematch}
      />,
    );

    expect(screen.getByText("Practice Complete")).toBeInTheDocument();
    expect(screen.getByText("420")).toBeInTheDocument();

    rerender(
      <MovementCompletionDialog
        isOpen
        finalScore={0}
        isPreviewMode
        onExitMatch={onExitMatch}
        onRematch={onRematch}
      />,
    );

    expect(screen.getByText("Guided Preview")).toBeInTheDocument();
    expect(screen.getByText("Studio Ready")).toBeInTheDocument();
    expect(screen.getByText("The coach and student flow is ready for a live posture check.")).toBeInTheDocument();
    expect(screen.queryByText("Alignment Result")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Leave Studio" }));
    fireEvent.click(screen.getByRole("button", { name: "Practice Again" }));

    expect(onExitMatch).toHaveBeenCalledTimes(1);
    expect(onRematch).toHaveBeenCalledTimes(1);
  });

  it("renders feedback text only when present", () => {
    const { rerender } = render(<MovementFeedbackOverlay feedbackMsg={null} />);

    expect(screen.queryByText("Perfect!")).not.toBeInTheDocument();

    rerender(<MovementFeedbackOverlay feedbackMsg={{ text: "Perfect!", id: 1 }} />);

    expect(screen.getByText("Perfect!")).toBeInTheDocument();
  });

  it("renders calibration action until tracking is calibrated", () => {
    const onCalibrate = vi.fn();
    const onSkipCalibration = vi.fn();

    const { rerender } = render(
      <MovementCalibrationOverlay
        isCalibrated={false}
        isCalibrating={false}
        isVisionReady
        calibrationStatus="Calibration needed"
        calibrationProgress={0}
        calibrationSampleCount={0}
        calibrationCountdownSeconds={0}
        onCalibrate={onCalibrate}
        onSkipCalibration={onSkipCalibration}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start Check-In" }));
    fireEvent.click(screen.getByRole("button", { name: "Start Guided Preview" }));

    expect(screen.getByText("Posture Check-In")).toBeInTheDocument();
    expect(screen.getByText("0 posture moments")).toBeInTheDocument();
    expect(onCalibrate).toHaveBeenCalledTimes(1);
    expect(onSkipCalibration).toHaveBeenCalledTimes(1);

    rerender(
      <MovementCalibrationOverlay
        isCalibrated
        isCalibrating={false}
        isVisionReady
        calibrationStatus="Calibrated"
        calibrationProgress={100}
        calibrationSampleCount={18}
        calibrationCountdownSeconds={0}
        onCalibrate={onCalibrate}
        onSkipCalibration={onSkipCalibration}
      />,
    );

    expect(screen.queryByText("Posture Check-In")).not.toBeInTheDocument();
  });

  it("explains weak calibration and allows continuing for manual tuning", () => {
    const onSkipCalibration = vi.fn();

    render(
      <MovementCalibrationOverlay
        isCalibrated={false}
        isCalibrating={false}
        isVisionReady
        calibrationStatus="Needs stronger tracking"
        calibrationProgress={100}
        calibrationSampleCount={7}
        calibrationCountdownSeconds={0}
        onCalibrate={vi.fn()}
        onSkipCalibration={onSkipCalibration}
      />,
    );

    expect(screen.getByText("Needs stronger tracking")).toBeInTheDocument();
    expect(screen.getByText(/Start a guided preview now/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Start Guided Preview" }));

    expect(onSkipCalibration).toHaveBeenCalledTimes(1);
  });

  it("shows a calibration countdown before sampling starts", () => {
    render(
      <MovementCalibrationOverlay
        isCalibrated={false}
        isCalibrating
        isVisionReady
        calibrationStatus="Get ready"
        calibrationProgress={0}
        calibrationSampleCount={0}
        calibrationCountdownSeconds={3}
        onCalibrate={vi.fn()}
        onSkipCalibration={vi.fn()}
      />,
    );

    expect(screen.getByText("SET YOUR POSTURE: 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Checking Posture" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Start Guided Preview" })).toBeDisabled();
  });

  it("disables playback until vision is ready and exposes retry on errors", () => {
    const onTogglePlaying = vi.fn();
    const onRetryVision = vi.fn();
    const webcamRef = React.createRef<Webcam>();

    render(
      <MovementHud
        movementTitle="Roll Down"
        difficulty="Beginner"
        hudScore={120}
        hudSync={84}
        isPlaying={false}
        isVisionReady={false}
        isTrackingCalibrated={false}
        isCalibrating={false}
        visionStatus="failed"
        visionError="Model load failed"
        calibrationStatus="Ready"
        webcamRef={webcamRef}
        onTogglePlaying={onTogglePlaying}
        onRetryVision={onRetryVision}
        onCalibrate={vi.fn()}
      />,
    );

    expect(screen.getByText("Roll Down")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start practice" })).toBeDisabled();

    fireEvent.click(screen.getByText("Retry Vision"));

    expect(onRetryVision).toHaveBeenCalledTimes(1);
    expect(onTogglePlaying).not.toHaveBeenCalled();
  });

  it("calls play toggle when the HUD is ready", () => {
    const onTogglePlaying = vi.fn();

    render(
      <MovementHud
        movementTitle="Roll Down"
        difficulty="Beginner"
        hudScore={0}
        hudSync={0}
        isPlaying={false}
        isVisionReady
        isTrackingCalibrated
        isCalibrating={false}
        visionStatus="ready"
        visionError={null}
        calibrationStatus="Ready"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={onTogglePlaying}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start practice" }));

    expect(onTogglePlaying).toHaveBeenCalledTimes(1);
  });

  it("exposes recalibration when vision is ready", () => {
    const onCalibrate = vi.fn();

    render(
      <MovementHud
        movementTitle="Roll Down"
        difficulty="Beginner"
        hudScore={0}
        hudSync={0}
        isPlaying={false}
        isVisionReady
        isTrackingCalibrated={false}
        isCalibrating={false}
        visionStatus="ready"
        visionError={null}
        calibrationStatus="Calibration needed"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={vi.fn()}
        onRetryVision={vi.fn()}
        onCalibrate={onCalibrate}
      />,
    );

    expect(screen.getByRole("button", { name: "Start practice" })).toBeDisabled();

    fireEvent.click(screen.getByText("Posture check"));

    expect(onCalibrate).toHaveBeenCalledTimes(1);
  });

  it("surfaces camera stream issues when vision is ready but no stream arrives", () => {
    vi.useFakeTimers();

    render(
      <MovementHud
        movementTitle="Roll Down"
        difficulty="Beginner"
        hudScore={0}
        hudSync={0}
        isPlaying={false}
        isVisionReady
        isTrackingCalibrated={false}
        isCalibrating={false}
        visionStatus="ready"
        visionError={null}
        isCameraReady={false}
        calibrationStatus="Calibration needed"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={vi.fn()}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    );

    expect(screen.queryByText("Camera check needed")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.getByText("Camera check needed")).toBeInTheDocument();
    expect(screen.getByText("Allow camera access")).toBeInTheDocument();
  });

  it("labels skipped calibration as preview mode even when camera permission is blocked", () => {
    vi.useFakeTimers();

    render(
      <MovementHud
        movementTitle="Roll Down"
        difficulty="Beginner"
        hudScore={0}
        hudSync={0}
        isPlaying
        isVisionReady
        isTrackingCalibrated
        isPreviewMode
        isCalibrating={false}
        visionStatus="ready"
        visionError={null}
        isCameraReady={false}
        cameraError="Camera permission is blocked"
        calibrationStatus="Skipped calibration"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={vi.fn()}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.getByText("Preview mode")).toBeInTheDocument();
    expect(screen.queryByText("Camera check needed")).not.toBeInTheDocument();
    expect(screen.queryByText("Camera permission is blocked")).not.toBeInTheDocument();
    expect(screen.getByTestId("mock-webcam")).toBeInTheDocument();
    expect(screen.getByTestId("movement-camera-preview")).toHaveClass("left-1/2");
    expect(screen.getByTestId("movement-camera-preview")).toHaveClass("w-[min(72vw,420px)]");
  });

  it("allows preview playback even when live vision is not ready", () => {
    const onTogglePlaying = vi.fn();

    render(
      <MovementHud
        movementTitle="Roll Down"
        difficulty="Beginner"
        hudScore={0}
        hudSync={0}
        isPlaying={false}
        isVisionReady={false}
        isTrackingCalibrated
        isPreviewMode
        isCalibrating={false}
        visionStatus="loading"
        visionError={null}
        calibrationStatus="Skipped calibration"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={onTogglePlaying}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
      />,
    );

    const playButton = screen.getByRole("button", { name: "Start practice" });
    expect(playButton).toBeEnabled();

    fireEvent.click(playButton);

    expect(onTogglePlaying).toHaveBeenCalledTimes(1);
  });

  it("scrubs recorded movement frames in debug mode", () => {
    vi.useFakeTimers();

    const frameIndexRef: React.MutableRefObject<number> = { current: 4 };
    const onFrameChange = vi.fn((frameIndex: number) => {
      frameIndexRef.current = frameIndex;
    });
    const onPlayingChange = vi.fn();

    render(
      <MovementDebugFrameScrubber
        frameCount={12}
        frameIndexRef={frameIndexRef}
        isEnabled
        isPlaying
        onFrameChange={onFrameChange}
        onPlayingChange={onPlayingChange}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByText("Debug Scrub")).toBeInTheDocument();
    expect(screen.getByText("Frame")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.getByText("/ 12")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));

    expect(onPlayingChange).toHaveBeenCalledWith(false);
    expect(onFrameChange).toHaveBeenCalledWith(5);
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Movement debug frame" }), {
      target: { value: "9" },
    });

    expect(onFrameChange).toHaveBeenCalledWith(9);
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Debug frame number" }), {
      target: { value: "4" },
    });

    expect(onFrameChange).toHaveBeenCalledWith(3);
    expect(screen.getByDisplayValue("4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pause debug playback" }));

    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });

  it("renders compact tracking diagnostics and stale warnings", () => {
    vi.useFakeTimers();

    const calibration: MovementCalibration = {
      calibratedAt: 0,
      headNeutral: { pitch: 0, yaw: 0, roll: 0, confidence: 0.95, source: "face" },
      hipCenter: { x: 0.5, y: 0.7, z: 0 },
      shoulderWidth: 0.3,
      torsoHeight: 0.4,
      floorY: 0.95,
      quality: 0.92,
    };
    const debugRef: React.MutableRefObject<MovementTrackingDebugState | null> = {
      current: {
        updatedAt: 0,
        headRaw: { pitch: 0.1, yaw: 0.2, roll: -0.1, confidence: 0.95, source: "face" },
        headApplied: { pitch: 0, yaw: 0.1, roll: -0.05, confidence: 0.95, source: "face" },
        bodyConfidence: {
          torso: 0.94,
          leftWrist: 0.9,
          leftHand: 0.88,
          rightWrist: 0.86,
          rightHand: 0.84,
          leftKnee: 0.91,
          rightKnee: 0.9,
          leftFoot: 0.87,
          rightFoot: 0.86,
        },
        fallbacks: {
          head: "face",
          leftArm: "pose",
          rightArm: "hand",
          leftKnee: "pose",
          rightKnee: "pose",
          leftFoot: "pose",
          rightFoot: "pose",
          floor: "calibrated-floor",
          owners: "head neutral; torso neutral; lower recorded-neutral; feet planted-flat",
        },
        retarget: {
          appliedLowerBody: 6,
          footLockCorrection: 0.02,
          footLockDrift: 0.04,
          footLockStrength: 0.85,
          hipDrop: 0.51,
          leftFootContact: true,
          leftKneeLift: 0.34,
          plantedSquatIkDepth: 0.62,
          rightFootContact: true,
          rightKneeLift: 0.33,
          solvedSegments: 11,
          sourceQuality: 0.88,
          squatDepth: 0.66,
          totalLowerBody: 6,
          totalSegments: 11,
          visualRootDrop: 0.71,
        },
        profileName: "VIPE_Hero__1793.vrm",
        calibrationQuality: 0.92,
      },
    };

    render(
      <MovementTrackingDebugOverlay
        calibration={calibration}
        debugRef={debugRef}
        isEnabled
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText("Posture Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Age 1.5s")).toBeInTheDocument();
    expect(screen.getByText("Tune: Restart camera tracking")).toBeInTheDocument();
    expect(screen.getByText("VIPE_Hero__1793.vrm")).toBeInTheDocument();
    expect(screen.getByText("Tracking data is stale")).toBeInTheDocument();
    expect(screen.getByText("head neutral; torso neutral; lower recorded-neutral; feet planted-flat")).toBeInTheDocument();
    expect(screen.getByText("pose / hand")).toBeInTheDocument();
    expect(screen.getByText("Retarget Metrics")).toBeInTheDocument();
    expect(screen.getByText("0.66 / 0.51")).toBeInTheDocument();
    expect(screen.getByText("0.34 / 0.33")).toBeInTheDocument();
    expect(screen.getByText("0.85 c0.02 d0.04")).toBeInTheDocument();
  });
});
