import { act, fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import type Webcam from "react-webcam";
import { afterEach, describe, expect, it, vi } from "vitest";
import AvatarSelectorLobby from "./AvatarSelectorLobby";
import MovementCalibrationOverlay from "./MovementCalibrationOverlay";
import MovementCompletionDialog from "./MovementCompletionDialog";
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

    expect(screen.getByText("Movement Practice")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose Avatars" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Begin Session/i }));

    expect(onStart).toHaveBeenCalledTimes(1);

    const playerSection = screen.getByRole("heading", { name: "Player" }).closest("section");
    const instructorSection = screen.getByRole("heading", { name: "Instructor" }).closest("section");

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

    expect(screen.queryByText("SESSION COMPLETE")).not.toBeInTheDocument();

    rerender(
      <MovementCompletionDialog
        isOpen
        finalScore={420}
        onExitMatch={onExitMatch}
        onRematch={onRematch}
      />,
    );

    expect(screen.getByText("SESSION COMPLETE")).toBeInTheDocument();
    expect(screen.getByText("420")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "EXIT MATCH" }));
    fireEvent.click(screen.getByRole("button", { name: "REMATCH" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Calibrate" }));
    fireEvent.click(screen.getByRole("button", { name: "Continue without calibration" }));

    expect(screen.getByText("Body Calibration")).toBeInTheDocument();
    expect(screen.getByText("0 tracking samples")).toBeInTheDocument();
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

    expect(screen.queryByText("Body Calibration")).not.toBeInTheDocument();
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
    expect(screen.getByText(/continue for tuning/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue without calibration" }));

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

    expect(screen.getByText("MOVE INTO POSITION: 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Calibrating" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Continue without calibration" })).toBeDisabled();
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
    expect(screen.getByRole("button", { name: "Start match" })).toBeDisabled();

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

    fireEvent.click(screen.getByRole("button", { name: "Start match" }));

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

    expect(screen.getByRole("button", { name: "Start match" })).toBeDisabled();

    fireEvent.click(screen.getByText("Recalibrate"));

    expect(onCalibrate).toHaveBeenCalledTimes(1);
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

    expect(screen.getByText("Tracking Debug")).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("Age 1.5s")).toBeInTheDocument();
    expect(screen.getByText("Tune: Restart camera tracking")).toBeInTheDocument();
    expect(screen.getByText("VIPE_Hero__1793.vrm")).toBeInTheDocument();
    expect(screen.getByText("Tracking data is stale")).toBeInTheDocument();
    expect(screen.getByText("pose / hand")).toBeInTheDocument();
  });
});
