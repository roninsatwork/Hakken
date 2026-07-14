"use client";

import { useEffect, useRef, type RefObject } from "react";
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
import type { MovementHandSide } from "../_lib/movementTypes";

type PlayerPoseLandmark = (NormalizedLandmark | Landmark) & {
  visibility?: number;
  isSnapped?: boolean;
};

type PlayerHandCapture = {
  landmarks: PlayerPoseLandmark[];
  worldLandmarks?: PlayerPoseLandmark[] | null;
};

type PlayerHandsPayload = Partial<Record<MovementHandSide, PlayerHandCapture | null>>;

export type MovementPlayerMotionPayload = {
  capturedAt?: number;
  landmarks?: PlayerPoseLandmark[];
  worldLandmarks?: PlayerPoseLandmark[] | null;
  faceLandmarks?: PlayerPoseLandmark[] | null;
  blendshapes?: Classifications["categories"];
  hands?: PlayerHandsPayload;
};

type UseMovementPlayerTrackingInput = {
  webcamRef: RefObject<Webcam | null>;
  poseLandmarker: PoseLandmarker | null;
  faceLandmarker: FaceLandmarker | null;
  handLandmarker: HandLandmarker | null;
  onBodyTracked?: () => void;
};

export function useMovementPlayerTracking({
  webcamRef,
  poseLandmarker,
  faceLandmarker,
  handLandmarker,
  onBodyTracked,
}: UseMovementPlayerTrackingInput) {
  const playerLiveLmRef = useRef<MovementPlayerMotionPayload | null>(null);
  const poseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  const worldPoseFilterRef = useRef(new PoseFilterWrapper(33, 60, 0.05, 0.1));
  const leftHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 2.2, 0.08));
  const rightHandFilterRef = useRef(new PoseFilterWrapper(21, 60, 2.2, 0.08));
  const leftHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 2.2, 0.08));
  const rightHandWorldFilterRef = useRef(new PoseFilterWrapper(21, 60, 2.2, 0.08));

  useEffect(() => {
    let animationFrameId: number | null = null;

    const processVideo = () => {
      const video = webcamRef.current?.video;

      if (
        poseLandmarker &&
        faceLandmarker &&
        handLandmarker &&
        video &&
        video.readyState === 4
      ) {
        const startTimeMs = performance.now();
        const poseResults = poseLandmarker.detectForVideo(video, startTimeMs);
        const faceResults = faceLandmarker.detectForVideo(video, startTimeMs);
        const handResults = handLandmarker.detectForVideo(video, startTimeMs);
        const currentData: MovementPlayerMotionPayload = {
          capturedAt: Date.now(),
        };

        if (poseResults.landmarks && poseResults.landmarks.length > 0) {
          const raw = poseResults.landmarks[0];
          const worldRaw = poseResults.worldLandmarks ? poseResults.worldLandmarks[0] : null;

          currentData.landmarks = poseFilterRef.current.filter(raw, startTimeMs);
          currentData.worldLandmarks = worldRaw ? worldPoseFilterRef.current.filter(worldRaw, startTimeMs) : null;
          onBodyTracked?.();
        }

        if (faceResults.faceLandmarks && faceResults.faceLandmarks.length > 0) {
          currentData.faceLandmarks = faceResults.faceLandmarks[0];
        }

        if (faceResults.faceBlendshapes && faceResults.faceBlendshapes.length > 0) {
          currentData.blendshapes = faceResults.faceBlendshapes[0].categories;
        }

        if (handResults.landmarks && handResults.landmarks.length > 0) {
          const handsPayload: PlayerHandsPayload = { left: null, right: null };
          const leftWristPose = currentData.landmarks ? currentData.landmarks[15] : null;
          const rightWristPose = currentData.landmarks ? currentData.landmarks[16] : null;

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

          currentData.hands = handsPayload;
        }

        playerLiveLmRef.current = currentData;
      }

      animationFrameId = requestAnimationFrame(processVideo);
    };

    if (poseLandmarker && faceLandmarker && handLandmarker) {
      processVideo();
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [faceLandmarker, handLandmarker, onBodyTracked, poseLandmarker, webcamRef]);

  return playerLiveLmRef;
}
