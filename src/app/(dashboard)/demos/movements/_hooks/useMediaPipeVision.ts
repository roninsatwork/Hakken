"use client";

import { useCallback, useEffect, useState } from "react";
import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "../_lib/movementPlayerInputContract";

export type MediaPipeVisionStatus = "idle" | "loading" | "ready" | "failed";

type MediaPipeVisionModels = {
  poseLandmarker: PoseLandmarker | null;
  faceLandmarker: FaceLandmarker | null;
  handLandmarker: HandLandmarker | null;
};

function getVisionErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Failed to load MediaPipe Vision models.";
}

export function useMediaPipeVision() {
  const [models, setModels] = useState<MediaPipeVisionModels>({
    poseLandmarker: null,
    faceLandmarker: null,
    handLandmarker: null,
  });
  const [status, setStatus] = useState<MediaPipeVisionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (typeof args[0] === "string" && args[0].includes("XNNPACK delegate")) return;
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let createdPose: PoseLandmarker | null = null;
    let createdFace: FaceLandmarker | null = null;
    let createdHands: HandLandmarker | null = null;

    async function initializeModels() {
      setStatus("loading");
      setError(null);
      setModels({
        poseLandmarker: null,
        faceLandmarker: null,
        handLandmarker: null,
      });

      try {
        const { detector } = MOVEMENT_PLAYER_INPUT_CONTRACT;
        const vision = await FilesetResolver.forVisionTasks(detector.wasmUrl);
        const [pose, face, hands] = await Promise.all([
          PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: detector.poseModelUrl, delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: detector.poseConfidence,
            minPosePresenceConfidence: detector.poseConfidence,
            minTrackingConfidence: detector.poseConfidence,
          }),
          FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: detector.faceModelUrl, delegate: "GPU" },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: false,
          }),
          HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: detector.handModelUrl, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: detector.handConfidence,
            minHandPresenceConfidence: detector.handConfidence,
            minTrackingConfidence: detector.handConfidence,
          }),
        ]);

        createdPose = pose;
        createdFace = face;
        createdHands = hands;

        if (active) {
          setModels({
            poseLandmarker: pose,
            faceLandmarker: face,
            handLandmarker: hands,
          });
          setStatus("ready");
        }
      } catch (loadError) {
        createdPose?.close();
        createdFace?.close();
        createdHands?.close();

        if (active) {
          setModels({
            poseLandmarker: null,
            faceLandmarker: null,
            handLandmarker: null,
          });
          setError(getVisionErrorMessage(loadError));
          setStatus("failed");
        }
      }
    }

    void initializeModels();

    return () => {
      active = false;
      createdPose?.close();
      createdFace?.close();
      createdHands?.close();
    };
  }, [reloadToken]);

  return {
    ...models,
    status,
    error,
    retry,
    isReady: status === "ready" && Boolean(models.poseLandmarker && models.faceLandmarker && models.handLandmarker),
  };
}
