"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  Classifications,
  FaceLandmarker,
  HandLandmarker,
  Landmark,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type Webcam from "react-webcam";
import { PoseFilterWrapper } from "@/src/lib/math/OneEuroFilter";
import { resolveHandSideByWrist } from "../_lib/handMatching";
import { drawMovementSkeleton } from "../_lib/movementSkeleton";
import type { MovementHandSide } from "../_lib/movementTypes";

type HandCapture = {
  landmarks: NormalizedLandmark[];
  worldLandmarks: Landmark[] | null;
};

export type MovementCaptureFrame = {
  timestamp: number;
  landmarks: NormalizedLandmark[];
  worldLandmarks: Landmark[] | null;
  faceLandmarks?: NormalizedLandmark[] | null;
  blendshapes?: Classifications["categories"];
  hands?: Record<MovementHandSide, HandCapture | null>;
};

type UseMovementCaptureInput = {
  webcamRef: RefObject<Webcam | null>;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  poseLandmarker: PoseLandmarker | null;
  faceLandmarker: FaceLandmarker | null;
  handLandmarker: HandLandmarker | null;
  isVisionReady: boolean;
};

const CORE_VISIBILITY_THRESHOLD = 0.6;

function getCoreVisibility(landmarks: NormalizedLandmark[]) {
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  const leftHip = landmarks[23];
  const rightHip = landmarks[24];

  return (
    ((leftShoulder?.visibility ?? 0) +
      (rightShoulder?.visibility ?? 0) +
      (leftHip?.visibility ?? 0) +
      (rightHip?.visibility ?? 0)) /
    4
  );
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
  const isRecordingRef = useRef(false);
  const recordedFramesRef = useRef<MovementCaptureFrame[]>([]);
  const poseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  const worldPoseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  const leftHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.6, 0.08));
  const rightHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.6, 0.08));
  const leftHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.6, 0.08));
  const rightHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 1.6, 0.08));

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
            const smoothedLandmarks = poseFilterRef.current.filter(poseResults.landmarks[0], startTimeMs);
            const rawWorld = poseResults.worldLandmarks ? poseResults.worldLandmarks[0] : null;
            const smoothedWorld = rawWorld ? worldPoseFilterRef.current.filter(rawWorld, startTimeMs) : null;
            const coreVisibility = getCoreVisibility(smoothedLandmarks);
            setTrackingQuality(Math.round(coreVisibility * 100));

            if (coreVisibility >= CORE_VISIBILITY_THRESHOLD) {
              const currentData: MovementCaptureFrame = {
                timestamp: startTimeMs,
                landmarks: smoothedLandmarks,
                worldLandmarks: smoothedWorld,
              };

              if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
                currentData.faceLandmarks = faceResults.faceLandmarks[0];
              }

              if (faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0) {
                currentData.blendshapes = faceResults.faceBlendshapes[0].categories;
              }

              if (handResults.landmarks && handResults.landmarks.length > 0) {
                const handsPayload: Record<MovementHandSide, HandCapture | null> = { left: null, right: null };
                currentData.hands = handsPayload;

                const leftWristPose = smoothedLandmarks[15];
                const rightWristPose = smoothedLandmarks[16];

                handResults.landmarks.forEach((handLms, index) => {
                  const side = resolveHandSideByWrist({
                    handWrist: handLms[0],
                    leftWrist: leftWristPose,
                    rightWrist: rightWristPose,
                  });

                  const filterRef = side === "left" ? leftHandFilterRef.current : rightHandFilterRef.current;
                  const worldFilterRef = side === "left" ? leftHandWorldFilterRef.current : rightHandWorldFilterRef.current;
                  const smoothedHandLms = filterRef.filter(handLms, startTimeMs);
                  const smoothedHandWorld = handResults.worldLandmarks?.[index]
                    ? worldFilterRef.filter(handResults.worldLandmarks[index], startTimeMs)
                    : null;

                  handsPayload[side] = {
                    landmarks: smoothedHandLms,
                    worldLandmarks: smoothedHandWorld,
                  };
                });
              }

              if (isRecordingRef.current) {
                recordedFramesRef.current.push(currentData);
                setFrameCount(recordedFramesRef.current.length);
              }

              drawMovementSkeleton(ctx, smoothedLandmarks, canvas.width, canvas.height);
            }
          } else {
            setTrackingQuality(0);
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
    isRecording,
    frameCount,
    trackingQuality,
    startRecording,
    stopRecording,
    getRecordedFrames,
  };
}
