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

type MovementMediaPipeDelegate = "GPU" | "CPU";
type MovementMediaPipeVisionFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

function mediaPipeErrorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export function isMovementMediaPipeGpuStartupError(error: unknown) {
  const message = mediaPipeErrorText(error);
  return [
    "Error querying for GL extensions",
    "kGpuService",
    "StartGraph failed",
    "StartRun failed",
  ].some((pattern) => message.includes(pattern));
}

export function isMovementMediaPipeRuntimeAbortError(error: unknown) {
  const message = mediaPipeErrorText(error);
  return message.includes("Aborted()") || message.includes("RuntimeError: Aborted");
}

function shouldSuppressMediaPipeConsoleError(args: unknown[]) {
  const message = args.map((arg) => mediaPipeErrorText(arg)).join(" ");
  return [
    "Aborted()",
    "XNNPACK delegate",
    "Error querying for GL extensions",
    "kGpuService",
    "CalculatorGraph::Run() failed",
    "StartGraph failed",
  ].some((pattern) => message.includes(pattern));
}

function getVisionErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.includes("ModuleFactory not set")) {
    return "The browser tracking engine did not finish starting. Press Retry Tracking; if it repeats, refresh this page.";
  }
  if (isMovementMediaPipeGpuStartupError(error)) {
    return "Tracking had trouble starting. Press Retry Tracking; if it repeats, refresh this page.";
  }
  return "Tracking had trouble starting. Press Retry Tracking; if it repeats, refresh this page.";
}

function closeMediaPipeVisionModels(models: MediaPipeVisionModels) {
  models.poseLandmarker?.close();
  models.faceLandmarker?.close();
  models.faceRefiner?.close();
  models.handLandmarker?.close();
  models.handRefiner?.close();
}

async function createMediaPipeVisionModels({
  delegate,
  enableDeepRefinement,
  enableSegmentation,
  vision,
}: {
  delegate: MovementMediaPipeDelegate;
  enableDeepRefinement: boolean;
  enableSegmentation: boolean;
  vision: MovementMediaPipeVisionFileset;
}): Promise<MediaPipeVisionModels> {
  const { detector } = MOVEMENT_PLAYER_INPUT_CONTRACT;
  const createdModels: MediaPipeVisionModels = { ...EMPTY_VISION_MODELS };
  try {
    // MediaPipe's browser tasks share WASM module startup state. Initialise each
    // task in order so concurrent createFromOptions calls cannot overwrite the
    // shared ModuleFactory while it is still loading.
    createdModels.poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: detector.poseModelUrl, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: detector.poseConfidence,
      minPosePresenceConfidence: detector.poseConfidence,
      minTrackingConfidence: detector.poseConfidence,
      outputSegmentationMasks: enableSegmentation,
    });
    createdModels.faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: detector.faceModelUrl, delegate },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
    });
    createdModels.handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: { modelAssetPath: detector.handModelUrl, delegate },
      runningMode: "VIDEO",
      numHands: 2,
      minHandDetectionConfidence: detector.handConfidence,
      minHandPresenceConfidence: detector.handConfidence,
      minTrackingConfidence: detector.handConfidence,
    });
    createdModels.faceRefiner = enableDeepRefinement
      ? await FaceLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: detector.faceModelUrl, delegate },
          runningMode: "IMAGE",
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        })
      : null;
    createdModels.handRefiner = enableDeepRefinement
      ? await HandLandmarker.createFromOptions(vision, {
          baseOptions: { modelAssetPath: detector.handModelUrl, delegate },
          runningMode: "IMAGE",
          // A pose-derived fallback crop can contain both hands while
          // they cross. Return both genuine candidates so anatomical
          // wrist reconciliation can select the correct side.
          numHands: 2,
          minHandDetectionConfidence: detector.handConfidence,
          minHandPresenceConfidence: detector.handConfidence,
        })
      : null;
    return createdModels;
  } catch (error) {
    closeMediaPipeVisionModels(createdModels);
    throw error;
  }
}

export function useMediaPipeVision({
  enabled = true,
  enableDeepRefinement = false,
  enableSegmentation = false,
  forceCpu = false,
}: {
  enabled?: boolean;
  enableDeepRefinement?: boolean;
  enableSegmentation?: boolean;
  forceCpu?: boolean;
} = {}) {
  const [models, setModels] = useState<MediaPipeVisionModels>(EMPTY_VISION_MODELS);
  const [status, setStatus] = useState<MediaPipeVisionStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [loadedDelegate, setLoadedDelegate] = useState<MovementMediaPipeDelegate | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const retry = useCallback(() => {
    setReloadToken((current) => current + 1);
  }, []);

  useEffect(() => {
    const originalError = console.error;
    console.error = (...args) => {
      if (shouldSuppressMediaPipeConsoleError(args)) {
        // Keep the raw MediaPipe text out of the dev error overlay, but never
        // hide it from devtools — it is the only trail for engine failures.
        console.warn("[movement-tracking]", ...args);
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;

    let active = true;
    let createdModels: MediaPipeVisionModels = { ...EMPTY_VISION_MODELS };

    async function initializeModels() {
      setStatus("loading");
      setError(null);
      setErrorDetail(null);
      setLoadedDelegate(null);
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
        let selectedDelegate: MovementMediaPipeDelegate = "GPU";
        if (forceCpu) {
          selectedDelegate = "CPU";
          createdModels = await createMediaPipeVisionModels({
            delegate: "CPU",
            enableDeepRefinement,
            enableSegmentation,
            vision,
          });
        } else {
          try {
            createdModels = await createMediaPipeVisionModels({
              delegate: "GPU",
              enableDeepRefinement,
              enableSegmentation,
              vision,
            });
          } catch (gpuError) {
            if (!isMovementMediaPipeGpuStartupError(gpuError)) throw gpuError;
            selectedDelegate = "CPU";
            createdModels = await createMediaPipeVisionModels({
              delegate: "CPU",
              enableDeepRefinement,
              enableSegmentation,
              vision,
            });
          }
        }

        if (active) {
          setModels(createdModels);
          setLoadedDelegate(selectedDelegate);
          setStatus("ready");
        }
      } catch (loadError) {
        closeMediaPipeVisionModels(createdModels);

        if (active) {
          setModels({
            poseLandmarker: null,
            faceLandmarker: null,
            faceRefiner: null,
            handLandmarker: null,
            handRefiner: null,
          });
          setLoadedDelegate(null);
          setError(getVisionErrorMessage(loadError));
          setErrorDetail(mediaPipeErrorText(loadError));
          setStatus("failed");
        }
      }
    }

    void initializeModels();

    return () => {
      active = false;
      closeMediaPipeVisionModels(createdModels);
    };
  }, [enabled, enableDeepRefinement, enableSegmentation, forceCpu, reloadToken]);

  return {
    ...(enabled ? models : EMPTY_VISION_MODELS),
    status: enabled ? status : "idle",
    error: enabled ? error : null,
    errorDetail: enabled ? errorDetail : null,
    loadedDelegate: enabled ? loadedDelegate : null,
    retry,
    isReady: enabled &&
      status === "ready" &&
      (!forceCpu || loadedDelegate === "CPU") &&
      Boolean(
      models.poseLandmarker &&
      models.faceLandmarker &&
      models.handLandmarker &&
      (!enableDeepRefinement || (models.faceRefiner && models.handRefiner)),
    ),
  };
}
