"use client";

import { useCallback, useEffect, useState } from "react";
import { FilesetResolver, FaceLandmarker, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { MOVEMENT_PLAYER_INPUT_CONTRACT } from "../_lib/movementPlayerInputContract";

export type MediaPipeVisionStatus = "idle" | "loading" | "ready" | "failed";

type MediaPipeVisionModels = {
  poseLandmarker: PoseLandmarker | null;
  faceLandmarker: FaceLandmarker | null;
  faceRefiner: FaceLandmarker | null;
  handLandmarker: HandLandmarker | null;
  handRefiner: HandLandmarker | null;
};

const EMPTY_VISION_MODELS: MediaPipeVisionModels = {
  poseLandmarker: null,
  faceLandmarker: null,
  faceRefiner: null,
  handLandmarker: null,
  handRefiner: null,
};

function getVisionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("ModuleFactory not set")) {
    return "The browser tracking engine did not finish starting. Press Retry Tracking; if it repeats, refresh this page.";
  }
  return error instanceof Error ? error.message : "Failed to load MediaPipe Vision models.";
}

export function useMediaPipeVision({
  enabled = true,
  enableDeepRefinement = false,
  enableSegmentation = false,
}: {
  enabled?: boolean;
  enableDeepRefinement?: boolean;
  enableSegmentation?: boolean;
} = {}) {
  const [models, setModels] = useState<MediaPipeVisionModels>(EMPTY_VISION_MODELS);
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
    if (!enabled) return undefined;

    let active = true;
    let createdPose: PoseLandmarker | null = null;
    let createdFace: FaceLandmarker | null = null;
    let createdFaceRefiner: FaceLandmarker | null = null;
    let createdHands: HandLandmarker | null = null;
    let createdHandRefiner: HandLandmarker | null = null;

    async function initializeModels() {
      setStatus("loading");
      setError(null);
      setModels({
        poseLandmarker: null,
        faceLandmarker: null,
        faceRefiner: null,
        handLandmarker: null,
        handRefiner: null,
      });

      try {
        const { detector } = MOVEMENT_PLAYER_INPUT_CONTRACT;
        const vision = await FilesetResolver.forVisionTasks(detector.wasmUrl);
        // MediaPipe's browser tasks share WASM module startup state. Initialise each
        // task in order so concurrent createFromOptions calls cannot overwrite the
        // shared ModuleFactory while it is still loading.
        const pose = await PoseLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: detector.poseModelUrl, delegate: "GPU" },
            runningMode: "VIDEO",
            numPoses: 1,
            minPoseDetectionConfidence: detector.poseConfidence,
            minPosePresenceConfidence: detector.poseConfidence,
            minTrackingConfidence: detector.poseConfidence,
            outputSegmentationMasks: enableSegmentation,
          });
        createdPose = pose;
        const face = await FaceLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: detector.faceModelUrl, delegate: "GPU" },
            runningMode: "VIDEO",
            numFaces: 1,
            outputFaceBlendshapes: true,
            outputFacialTransformationMatrixes: true,
          });
        createdFace = face;
        const hands = await HandLandmarker.createFromOptions(vision, {
            baseOptions: { modelAssetPath: detector.handModelUrl, delegate: "GPU" },
            runningMode: "VIDEO",
            numHands: 2,
            minHandDetectionConfidence: detector.handConfidence,
            minHandPresenceConfidence: detector.handConfidence,
            minTrackingConfidence: detector.handConfidence,
          });
        createdHands = hands;
        const faceCropRefiner = enableDeepRefinement
          ? await FaceLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: detector.faceModelUrl, delegate: "GPU" },
                runningMode: "IMAGE",
                numFaces: 1,
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
              })
          : null;
        createdFaceRefiner = faceCropRefiner;
        const handCropRefiner = enableDeepRefinement
          ? await HandLandmarker.createFromOptions(vision, {
                baseOptions: { modelAssetPath: detector.handModelUrl, delegate: "GPU" },
                runningMode: "IMAGE",
                // A pose-derived fallback crop can contain both hands while
                // they cross. Return both genuine candidates so anatomical
                // wrist reconciliation can select the correct side.
                numHands: 2,
                minHandDetectionConfidence: detector.handConfidence,
                minHandPresenceConfidence: detector.handConfidence,
              })
          : null;

        createdHandRefiner = handCropRefiner;

        if (active) {
          setModels({
            poseLandmarker: pose,
            faceLandmarker: face,
            faceRefiner: faceCropRefiner,
            handLandmarker: hands,
            handRefiner: handCropRefiner,
          });
          setStatus("ready");
        }
      } catch (loadError) {
        createdPose?.close();
        createdFace?.close();
        createdFaceRefiner?.close();
        createdHands?.close();
        createdHandRefiner?.close();

        if (active) {
          setModels({
            poseLandmarker: null,
            faceLandmarker: null,
            faceRefiner: null,
            handLandmarker: null,
            handRefiner: null,
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
      createdFaceRefiner?.close();
      createdHands?.close();
      createdHandRefiner?.close();
    };
  }, [enabled, enableDeepRefinement, enableSegmentation, reloadToken]);

  return {
    ...(enabled ? models : EMPTY_VISION_MODELS),
    status: enabled ? status : "idle",
    error: enabled ? error : null,
    retry,
    isReady: enabled && status === "ready" && Boolean(
      models.poseLandmarker &&
      models.faceLandmarker &&
      models.handLandmarker &&
      (!enableDeepRefinement || (models.faceRefiner && models.handRefiner)),
    ),
  };
}
