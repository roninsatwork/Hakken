"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { FaceLandmarker, HandLandmarker, NormalizedLandmark, PoseLandmarker } from "@mediapipe/tasks-vision";
import type Webcam from "react-webcam";
import { drawMovementSkeleton } from "../_lib/movementSkeleton";
import {
  createMovementAcquisitionFilters,
  prepareMovementAcquisitionFrame,
  type MovementAcquisitionFrame,
} from "../_lib/movementPlayerInputContract";
import { buildMovementSpineModel } from "../_lib/movementSpineMetrics";
import {
  buildLiveMovementSourceFrame,
  type MovementStartReadiness,
} from "../_lib/movementSourceFrame";
export type MovementCaptureFrame = MovementAcquisitionFrame & {
  timestamp: number;
  landmarks: NormalizedLandmark[];
  startReadiness: MovementStartReadiness;
};

type UseMovementCaptureInput = {
  webcamRef: RefObject<Webcam | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  poseLandmarker: PoseLandmarker | null;
  faceLandmarker: FaceLandmarker | null;
  handLandmarker: HandLandmarker | null;
  isVisionReady: boolean;
};

export const MOVEMENT_CAPTURE_RECORDING_VISIBILITY_THRESHOLD = 0.4;
const MOVEMENT_CAPTURE_HIP_VISIBILITY_THRESHOLD = 0.35;
const MOVEMENT_CAPTURE_KNEE_VISIBILITY_THRESHOLD = 0.25;

export function getMovementCaptureFullBodyVisibility(landmarks: NormalizedLandmark[]) {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const leftFoot = landmarks[31] ?? landmarks[27];
  const rightFoot = landmarks[32] ?? landmarks[28];

  return (
    ((leftShoulder?.visibility ?? 0) +
      (rightShoulder?.visibility ?? 0) +
      (leftHip?.visibility ?? 0) +
      (rightHip?.visibility ?? 0) +
      (leftKnee?.visibility ?? 0) +
      (rightKnee?.visibility ?? 0) +
      (leftFoot?.visibility ?? 0) +
      (rightFoot?.visibility ?? 0)) /
    8
  );
}

export function shouldRecordMovementCaptureFrame(landmarks: NormalizedLandmark[]) {
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];
  const leftKnee = landmarks[25];
  const rightKnee = landmarks[26];
  const hipVisibility = ((leftHip?.visibility ?? 0) + (rightHip?.visibility ?? 0)) / 2;
  const kneeVisibility = ((leftKnee?.visibility ?? 0) + (rightKnee?.visibility ?? 0)) / 2;

  return (
    getMovementCaptureFullBodyVisibility(landmarks) >= MOVEMENT_CAPTURE_RECORDING_VISIBILITY_THRESHOLD &&
    hipVisibility >= MOVEMENT_CAPTURE_HIP_VISIBILITY_THRESHOLD &&
    kneeVisibility >= MOVEMENT_CAPTURE_KNEE_VISIBILITY_THRESHOLD
  );
}

export function resolveMovementCaptureStartReadiness(
  landmarks: NormalizedLandmark[],
): MovementStartReadiness {
  return buildLiveMovementSourceFrame({
    poseLandmarks: landmarks,
    requirements: {
      mode: "full-body",
    },
    sourceStatus: "smoothed",
  }).startReadiness;
}

export function useMovementCapture({
  webcamRef,
  canvasRef,
  poseLandmarker,
  faceLandmarker,
  handLandmarker,
  isVisionReady,
}: UseMovementCaptureInput) {
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [trackingQuality, setTrackingQuality] = useState(0);
  const [spineQuality, setSpineQuality] = useState(0);
  const [captureStartReadiness, setCaptureStartReadiness] =
    useState<MovementStartReadiness | null>(null);
  const isRecordingRef = useRef(false);
  const recordedFramesRef = useRef<MovementCaptureFrame[]>([]);
  const acquisitionFiltersRef = useRef(createMovementAcquisitionFilters());

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    let animationFrameId: number | null = null;

    const processVideo = () => {
      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;

      if (
        poseLandmarker &&
        faceLandmarker &&
        handLandmarker &&
        video &&
        video.readyState === 4 &&
        canvas
      ) {
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const startTimeMs = performance.now();
        const poseResults = poseLandmarker.detectForVideo(video, startTimeMs);
        const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
        const handResults = handLandmarker.detectForVideo(video, startTimeMs);

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (poseResults.landmarks && poseResults.landmarks.length > 0) {
            const acquisitionFrame = prepareMovementAcquisitionFrame({
              camera: {
                facingMode: "user",
                frameHeight: video.videoHeight,
                frameWidth: video.videoWidth,
              },
              capturedAt: Date.now(),
              faceResults,
              filters: acquisitionFiltersRef.current,
              handResults,
              poseResults,
              sourceTimestampMs: startTimeMs,
            });
            const smoothedLandmarks = acquisitionFrame.landmarks;
            if (!smoothedLandmarks) {
              animationFrameId = requestAnimationFrame(processVideo);
              return;
            }
            const fullBodyVisibility = getMovementCaptureFullBodyVisibility(smoothedLandmarks);
            const startReadiness = resolveMovementCaptureStartReadiness(smoothedLandmarks);
            const spineModel = buildMovementSpineModel(smoothedLandmarks);
            setTrackingQuality(Math.round(fullBodyVisibility * 100));
            setSpineQuality(spineModel?.neutralStackScore ?? 0);
            setCaptureStartReadiness(startReadiness);
            drawMovementSkeleton(ctx, smoothedLandmarks, canvas.width, canvas.height);

            if (shouldRecordMovementCaptureFrame(smoothedLandmarks)) {
              const currentData: MovementCaptureFrame = {
                ...acquisitionFrame,
                timestamp: startTimeMs,
                landmarks: smoothedLandmarks,
                startReadiness,
              };

              if (isRecordingRef.current) {
                recordedFramesRef.current.push(currentData);
                setFrameCount(recordedFramesRef.current.length);
              }
            }
          } else {
            setTrackingQuality(0);
            setSpineQuality(0);
            setCaptureStartReadiness(null);
          }
        }
      }

      animationFrameId = requestAnimationFrame(processVideo);
    };

    if (isVisionReady) {
      processVideo();
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [canvasRef, faceLandmarker, handLandmarker, isVisionReady, poseLandmarker, webcamRef]);

  const startRecording = useCallback(() => {
    if (!isVisionReady) return;

    recordedFramesRef.current = [];
    setFrameCount(0);
    setIsRecording(true);
  }, [isVisionReady]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    return recordedFramesRef.current;
  }, []);

  const getRecordedFrames = useCallback(() => recordedFramesRef.current, []);

  return {
    captureStartReadiness,
    isRecording,
    frameCount,
    trackingQuality,
    spineQuality,
    startRecording,
    stopRecording,
    getRecordedFrames,
  };
}
