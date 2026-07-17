"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  buildMovementCalibration,
  type MovementCalibration,
} from "../_lib/movementTrackingCalibration";
import type { MovementRetargetSourceModel } from "../_lib/movementRetargeting";
import {
  MOVEMENT_PLAYER_INPUT_CONTRACT,
  buildMovementPlayerSetupFromPrefix,
} from "../_lib/movementPlayerInputContract";
import type { VrmMotionPayload, VrmMotionRef } from "../_lib/vrmRigging";

type UseMovementTrackingCalibrationInput = {
  isVisionReady: boolean;
  playerLiveLmRef: RefObject<VrmMotionRef>;
};

const CALIBRATION_DURATION_MS = 1600;
const CALIBRATION_COUNTDOWN_MS = 3000;

export function useMovementTrackingCalibration({
  isVisionReady,
  playerLiveLmRef,
}: UseMovementTrackingCalibrationInput) {
  const [calibration, setCalibration] = useState<MovementCalibration | null>(null);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStatus, setCalibrationStatus] = useState("Calibration needed");
  const [calibrationProgress, setCalibrationProgress] = useState(0);
  const [calibrationSampleCount, setCalibrationSampleCount] = useState(0);
  const [calibrationCountdownSeconds, setCalibrationCountdownSeconds] = useState(0);
  const [isCalibrationSkipped, setIsCalibrationSkipped] = useState(false);
  const [retargetSourceModel, setRetargetSourceModel] =
    useState<MovementRetargetSourceModel | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const cancelCalibration = useCallback(() => {
    if (animationFrameRef.current !== null) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    setIsCalibrating(false);
  }, []);

  const startCalibration = useCallback(() => {
    if (!isVisionReady) {
      setCalibrationStatus("Waiting for vision");
      return;
    }

    cancelCalibration();
    setIsCalibrating(true);
    setIsCalibrationSkipped(false);
    setCalibrationStatus("Get ready");
    setCalibrationProgress(0);
    setCalibrationSampleCount(0);
    setCalibrationCountdownSeconds(Math.ceil(CALIBRATION_COUNTDOWN_MS / 1000));
    setRetargetSourceModel(null);

    const startedAt = performance.now();
    const samples: VrmMotionPayload[] = [];

    const sample = () => {
      const elapsedFromStartMs = performance.now() - startedAt;

      if (elapsedFromStartMs < CALIBRATION_COUNTDOWN_MS) {
        const remainingMs = CALIBRATION_COUNTDOWN_MS - elapsedFromStartMs;
        setCalibrationCountdownSeconds(Math.ceil(remainingMs / 1000));
        setCalibrationStatus("Get ready");
        setCalibrationProgress(0);
        animationFrameRef.current = requestAnimationFrame(sample);
        return;
      }

      setCalibrationCountdownSeconds(0);
      setCalibrationStatus("Stand neutral");

      const motionRef = playerLiveLmRef.current;
      const payload: VrmMotionPayload | null = motionRef
        ? Array.isArray(motionRef)
          ? { landmarks: motionRef }
          : motionRef
        : null;
      const poseLandmarks = payload?.landmarks ?? payload?.pose ?? [];
      if (buildMovementCalibration({ poseLandmarks })) {
        samples.push(payload!);
        setCalibrationSampleCount(samples.length);
      }

      const elapsedMs = elapsedFromStartMs - CALIBRATION_COUNTDOWN_MS;
      setCalibrationProgress(Math.min(100, Math.round((elapsedMs / CALIBRATION_DURATION_MS) * 100)));

      if (elapsedMs < CALIBRATION_DURATION_MS) {
        animationFrameRef.current = requestAnimationFrame(sample);
        return;
      }

      animationFrameRef.current = null;
      setIsCalibrating(false);
      setCalibrationCountdownSeconds(0);
      setCalibrationProgress(100);

      if (
        samples.length < MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount
      ) {
        setCalibration(null);
        setRetargetSourceModel(null);
        setCalibrationStatus("Needs stronger tracking");
        return;
      }

      const setup = buildMovementPlayerSetupFromPrefix(samples);
      if (!setup?.calibration || !setup.retargetSourceModel) {
        setCalibration(null);
        setRetargetSourceModel(null);
        setCalibrationStatus("Needs stronger tracking");
        return;
      }

      setCalibration(setup.calibration);
      setRetargetSourceModel(setup.retargetSourceModel);
      setIsCalibrationSkipped(false);
      setCalibrationStatus("Calibrated");
    };

    animationFrameRef.current = requestAnimationFrame(sample);
  }, [cancelCalibration, isVisionReady, playerLiveLmRef]);

  const resetCalibration = useCallback(() => {
    cancelCalibration();
    setCalibration(null);
    setRetargetSourceModel(null);
    setIsCalibrationSkipped(false);
    setCalibrationStatus("Calibration needed");
    setCalibrationProgress(0);
    setCalibrationSampleCount(0);
    setCalibrationCountdownSeconds(0);
  }, [cancelCalibration]);

  const skipCalibration = useCallback(() => {
    cancelCalibration();
    setCalibration(null);
    setRetargetSourceModel(null);
    setIsCalibrationSkipped(true);
    setCalibrationStatus("Skipped calibration");
    setCalibrationProgress(0);
    setCalibrationSampleCount(0);
    setCalibrationCountdownSeconds(0);
  }, [cancelCalibration]);

  useEffect(() => cancelCalibration, [cancelCalibration]);

  return {
    calibration,
    retargetSourceModel,
    isCalibrated: Boolean(calibration),
    isCalibrationSkipped,
    isCalibrating,
    calibrationStatus,
    calibrationProgress,
    calibrationSampleCount,
    calibrationCountdownSeconds,
    startCalibration,
    resetCalibration,
    skipCalibration,
  };
}
