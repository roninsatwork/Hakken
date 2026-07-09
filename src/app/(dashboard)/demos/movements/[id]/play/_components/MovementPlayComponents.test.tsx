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
import { makeMovementAvatarProofPose } from "../../../_lib/movementAvatarProofFixtures";
import type { MovementMotionFrame } from "../../../_lib/movementMotionFrame";
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
        finalSpineScore={82}
        finalSpineCue="Keep tall spine as the knees bend."
        onExitMatch={onExitMatch}
        onRematch={onRematch}
      />,
    );

    expect(screen.getByText("Practice Complete")).toBeInTheDocument();
    expect(screen.getByText("420")).toBeInTheDocument();
    expect(screen.getByText("Best Spine")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
    expect(screen.getByText("Keep tall spine as the knees bend.")).toBeInTheDocument();

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
    expect(screen.queryByRole("button", { name: "Debug Auto Baseline" })).not.toBeInTheDocument();
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

  it("shows the debug auto-baseline trigger only when the debug callback is provided", () => {
    const onStartDebugAutoBaseline = vi.fn();

    render(
      <MovementCalibrationOverlay
        isCalibrated={false}
        isCalibrating={false}
        isVisionReady
        calibrationStatus="Calibration needed"
        calibrationProgress={0}
        calibrationSampleCount={0}
        calibrationCountdownSeconds={0}
        onCalibrate={vi.fn()}
        onSkipCalibration={vi.fn()}
        onStartDebugAutoBaseline={onStartDebugAutoBaseline}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Debug Auto Baseline" }));

    expect(onStartDebugAutoBaseline).toHaveBeenCalledTimes(1);
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
        hudSpine={76}
        hudSpineCue="Stack head over hips."
        hudSpineReadiness="needs-attention"
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
        onResetStudio={vi.fn()}
      />,
    );

    expect(screen.getByText("Roll Down")).toBeInTheDocument();
    expect(screen.getByText("120")).toBeInTheDocument();
    expect(screen.getByText("84%")).toBeInTheDocument();
    expect(screen.getByText("76%")).toBeInTheDocument();
    expect(screen.getAllByText("Check spine")).not.toHaveLength(0);
    expect(screen.getByText("Stack head over hips.")).toBeInTheDocument();
    expect(screen.getByText("Keep head, shoulders, and hips visible.")).toBeInTheDocument();
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
        onResetStudio={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Start practice" }));

    expect(onTogglePlaying).toHaveBeenCalledTimes(1);
  });

  it("shows shared setup recovery guidance when tracking is otherwise playable", () => {
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
        setupRecoveryCue="Show both feet."
        visionStatus="ready"
        visionError={null}
        calibrationStatus="Ready"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={vi.fn()}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
        onResetStudio={vi.fn()}
      />,
    );

    expect(screen.getByTestId("movement-hud-setup-recovery-cue")).toHaveTextContent("Show both feet.");
    expect(screen.queryByText("Spine ready")).not.toBeInTheDocument();
  });

  it("shows start-readiness countdown before practice begins", () => {
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
        startReadinessCountdownSeconds={4}
        startReadinessMessage="Walk back into frame."
        startReadinessStatus="countdown"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={onTogglePlaying}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
        onResetStudio={vi.fn()}
      />,
    );

    expect(screen.getByText("Get Ready")).toBeInTheDocument();
    expect(screen.getByText("Get ready: 4")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start practice" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Start practice" }));

    expect(onTogglePlaying).not.toHaveBeenCalled();
  });

  it("shows start-readiness block messages", () => {
    render(
      <MovementHud
        movementTitle="Roll Down"
        difficulty="Beginner"
        hudScore={0}
        hudSync={0}
        hudSpine={12}
        hudSpineCue="Waiting for spine tracking."
        hudSpineReadiness="blocked"
        isPlaying={false}
        isVisionReady
        isTrackingCalibrated
        isCalibrating={false}
        visionStatus="ready"
        visionError={null}
        calibrationStatus="Ready"
        startReadinessMessage="Show your whole body."
        startReadinessStatus="blocked"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={vi.fn()}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
        onResetStudio={vi.fn()}
      />,
    );

    expect(screen.getByText("Check Setup")).toBeInTheDocument();
    expect(screen.getByText("Show your whole body.")).toBeInTheDocument();
    expect(screen.getAllByText("Spine blocked")).not.toHaveLength(0);
    expect(screen.getByText("Waiting for spine tracking.")).toBeInTheDocument();
    expect(screen.getByText("Step back until head, shoulders, and hips are visible.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Start practice" })).toBeEnabled();
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
        onResetStudio={vi.fn()}
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
        onResetStudio={vi.fn()}
      />,
    );

    expect(screen.queryByText("Camera check needed")).not.toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(screen.getByText("Camera check needed")).toBeInTheDocument();
    expect(screen.getByText("Allow camera access")).toBeInTheDocument();
  });

  it("offers presenter reset and guided preview recovery from camera issues", () => {
    vi.useFakeTimers();

    const onResetStudio = vi.fn();
    const onStartGuidedPreview = vi.fn();

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
        cameraError="Camera permission is blocked"
        calibrationStatus="Calibration needed"
        webcamRef={React.createRef<Webcam>()}
        onTogglePlaying={vi.fn()}
        onRetryVision={vi.fn()}
        onCalibrate={vi.fn()}
        onResetStudio={onResetStudio}
        onStartGuidedPreview={onStartGuidedPreview}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Reset studio" }));
    fireEvent.click(screen.getByRole("button", { name: "Guided Preview" }));

    expect(screen.getByText("Camera check needed")).toBeInTheDocument();
    expect(screen.getByText("Camera permission is blocked")).toBeInTheDocument();
    expect(onResetStudio).toHaveBeenCalledTimes(1);
    expect(onStartGuidedPreview).toHaveBeenCalledTimes(1);
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
        onResetStudio={vi.fn()}
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
        onResetStudio={vi.fn()}
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
    const onDebugFrameRouteChange = vi.fn();
    const onPlayingChange = vi.fn();

    render(
      <MovementDebugFrameScrubber
        frameCount={12}
        frameIndexRef={frameIndexRef}
        isEnabled
        isPlaying
        onDebugFrameRouteChange={onDebugFrameRouteChange}
        onFrameChange={onFrameChange}
        onPlayingChange={onPlayingChange}
        qaPresets={[
          {
            cases: ["strongest-squat"],
            detail: "strongest squat proof",
            frameIndex: 10,
            id: "squat",
            label: "Squat",
            status: "jump",
          },
          {
            cases: ["strongest-left-knee-lift"],
            detail: "left knee proof shares an analyzer hotspot frame",
            frameIndex: 6,
            id: "left-knee-proof",
            label: "Left Proof",
            status: "jump",
          },
          {
            cases: ["strongest-root-travel"],
            detail: "no passing root-travel frame",
            frameIndex: null,
            id: "root-travel-blocked",
            label: "Root Travel",
            status: "blocked",
          },
        ]}
        recordingAnalysis={{
          frameCount: 12,
          peakLeftKneeLift: {
            balancedPlantedSquatDepth: 0.04,
            frameIndex: 6,
            hipDrop: 0.02,
            leftFootContact: true,
            leftKneeLift: 0.72,
            rightFootContact: true,
            rightKneeLift: 0.18,
            sourceQuality: 0.9,
            squatDepth: 0.08,
          },
          peakRightKneeLift: {
            balancedPlantedSquatDepth: 0.05,
            frameIndex: 7,
            hipDrop: 0.02,
            leftFootContact: true,
            leftKneeLift: 0.16,
            rightFootContact: true,
            rightKneeLift: 0.68,
            sourceQuality: 0.91,
            squatDepth: 0.07,
          },
          peakSingleKneeLift: {
            balancedPlantedSquatDepth: 0.04,
            frameIndex: 8,
            hipDrop: 0.02,
            leftFootContact: true,
            leftKneeLift: 0.8,
            rightFootContact: true,
            rightKneeLift: 0.12,
            sourceQuality: 0.92,
            squatDepth: 0.09,
          },
          peakSquat: {
            balancedPlantedSquatDepth: 0.62,
            frameIndex: 5,
            hipDrop: 0.44,
            leftFootContact: true,
            leftKneeLift: 0.12,
            rightFootContact: true,
            rightKneeLift: 0.11,
            sourceQuality: 0.94,
            squatDepth: 0.66,
          },
        }}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByText("Debug Scrub")).toBeInTheDocument();
    expect(screen.getByText("QA Presets")).toBeInTheDocument();
    expect(screen.getByText("Analysis Hotspots")).toBeInTheDocument();
    expect(screen.getByText("Frame")).toBeInTheDocument();
    expect(screen.getByDisplayValue("5")).toBeInTheDocument();
    expect(screen.getByText("/ 12")).toBeInTheDocument();
    expect(screen.getByLabelText("Debug marker rail")).toBeInTheDocument();
    expect(screen.getByRole("button", {
      name: "Root Travel QA preset blocked: no passing root-travel frame",
    })).toBeDisabled();
    expect(screen.getByRole("button", {
      name: "Jump to Left Proof / Left Knee debug marker at frame 7",
    })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Next debug marker" }));

    expect(onPlayingChange).toHaveBeenCalledWith(false);
    expect(onFrameChange).toHaveBeenCalledWith(5);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(5);
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();
    expect(screen.getByText("Active Hotspot")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Previous debug marker" }));

    expect(onFrameChange).toHaveBeenCalledWith(10);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(10);
    expect(screen.getByDisplayValue("11")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Jump to Left Proof / Left Knee debug marker at frame 7",
    }));

    expect(onFrameChange).toHaveBeenCalledWith(6);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(6);
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Jump to Squat QA preset at frame 11",
    }));

    expect(onPlayingChange).toHaveBeenCalledWith(false);
    expect(onFrameChange).toHaveBeenCalledWith(10);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(10);
    expect(screen.getByDisplayValue("11")).toBeInTheDocument();
    expect(screen.getByText("Active Proof")).toBeInTheDocument();
    expect(screen.getByText("Squat")).toBeInTheDocument();
    expect(document.body).toHaveTextContent("strongest-squat");

    fireEvent.click(screen.getByRole("button", { name: "Next frame" }));

    expect(onPlayingChange).toHaveBeenCalledWith(false);
    expect(onFrameChange).toHaveBeenCalledWith(11);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(11);
    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
    expect(screen.queryByText("Active Proof")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("slider", { name: "Movement debug frame" }), {
      target: { value: "9" },
    });

    expect(onFrameChange).toHaveBeenCalledWith(9);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(9);
    expect(screen.getByDisplayValue("10")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("spinbutton", { name: "Debug frame number" }), {
      target: { value: "4" },
    });

    expect(onFrameChange).toHaveBeenCalledWith(3);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(3);
    expect(screen.getByDisplayValue("4")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Jump to Peak Squat analysis hotspot at frame 6",
    }));

    expect(onFrameChange).toHaveBeenCalledWith(5);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(5);
    expect(screen.getByDisplayValue("6")).toBeInTheDocument();
    expect(screen.getByText("Active Hotspot")).toBeInTheDocument();
    expect(screen.getAllByText("Peak Squat")).not.toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Pause debug playback" }));

    expect(onPlayingChange).toHaveBeenCalledWith(false);
  });

  it("rewinds debug playback when resumed from the final frame", () => {
    vi.useFakeTimers();

    const frameIndexRef: React.MutableRefObject<number> = { current: 11 };
    const onFrameChange = vi.fn((frameIndex: number) => {
      frameIndexRef.current = frameIndex;
    });
    const onDebugFrameRouteChange = vi.fn();
    const onPlayingChange = vi.fn();

    render(
      <MovementDebugFrameScrubber
        frameCount={12}
        frameIndexRef={frameIndexRef}
        isEnabled
        isPlaying={false}
        onDebugFrameRouteChange={onDebugFrameRouteChange}
        onFrameChange={onFrameChange}
        onPlayingChange={onPlayingChange}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(150);
    });

    expect(screen.getByDisplayValue("12")).toBeInTheDocument();
    expect(screen.queryByLabelText("Debug marker rail")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous debug marker" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next debug marker" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Resume debug playback" }));

    expect(onFrameChange).toHaveBeenCalledWith(0);
    expect(onDebugFrameRouteChange).toHaveBeenCalledWith(0);
    expect(onPlayingChange).toHaveBeenCalledWith(true);
    expect(screen.getByDisplayValue("1")).toBeInTheDocument();
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
          baseline: "manual-calibration",
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
          appliedUpperBody: 5,
          footLockCorrection: 0.02,
          footLockDrift: 0.04,
          footLockStrength: 0.85,
          hipDrop: 0.51,
          leftFootContact: true,
          leftKneeLift: 0.34,
          lowerBodySegmentMotion: 0.66,
          plantedSquatIkDepth: 0.62,
          rightFootContact: true,
          rightKneeLift: 0.33,
          solvedSegments: 11,
          sourceQuality: 0.88,
          squatDepth: 0.66,
          totalLowerBody: 6,
          totalUpperBody: 5,
          totalSegments: 11,
          visualRootDrop: 0.71,
        },
        profileName: "VIPE_Hero__1793.vrm",
        calibrationQuality: 0.92,
      },
    };
    const motionFrameRef: React.RefObject<MovementMotionFrame> = {
      current: {
        contacts: [
          { confidence: 0.9, point: "leftFoot", state: "active", surface: "floor" },
          { confidence: 0.88, point: "rightFoot", state: "active", surface: "floor" },
        ],
        display: {
          mirrorMode: "facing-player",
          sideMap: {
            sourceLeft: "avatarRight",
            sourceRight: "avatarLeft",
          },
        },
        owners: {
          feet: "player-feet",
          lowerBody: "player-lower",
          root: "root-turn",
          spine: "player-spine",
          support: "standing-support",
          torso: "player-torso",
        },
        readability: {
          confidence: 0.91,
          displayAmplification: 1,
          displayedMovementStrength: 0.66,
          holdMsRemaining: 0,
          messageEvents: [],
          rawMovementStrength: 0.63,
          readableMovementStrength: 0.66,
          reasons: ["source-readable"],
          scoreAllowed: true,
          source: "avatar-pipeline",
          state: "active",
        },
        source: {
          cameraConfidence: {
            bodyPartConfidence: {},
            frameVisibility: 1,
            isStale: false,
            messageEvents: [],
            reasons: [],
            score: 100,
            scoreAllowed: true,
            state: "ready",
          },
          capturedAt: 1000,
          landmarks: {
            pose: makeMovementAvatarProofPose("standing"),
            worldPose: makeMovementAvatarProofPose("standing"),
          },
          sourceOrigin: "live-webcam",
          sourceStatus: "raw",
          startReadiness: {
            blockedReasons: [],
            calibrationQuality: 0.92,
            canStartGame: true,
            canStartRecording: true,
            countdownMsRemaining: 0,
            promptEvents: [],
            requiredBodyParts: [],
            state: "ready",
            visibleBodyParts: [],
          },
        },
        support: {
          confidence: 0.9,
          contacts: [],
          primarySurface: "floor",
          reasons: [],
          supportLabel: "leftFoot:active floor; rightFoot:active floor",
        },
        supportConstraint: {
          missingLayers: [],
          owner: "standing-support",
          status: "active",
        },
        truthSkeleton: {
          bodyPartConfidence: {},
          bodyScale: {
            shoulderWidth: 0.24,
            torsoHeight: 0.26,
          },
          centers: {
            head: null,
            hip: null,
            shoulder: null,
          },
          floorY: 0.94,
          heldOrRejectedReasons: [],
          segmentConfidence: {
            hips: 0.92,
            leftFoot: 0.84,
            leftLowerArm: 0.89,
            leftShin: 0.88,
            leftThigh: 0.9,
            leftUpperArm: 0.9,
            rightFoot: 0.86,
            rightLowerArm: 0.88,
            rightShin: 0.87,
            rightThigh: 0.89,
            rightUpperArm: 0.9,
            shoulders: 0.93,
          },
          sourceStatus: "raw",
        },
      } as unknown as MovementMotionFrame,
    };

    render(
      <MovementTrackingDebugOverlay
        calibration={calibration}
        debugRef={debugRef}
        isEnabled
        motionFrameRef={motionFrameRef}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(1500);
    });

    expect(screen.getByText("Posture Diagnostics")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Age 1.5s")).toBeInTheDocument();
    expect(screen.getByText("Cal 0.92")).toBeInTheDocument();
    expect(screen.getByText("manual-calibration")).toBeInTheDocument();
    expect(screen.getByText("Tune: Restart camera tracking")).toBeInTheDocument();
    expect(screen.getByText("VIPE_Hero__1793.vrm")).toBeInTheDocument();
    expect(screen.getByText("Tracking data is stale")).toBeInTheDocument();
    expect(screen.getByText("head neutral; torso neutral; lower recorded-neutral; feet planted-flat")).toBeInTheDocument();
    expect(screen.getByText("pose / hand")).toBeInTheDocument();
    expect(screen.getByText("Retarget Metrics")).toBeInTheDocument();
    expect(screen.getByText("0.66 / 0.51")).toBeInTheDocument();
    expect(screen.getByText("0.34 / 0.33")).toBeInTheDocument();
    expect(screen.getByText("0.85 c0.02 d0.04")).toBeInTheDocument();
    expect(screen.getByText("Motion Frame")).toBeInTheDocument();
    expect(screen.getByText("active 91%")).toBeInTheDocument();
    expect(screen.getByText("raw 0.63 show 0.66")).toBeInTheDocument();
    expect(screen.getByText("lower player-lower; feet player-feet")).toBeInTheDocument();
    expect(screen.getByText("root-turn; player-spine")).toBeInTheDocument();
    expect(screen.getByText("facing-player L->avatarRight R->avatarLeft")).toBeInTheDocument();
    expect(screen.getByText("ready 92%")).toBeInTheDocument();
    expect(screen.getByTestId("movement-debug-start-gate")).toHaveTextContent("ready - Get ready.");
    expect(screen.getByText("Start blockers")).toBeInTheDocument();
    expect(screen.getByText("leftFoot:active floor; rightFoot:active floor / active")).toBeInTheDocument();
    expect(screen.getByText("leftFoot:floor rightFoot:floor")).toBeInTheDocument();
    expect(screen.getByText("hips 92% feet 84%")).toBeInTheDocument();
    expect(screen.getByText("ready feet 84%")).toBeInTheDocument();
    expect(screen.getAllByText("none")).not.toHaveLength(0);
    expect(screen.getByText("live-webcam / raw")).toBeInTheDocument();
  });

  it("shows start-gate blockers in tracking diagnostics", () => {
    vi.useFakeTimers();

    const debugRef: React.MutableRefObject<MovementTrackingDebugState | null> = {
      current: {
        updatedAt: 0,
        headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "pose" },
        headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "pose" },
        bodyConfidence: {
          torso: 0.9,
          leftFoot: 0.1,
          rightFoot: 0.1,
        },
        fallbacks: {
          baseline: "upper-body-auto-baseline",
          head: "pose-auto",
          leftArm: "relaxed-arm",
          rightArm: "relaxed-arm",
          leftKnee: "neutral-stance",
          rightKnee: "neutral-stance",
          leftFoot: "weak-source",
          rightFoot: "weak-source",
          floor: "fixed-floor",
          owners: "head player-calibrated; torso player-spine-neutral; lower neutral; feet weak-source",
        },
      },
    };
    const motionFrameRef: React.RefObject<MovementMotionFrame> = {
      current: {
        contacts: [],
        display: {
          mirrorMode: "facing-player",
          sideMap: {
            sourceLeft: "avatarRight",
            sourceRight: "avatarLeft",
          },
        },
        owners: {
          feet: "weak-source",
          lowerBody: "neutral",
          root: "neutral",
          spine: "player-spine",
          support: "standing-support",
          torso: "player-torso",
        },
        readability: {
          confidence: 0.2,
          displayAmplification: 1,
          displayedMovementStrength: 0,
          holdMsRemaining: 0,
          messageEvents: [],
          rawMovementStrength: 0,
          readableMovementStrength: 0,
          reasons: ["source-blocked"],
          scoreAllowed: false,
          source: "avatar-pipeline",
          state: "waiting",
        },
        source: {
          cameraConfidence: {
            bodyPartConfidence: {},
            frameVisibility: 1,
            isStale: false,
            messageEvents: [],
            reasons: [],
            score: 100,
            scoreAllowed: true,
            state: "ready",
          },
          capturedAt: 1000,
          landmarks: {
            pose: makeMovementAvatarProofPose("standing"),
            worldPose: makeMovementAvatarProofPose("standing"),
          },
          sourceOrigin: "live-webcam",
          sourceStatus: "raw",
          startReadiness: {
            blockedReasons: ["feet-not-visible"],
            calibrationQuality: 0.66,
            canStartGame: false,
            canStartRecording: false,
            countdownMsRemaining: 0,
            promptEvents: ["show-your-feet"],
            requiredBodyParts: ["feet"],
            state: "blocked",
            visibleBodyParts: ["head", "shoulders", "hips"],
          },
        },
        support: {
          confidence: 0.3,
          contacts: [],
          primarySurface: "floor",
          reasons: [],
          supportLabel: "",
        },
        supportConstraint: {
          missingLayers: ["feet"],
          owner: "standing-support",
          status: "missing",
        },
        truthSkeleton: {
          bodyPartConfidence: {},
          bodyScale: {
            shoulderWidth: 0.24,
            torsoHeight: 0.26,
          },
          centers: {
            head: null,
            hip: null,
            shoulder: null,
          },
          floorY: 0.94,
          heldOrRejectedReasons: [],
          segmentConfidence: {
            hips: 0.9,
            leftFoot: 0.12,
            leftLowerArm: 0.8,
            leftShin: 0.4,
            leftThigh: 0.84,
            leftUpperArm: 0.85,
            rightFoot: 0.1,
            rightLowerArm: 0.8,
            rightShin: 0.4,
            rightThigh: 0.82,
            rightUpperArm: 0.85,
            shoulders: 0.9,
          },
          sourceStatus: "raw",
        },
      } as unknown as MovementMotionFrame,
    };

    render(
      <MovementTrackingDebugOverlay
        calibration={null}
        debugRef={debugRef}
        isEnabled
        motionFrameRef={motionFrameRef}
      />,
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByTestId("movement-debug-start-gate")).toHaveTextContent("blocked - Show your feet.");
    expect(screen.getByText("feet-not-visible")).toBeInTheDocument();
  });

  it("shows debug calibration quality when the avatar is using an automatic baseline", () => {
    vi.useFakeTimers();

    const debugRef: React.MutableRefObject<MovementTrackingDebugState | null> = {
      current: {
        updatedAt: 0,
        headRaw: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "pose" },
        headApplied: { pitch: 0, yaw: 0, roll: 0, confidence: 0.9, source: "pose" },
        bodyConfidence: {
          torso: 0.9,
          leftWrist: 0.1,
          leftHand: 0,
          rightWrist: 0.1,
          rightHand: 0,
          leftFoot: 0.1,
          rightFoot: 0.1,
        },
        fallbacks: {
          baseline: "upper-body-auto-baseline",
          head: "pose-auto",
          leftArm: "relaxed-arm",
          rightArm: "relaxed-arm",
          leftKnee: "neutral-stance",
          rightKnee: "neutral-stance",
          leftFoot: "neutral-stance",
          rightFoot: "neutral-stance",
          floor: "fixed-floor",
          owners: "head player-calibrated; torso player-spine-neutral; lower neutral; feet neutral",
        },
        calibrationQuality: 0.57,
      },
    };

    render(
      <MovementTrackingDebugOverlay
        calibration={null}
        debugRef={debugRef}
        isEnabled
      />,
    );

    act(() => {
      vi.advanceTimersByTime(250);
    });

    expect(screen.getByText("Cal 0.57")).toBeInTheDocument();
    expect(screen.getByText("upper-body-auto-baseline")).toBeInTheDocument();
    expect(screen.queryByText("Cal none")).not.toBeInTheDocument();
  });
});
