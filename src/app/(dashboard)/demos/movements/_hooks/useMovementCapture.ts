"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  FaceLandmarkerResult,
  FaceLandmarker,
  HandLandmarkerResult,
  HandLandmarker,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type Webcam from "react-webcam";
import {
  drawMovementDenseBodyOverlay,
  drawMovementFaceOverlay,
  drawMovementHandOverlay,
  drawMovementSkeleton,
  type MovementTrackingOverlayDetail,
} from "../_lib/movementSkeleton";
import {
  createMovementAcquisitionFilters,
  prepareMovementAcquisitionFrame,
  type MovementAcquisitionFrame,
} from "../_lib/movementPlayerInputContract";
import { buildMovementSpineModel } from "../_lib/movementSpineMetrics";
import {
  buildLiveMovementSourceFrame,
  resolveMovementStrictWholeBodyVisibility,
  type MovementStartReadiness,
  type MovementStrictWholeBodyVisibility,
} from "../_lib/movementSourceFrame";
import {
  buildMovementDeepCaptureFaceEvidence,
  buildMovementDeepCaptureHandEvidence,
} from "../_lib/movementDeepCaptureEvidence";
import {
  MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE,
  carryMovementDeepCaptureFaceEvidence,
  carryMovementDeepCaptureHandEvidence,
  mapMovementDeepCaptureCropLandmarksToSourceFrame,
  resolveMovementDeepCaptureHandRefinementRegion,
  resolveMovementDeepCaptureFaceRefinementRegion,
  resolveMovementDeepCaptureRefinementInputSize,
  resolveMovementDeepCaptureObservationState,
  resolveMovementDeepCaptureRefinementSchedule,
  selectMovementDeepCaptureHandRefinementCandidate,
} from "../_lib/movementDeepCaptureRefinement";
import type {
  MovementDeepCaptureCrop,
  MovementDeepCaptureFaceEvidence,
  MovementDeepCaptureHandEvidence,
} from "../_lib/movementDeepCaptureContract";
import type { MovementHandSide } from "../_lib/movementTypes";
import {
  createMovementDenseCaptureRuntime,
  type MovementDenseCaptureAdapter,
} from "../_lib/movementDenseCapture";
import {
  readMovementDenseCaptureDeviceCapabilities,
  resolveInitialMovementDenseCaptureQualityTier,
  type MovementDenseCaptureQualityTier,
} from "../_lib/movementDenseCaptureQuality";
import { fuseMovementDenseCaptureEvidence } from "../_lib/movementDenseCaptureFusion";
import {
  buildMovementCapturePreflight,
  type MovementCapturePreflight,
} from "../_lib/movementCapturePreflight";
import { resolveMovementCameraDeviceFingerprint } from "../_lib/movementCameraDeviceFingerprint";
import {
  prepareMovementDeepCaptureRecordingFrame,
  validateCompleteMovementDenseCaptureEvidence,
} from "../_lib/movementDeepCaptureRecordingFrame";
import { renderMovementDenseCaptureInput } from "../_lib/movementDenseCaptureInput";
import { isMovementMediaPipeRuntimeAbortError } from "./useMediaPipeVision";
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
  faceRefiner?: FaceLandmarker | null;
  handLandmarker: HandLandmarker | null;
  handRefiner?: HandLandmarker | null;
  isVisionReady: boolean;
  enableDeepCapture?: boolean;
  denseCaptureAdapter?: MovementDenseCaptureAdapter<HTMLCanvasElement> | null;
  trackingOverlayDetail?: MovementTrackingOverlayDetail;
  trackingRecoveryToken?: number;
  onTrackingRuntimeFailure?: () => void;
};

export const MOVEMENT_CAPTURE_RECORDING_VISIBILITY_THRESHOLD = 0.4;
const MOVEMENT_CAPTURE_HIP_VISIBILITY_THRESHOLD = 0.35;
const MOVEMENT_CAPTURE_KNEE_VISIBILITY_THRESHOLD = 0.25;

export function hasProcessableMovementVideoFrame(
  video: Pick<HTMLVideoElement, "readyState" | "videoHeight" | "videoWidth"> | null | undefined,
) {
  return Boolean(
    video &&
    video.readyState === 4 &&
    Number.isFinite(video.videoWidth) &&
    Number.isFinite(video.videoHeight) &&
    video.videoWidth > 0 &&
    video.videoHeight > 0
  );
}

type MovementDeepCaptureRefinementRuntime = {
  inFlight: boolean;
  lastCompletedAtMs: number | null;
  lastDurationMs: number | null;
};

type MovementDeepCaptureRefinementCache = {
  face?: {
    blendshapes: MovementAcquisitionFrame["blendshapes"];
    evidence: MovementDeepCaptureFaceEvidence;
    landmarks: NormalizedLandmark[];
    wasOccluded: boolean;
  };
  hands: Partial<Record<MovementHandSide, {
    evidence: MovementDeepCaptureHandEvidence;
    landmarks: NormalizedLandmark[];
    wasOccluded: boolean;
    worldLandmarks: NonNullable<MovementAcquisitionFrame["hands"]>[MovementHandSide] extends infer Capture
      ? Capture extends { worldLandmarks: infer WorldLandmarks }
        ? WorldLandmarks
        : never
      : never;
  }>>;
};

function renderMovementDeepCaptureCrop({
  canvas,
  crop,
  minimumShortEdgePixels,
  video,
}: {
  canvas: HTMLCanvasElement;
  crop: MovementDeepCaptureCrop;
  minimumShortEdgePixels: number;
  video: HTMLVideoElement;
}) {
  const size = resolveMovementDeepCaptureRefinementInputSize({
    crop,
    minimumShortEdgePixels,
  });
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.clearRect(0, 0, size.width, size.height);
  context.drawImage(
    video,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    size.width,
    size.height,
  );
  return size;
}

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

export function shouldRetainMovementCaptureFrame({
  isRecording,
  landmarks,
}: {
  isRecording: boolean;
  landmarks: NormalizedLandmark[];
}) {
  // Full-body visibility is a start/quality signal, not permission to erase an
  // acquisition frame. Once capture is active, retain every pose result and
  // preserve its readiness/missing-channel evidence for honest replay review.
  return isRecording && landmarks.length > 0;
}

export function getMovementCaptureTrackingFailureMessage(error: unknown) {
  if (isMovementMediaPipeRuntimeAbortError(error)) {
    return "Tracking stopped unexpectedly. Press Retry Tracking; if it repeats, refresh this page.";
  }
  return "Tracking stopped unexpectedly. Press Retry Tracking; if it repeats, refresh this page.";
}

export function createEmptyMovementFaceLandmarkerResult(): FaceLandmarkerResult {
  return {
    faceBlendshapes: [],
    faceLandmarks: [],
    facialTransformationMatrixes: [],
  };
}

export function createEmptyMovementHandLandmarkerResult(): HandLandmarkerResult {
  return {
    handedness: [],
    handednesses: [],
    landmarks: [],
    worldLandmarks: [],
  };
}

export function detectOptionalMovementCaptureChannel<T>(
  detect: () => T,
  fallback: () => T,
  onAbort?: (error: unknown) => void,
) {
  try {
    return detect();
  } catch (error) {
    if (!isMovementMediaPipeRuntimeAbortError(error)) throw error;
    onAbort?.(error);
    return fallback();
  }
}

// One aborted optional-channel frame can be a transient hiccup; this many in a
// row means the face/hand runtime is genuinely dead and only a model rebuild
// brings fingers and face points back.
export const MOVEMENT_OPTIONAL_CHANNEL_ABORT_LIMIT = 3;

// The preflight debug panel refreshes at reading speed, not camera speed.
export const MOVEMENT_PREFLIGHT_UI_INTERVAL_MS = 500;

export function resolveMovementCaptureStartReadiness(
  frame: Pick<MovementAcquisitionFrame, "capturedAt" | "landmarks" | "worldLandmarks">,
): MovementStartReadiness {
  return buildLiveMovementSourceFrame({
    capturedAt: frame.capturedAt,
    poseLandmarks: frame.landmarks ?? [],
    requirements: {
      mode: "full-body",
    },
    sourceStatus: "smoothed",
    worldPoseLandmarks: frame.worldLandmarks ?? [],
  }).startReadiness;
}

export function useMovementCapture({
  webcamRef,
  canvasRef,
  poseLandmarker,
  faceLandmarker,
  faceRefiner = null,
  handLandmarker,
  handRefiner = null,
  isVisionReady,
  enableDeepCapture = false,
  denseCaptureAdapter = null,
  trackingOverlayDetail = "essential",
  trackingRecoveryToken = 0,
  onTrackingRuntimeFailure,
}: UseMovementCaptureInput) {
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [trackingQuality, setTrackingQuality] = useState(0);
  const [spineQuality, setSpineQuality] = useState(0);
  const [denseCaptureQualityTier, setDenseCaptureQualityTier] =
    useState<MovementDenseCaptureQualityTier | null>(null);
  const [denseCaptureFailure, setDenseCaptureFailure] = useState<string | null>(null);
  const denseCaptureQualityTierRef = useRef<MovementDenseCaptureQualityTier | null>(null);
  const denseCaptureFailureRef = useRef<string | null>(null);
  const [denseCaptureOperational, setDenseCaptureOperational] = useState(false);
  const [trackingFailure, setTrackingFailure] = useState<string | null>(null);
  const [trackingFailureDetail, setTrackingFailureDetail] = useState<string | null>(null);
  const [captureStartReadiness, setCaptureStartReadiness] =
    useState<MovementStartReadiness | null>(null);
  const [captureStartWholeBody, setCaptureStartWholeBody] =
    useState<MovementStrictWholeBodyVisibility | null>(null);
  const [capturePreflight, setCapturePreflight] = useState<MovementCapturePreflight>(() => (
    buildMovementCapturePreflight({
      frame: null,
      readiness: null,
      retainedFrameCount: 0,
    })
  ));
  const isRecordingRef = useRef(false);
  const recordedFramesRef = useRef<MovementCaptureFrame[]>([]);
  const acquisitionFiltersRef = useRef(createMovementAcquisitionFilters());
  const refinementFiltersRef = useRef(createMovementAcquisitionFilters());
  const refinementRuntimeRef = useRef<MovementDeepCaptureRefinementRuntime>({
    inFlight: false,
    lastCompletedAtMs: null,
    lastDurationMs: null,
  });
  const refinementCacheRef = useRef<MovementDeepCaptureRefinementCache>({ hands: {} });
  const faceRefinementCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const handRefinementCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const denseCaptureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const denseCaptureOperationalRef = useRef(false);
  const trackingFailureRef = useRef(false);
  const optionalChannelAbortStreaksRef = useRef({ face: 0, hand: 0 });
  const lastPreflightUiUpdateAtRef = useRef(0);
  const latestAcquisitionFrameRef = useRef<MovementAcquisitionFrame | null>(null);
  const latestStartReadinessRef = useRef<MovementStartReadiness | null>(null);
  const trackingOverlayDetailRef = useRef(trackingOverlayDetail);

  useEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    trackingOverlayDetailRef.current = trackingOverlayDetail;
  }, [trackingOverlayDetail]);

  useEffect(() => {
    trackingFailureRef.current = false;
    optionalChannelAbortStreaksRef.current = { face: 0, hand: 0 };
    setTrackingFailure(null);
    setTrackingFailureDetail(null);
  }, [trackingRecoveryToken]);

  useEffect(() => {
    let animationFrameId: number | null = null;
    denseCaptureOperationalRef.current = false;
    setDenseCaptureOperational(false);
    const denseCaptureRuntime = createMovementDenseCaptureRuntime<HTMLCanvasElement>({
      initialQualityTier: resolveInitialMovementDenseCaptureQualityTier(
        readMovementDenseCaptureDeviceCapabilities(),
      ),
    });

    /*
     * The tracking loop runs on every animation frame, and these two were
     * pushed into React state on every one of them — sixty times a second,
     * whether or not the value had moved. React eventually refused: "Maximum
     * update depth exceeded", pointing straight at this loop.
     *
     * The values themselves are right; publishing them unchanged is what was
     * wrong. Each is now held alongside the state so the frame only tells React
     * about a genuine change. The readout on screen is identical.
     */
    let publishedDenseCaptureQualityTier = denseCaptureQualityTierRef.current;
    let publishedDenseCaptureFailure = denseCaptureFailureRef.current;

    const publishDenseCaptureQualityTier = (tier: MovementDenseCaptureQualityTier | null) => {
      if (publishedDenseCaptureQualityTier === tier) return;
      publishedDenseCaptureQualityTier = tier;
      denseCaptureQualityTierRef.current = tier;
      setDenseCaptureQualityTier(tier);
    };

    const publishDenseCaptureFailure = (failure: string | null) => {
      if (publishedDenseCaptureFailure === failure) return;
      publishedDenseCaptureFailure = failure;
      denseCaptureFailureRef.current = failure;
      setDenseCaptureFailure(failure);
    };

    const processVideo = () => {
      if (trackingFailureRef.current) return;

      const video = webcamRef.current?.video;
      const canvas = canvasRef.current;

      if (
        poseLandmarker &&
        faceLandmarker &&
        handLandmarker &&
        video &&
        hasProcessableMovementVideoFrame(video) &&
        canvas
      ) {
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;

        const startTimeMs = performance.now();
        const enterTrackingRuntimeFailure = (trackingError: unknown) => {
          trackingFailureRef.current = true;
          setTrackingFailure(getMovementCaptureTrackingFailureMessage(trackingError));
          setTrackingFailureDetail(
            trackingError instanceof Error ? trackingError.message : String(trackingError),
          );
          setIsRecording(false);
          onTrackingRuntimeFailure?.();
          latestAcquisitionFrameRef.current = null;
          latestStartReadinessRef.current = null;
          setTrackingQuality(0);
          setSpineQuality(0);
          setCaptureStartReadiness(null);
          setCaptureStartWholeBody(null);
          lastPreflightUiUpdateAtRef.current = 0;
          setCapturePreflight(buildMovementCapturePreflight({
            frame: null,
            readiness: null,
            retainedFrameCount: recordedFramesRef.current.length,
          }));
        };
        let poseResults: ReturnType<PoseLandmarker["detectForVideo"]>;
        let faceResults: ReturnType<FaceLandmarker["detectForVideo"]>;
        let handResults: ReturnType<HandLandmarker["detectForVideo"]>;
        let faceChannelAbort: unknown = null;
        let handChannelAbort: unknown = null;
        try {
          poseResults = poseLandmarker.detectForVideo(video, startTimeMs);
          faceResults = detectOptionalMovementCaptureChannel(
            () => faceLandmarker.detectForVideo(video, startTimeMs),
            createEmptyMovementFaceLandmarkerResult,
            (channelError) => {
              faceChannelAbort = channelError;
            },
          );
          handResults = detectOptionalMovementCaptureChannel(
            () => handLandmarker.detectForVideo(video, startTimeMs),
            createEmptyMovementHandLandmarkerResult,
            (channelError) => {
              handChannelAbort = channelError;
            },
          );
        } catch (trackingError) {
          if (!isMovementMediaPipeRuntimeAbortError(trackingError)) throw trackingError;
          enterTrackingRuntimeFailure(trackingError);
          return;
        }

        // A dead face or hand runtime must not silently downgrade capture to
        // pose-only markers: after repeated aborted frames, rebuild the models
        // through the same recovery path as a body-tracking failure.
        const abortStreaks = optionalChannelAbortStreaksRef.current;
        abortStreaks.face = faceChannelAbort ? abortStreaks.face + 1 : 0;
        abortStreaks.hand = handChannelAbort ? abortStreaks.hand + 1 : 0;
        if (
          abortStreaks.face >= MOVEMENT_OPTIONAL_CHANNEL_ABORT_LIMIT ||
          abortStreaks.hand >= MOVEMENT_OPTIONAL_CHANNEL_ABORT_LIMIT
        ) {
          enterTrackingRuntimeFailure(
            (abortStreaks.face >= MOVEMENT_OPTIONAL_CHANNEL_ABORT_LIMIT
              ? faceChannelAbort
              : handChannelAbort) ?? new Error("Aborted()"),
          );
          return;
        }

        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          if (poseResults.landmarks && poseResults.landmarks.length > 0) {
            const acquisitionFrame = prepareMovementAcquisitionFrame({
              camera: {
                deviceFingerprint: resolveMovementCameraDeviceFingerprint(video) ?? undefined,
                facingMode: "user",
                frameHeight: video.videoHeight,
                frameWidth: video.videoWidth,
              },
              capturedAt: Date.now(),
              faceResults,
              filters: acquisitionFiltersRef.current,
              handResults,
              includeSegmentation: enableDeepCapture,
              poseResults,
              sourceTimestampMs: startTimeMs,
            });
            const refinementRuntime = refinementRuntimeRef.current;
            const primaryFaceEvidence = acquisitionFrame.deepCapture?.face;
            const primaryHandEvidence = {
              left: acquisitionFrame.deepCapture?.hands?.left,
              right: acquisitionFrame.deepCapture?.hands?.right,
            };
            const faceRefinementRegion = resolveMovementDeepCaptureFaceRefinementRegion({
              camera: acquisitionFrame.camera,
              poseLandmarks: acquisitionFrame.landmarks ?? [],
              primaryCrop: primaryFaceEvidence?.crop,
            });
            const handRefinementRegions = {
              left: resolveMovementDeepCaptureHandRefinementRegion({
                camera: acquisitionFrame.camera,
                poseLandmarks: acquisitionFrame.landmarks ?? [],
                primaryCrop: primaryHandEvidence.left?.crop,
                side: "left",
              }),
              right: resolveMovementDeepCaptureHandRefinementRegion({
                camera: acquisitionFrame.camera,
                poseLandmarks: acquisitionFrame.landmarks ?? [],
                primaryCrop: primaryHandEvidence.right?.crop,
                side: "right",
              }),
            };
            const hasRegionOfInterest = Boolean(
              faceRefinementRegion ||
              handRefinementRegions.left ||
              handRefinementRegions.right,
            );
            const refinementSchedule = resolveMovementDeepCaptureRefinementSchedule({
              hasRegionOfInterest,
              inFlight: refinementRuntime.inFlight,
              lastCompletedAtMs: refinementRuntime.lastCompletedAtMs,
              lastDurationMs: refinementRuntime.lastDurationMs,
              nowMs: startTimeMs,
            });

            if (enableDeepCapture) {
              const cache = refinementCacheRef.current;
              const nowMs = acquisitionFrame.capturedAt;
              acquisitionFrame.deepCapture ??= { profileId: "movement-deep-capture-v1" };
              if (cache.face) {
                const carriedFace = carryMovementDeepCaptureFaceEvidence({
                  evidence: cache.face.evidence,
                  nowMs,
                  occluded: !faceRefinementRegion,
                });
                if (carriedFace) {
                  cache.face.wasOccluded ||= carriedFace.tracking.occluded;
                  acquisitionFrame.deepCapture.face = carriedFace;
                  acquisitionFrame.faceLandmarks = cache.face.landmarks;
                  acquisitionFrame.blendshapes = cache.face.blendshapes;
                }
              }
              for (const side of ["left", "right"] as const satisfies readonly MovementHandSide[]) {
                const cachedHand = cache.hands[side];
                if (!cachedHand) continue;
                const carriedHand = carryMovementDeepCaptureHandEvidence({
                  evidence: cachedHand.evidence,
                  nowMs,
                  occluded: !handRefinementRegions[side],
                });
                if (!carriedHand) continue;
                cachedHand.wasOccluded ||= carriedHand.tracking.occluded;
                acquisitionFrame.deepCapture.hands ??= {};
                acquisitionFrame.deepCapture.hands[side] = carriedHand;
                const landmarkFilter = side === "left"
                  ? refinementFiltersRef.current.leftHand
                  : refinementFiltersRef.current.rightHand;
                const worldFilter = side === "left"
                  ? refinementFiltersRef.current.leftHandWorld
                  : refinementFiltersRef.current.rightHandWorld;
                acquisitionFrame.hands ??= {};
                acquisitionFrame.hands[side] = {
                  landmarks: landmarkFilter.filter(cachedHand.landmarks, startTimeMs),
                  worldLandmarks: cachedHand.worldLandmarks
                    ? worldFilter.filter(cachedHand.worldLandmarks, startTimeMs)
                    : null,
                };
              }
            }

            if (
              enableDeepCapture &&
              (faceRefiner || handRefiner) &&
              refinementSchedule.run
            ) {
              refinementRuntime.inFlight = true;
              const refinementStartedAtMs = performance.now();
              const capturedAt = Date.now();

              const faceCrop = faceRefinementRegion?.crop;
              if (faceCrop && faceRefiner) {
                faceRefinementCanvasRef.current ??= document.createElement("canvas");
                const inputSize = renderMovementDeepCaptureCrop({
                  canvas: faceRefinementCanvasRef.current,
                  crop: faceCrop,
                  minimumShortEdgePixels:
                    MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.minimumFaceInputPixels,
                  video,
                });
                if (inputSize) {
                  const inferenceStartedAtMs = performance.now();
                  const result = faceRefiner.detect(faceRefinementCanvasRef.current);
                  const cropLandmarks = result.faceLandmarks[0];
                  if (cropLandmarks) {
                    const mappedLandmarks = mapMovementDeepCaptureCropLandmarksToSourceFrame(
                      cropLandmarks,
                      faceCrop,
                    );
                    const mappedResult = {
                      ...result,
                      faceLandmarks: [mappedLandmarks],
                    };
                    const evidence = buildMovementDeepCaptureFaceEvidence({
                      camera: acquisitionFrame.camera,
                      capturedAt,
                      faceResults: mappedResult,
                      sourceTimestampMs: startTimeMs,
                    });
                    if (evidence) {
                      evidence.tracking.state = resolveMovementDeepCaptureObservationState(
                        refinementCacheRef.current.face?.wasOccluded === true,
                      );
                      evidence.refinement = {
                        inferenceDurationMs: performance.now() - inferenceStartedAtMs,
                        inputHeight: inputSize.height,
                        inputWidth: inputSize.width,
                        profileId: MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.id,
                        roiSource: faceRefinementRegion.source,
                        source: "native-roi-second-pass",
                      };
                      acquisitionFrame.deepCapture ??= {
                        profileId: "movement-deep-capture-v1",
                      };
                      acquisitionFrame.deepCapture.face = evidence;
                      acquisitionFrame.faceLandmarks = mappedLandmarks;
                      acquisitionFrame.blendshapes = result.faceBlendshapes[0]?.categories;
                      refinementCacheRef.current.face = {
                        blendshapes: acquisitionFrame.blendshapes,
                        evidence,
                        landmarks: mappedLandmarks,
                        wasOccluded: false,
                      };
                    }
                  }
                }
              }

              for (const side of ["left", "right"] as const satisfies readonly MovementHandSide[]) {
                const refinementRegion = handRefinementRegions[side];
                if (!refinementRegion || !handRefiner) continue;
                handRefinementCanvasRef.current ??= document.createElement("canvas");
                const inputSize = renderMovementDeepCaptureCrop({
                  canvas: handRefinementCanvasRef.current,
                  crop: refinementRegion.crop,
                  minimumShortEdgePixels:
                    MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.minimumHandInputPixels,
                  video,
                });
                if (!inputSize) continue;

                const inferenceStartedAtMs = performance.now();
                const result = handRefiner.detect(handRefinementCanvasRef.current);
                // A fallback crop can contain both hands when they cross. The
                // selector requires complete image/world evidence and resolves
                // every candidate back to trustworthy anatomical Pose wrists.
                const candidate = selectMovementDeepCaptureHandRefinementCandidate({
                  poseLandmarks: acquisitionFrame.landmarks ?? [],
                  refinementRegion,
                  result,
                  side,
                });
                if (!candidate) continue;
                const { assignment, mappedLandmarks, worldLandmarks } = candidate;
                const evidence = buildMovementDeepCaptureHandEvidence({
                  assignment: assignment.assignment,
                  camera: acquisitionFrame.camera,
                  capturedAt,
                  detector: assignment.detector,
                  landmarks: mappedLandmarks,
                  side,
                  sourceTimestampMs: startTimeMs,
                  worldLandmarks,
                });
                if (!evidence) continue;
                evidence.tracking.state = resolveMovementDeepCaptureObservationState(
                  refinementCacheRef.current.hands[side]?.wasOccluded === true,
                );
                evidence.refinement = {
                  inferenceDurationMs: performance.now() - inferenceStartedAtMs,
                  inputHeight: inputSize.height,
                  inputWidth: inputSize.width,
                  profileId: MOVEMENT_DEEP_CAPTURE_REFINEMENT_PROFILE.id,
                  roiSource: refinementRegion.source,
                  source: "native-roi-second-pass",
                };
                acquisitionFrame.deepCapture ??= {
                  profileId: "movement-deep-capture-v1",
                };
                acquisitionFrame.deepCapture.hands ??= {};
                acquisitionFrame.deepCapture.hands[side] = evidence;
                const landmarkFilter = side === "left"
                  ? refinementFiltersRef.current.leftHand
                  : refinementFiltersRef.current.rightHand;
                const worldFilter = side === "left"
                  ? refinementFiltersRef.current.leftHandWorld
                  : refinementFiltersRef.current.rightHandWorld;
                acquisitionFrame.hands ??= {};
                acquisitionFrame.hands[side] = {
                  landmarks: landmarkFilter.filter(mappedLandmarks, startTimeMs),
                  worldLandmarks: worldLandmarks
                    ? worldFilter.filter(worldLandmarks, startTimeMs)
                    : null,
                };
                refinementCacheRef.current.hands[side] = {
                  evidence,
                  landmarks: mappedLandmarks,
                  wasOccluded: false,
                  worldLandmarks,
                };
              }

              refinementRuntime.lastDurationMs = performance.now() - refinementStartedAtMs;
              refinementRuntime.lastCompletedAtMs = startTimeMs;
              refinementRuntime.inFlight = false;
            }

            const segmentation = acquisitionFrame.deepCapture?.denseBody?.segmentation;
            if (enableDeepCapture && denseCaptureAdapter && segmentation) {
              const denseCaptureState = denseCaptureRuntime.getState();
              publishDenseCaptureQualityTier(denseCaptureState.qualityTier);
              let currentDenseCaptureFailure = denseCaptureState.lastFailure;
              const carriedDenseEvidence = denseCaptureRuntime.read({
                currentSegmentation: segmentation,
                nowMs: acquisitionFrame.capturedAt,
              });
              if (carriedDenseEvidence && acquisitionFrame.deepCapture) {
                if (!denseCaptureOperationalRef.current) {
                  denseCaptureOperationalRef.current = true;
                  setDenseCaptureOperational(true);
                }
                acquisitionFrame.deepCapture.denseBody = fuseMovementDenseCaptureEvidence({
                  evidence: carriedDenseEvidence,
                  poseLandmarks: acquisitionFrame.landmarks ?? [],
                  worldPoseLandmarks: acquisitionFrame.worldLandmarks,
                });
                const recordingEvidenceReport = validateCompleteMovementDenseCaptureEvidence(
                  acquisitionFrame.deepCapture.denseBody,
                );
                if (!recordingEvidenceReport.passed) {
                  currentDenseCaptureFailure = recordingEvidenceReport.failures.join(" ");
                }
              }
              publishDenseCaptureFailure(currentDenseCaptureFailure);

              if (denseCaptureRuntime.schedule(startTimeMs).run) {
                denseCaptureCanvasRef.current ??= document.createElement("canvas");
                const qualityTier = denseCaptureRuntime.getState().qualityTier;
                if (renderMovementDenseCaptureInput({
                  canvas: denseCaptureCanvasRef.current,
                  qualityTier,
                  video,
                })) {
                  denseCaptureRuntime.request({
                    adapter: denseCaptureAdapter,
                    context: {
                      frameHeight: video.videoHeight,
                      frameWidth: video.videoWidth,
                      sourceTimestampMs: startTimeMs,
                    },
                    input: denseCaptureCanvasRef.current,
                    nowMs: startTimeMs,
                    segmentation,
                  });
                }
              }
            }
            const smoothedLandmarks = acquisitionFrame.landmarks;
            if (!smoothedLandmarks) {
              animationFrameId = requestAnimationFrame(processVideo);
              return;
            }
            const fullBodyVisibility = getMovementCaptureFullBodyVisibility(smoothedLandmarks);
            const startReadiness = resolveMovementCaptureStartReadiness(acquisitionFrame);
            const spineModel = buildMovementSpineModel(smoothedLandmarks);
            latestAcquisitionFrameRef.current = acquisitionFrame;
            latestStartReadinessRef.current = startReadiness;
            setTrackingQuality(Math.round(fullBodyVisibility * 100));
            setSpineQuality(spineModel?.neutralStackScore ?? 0);
            setCaptureStartReadiness(startReadiness);
            setCaptureStartWholeBody(resolveMovementStrictWholeBodyVisibility(smoothedLandmarks));
            drawMovementSkeleton(ctx, smoothedLandmarks, canvas.width, canvas.height);
            if (enableDeepCapture) {
              drawMovementDenseBodyOverlay(
                ctx,
                acquisitionFrame.deepCapture?.denseBody?.anchors,
                canvas.width,
                canvas.height,
                trackingOverlayDetailRef.current,
              );
              drawMovementFaceOverlay(
                ctx,
                acquisitionFrame.faceLandmarks,
                canvas.width,
                canvas.height,
                trackingOverlayDetailRef.current,
              );
            }
            drawMovementHandOverlay(
              ctx,
              acquisitionFrame.hands,
              canvas.width,
              canvas.height,
            );

            if (shouldRetainMovementCaptureFrame({
              isRecording: isRecordingRef.current,
              landmarks: smoothedLandmarks,
            })) {
              const recordingFrame = enableDeepCapture
                ? prepareMovementDeepCaptureRecordingFrame(acquisitionFrame)
                : acquisitionFrame;
              const currentData: MovementCaptureFrame = {
                ...recordingFrame,
                timestamp: startTimeMs,
                landmarks: smoothedLandmarks,
                startReadiness,
              };

              recordedFramesRef.current.push(currentData);
              setFrameCount(recordedFramesRef.current.length);
            }

            // The debug preflight panel reads at a glance; refreshing it on
            // every camera frame made it jitter constantly for no diagnostic
            // gain. Twice a second is current enough.
            if (startTimeMs - lastPreflightUiUpdateAtRef.current >= MOVEMENT_PREFLIGHT_UI_INTERVAL_MS) {
              lastPreflightUiUpdateAtRef.current = startTimeMs;
              setCapturePreflight(buildMovementCapturePreflight({
                frame: acquisitionFrame,
                readiness: startReadiness,
                retainedFrameCount: recordedFramesRef.current.length,
              }));
            }
          } else {
            latestAcquisitionFrameRef.current = null;
            latestStartReadinessRef.current = null;
            setTrackingQuality(0);
            setSpineQuality(0);
            publishDenseCaptureQualityTier(enableDeepCapture && denseCaptureAdapter
              ? denseCaptureRuntime.getState().qualityTier
              : null);
            publishDenseCaptureFailure(enableDeepCapture && denseCaptureAdapter
              ? denseCaptureRuntime.getState().lastFailure
              : null);
            setCaptureStartReadiness(null);
            setCaptureStartWholeBody(null);
            const nowMs = performance.now();
            if (nowMs - lastPreflightUiUpdateAtRef.current >= MOVEMENT_PREFLIGHT_UI_INTERVAL_MS) {
              lastPreflightUiUpdateAtRef.current = nowMs;
              setCapturePreflight(buildMovementCapturePreflight({
                frame: null,
                readiness: null,
                retainedFrameCount: recordedFramesRef.current.length,
              }));
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(processVideo);
    };

    if (isVisionReady) {
      processVideo();
    }

    return () => {
      denseCaptureRuntime.dispose();
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [
    canvasRef,
    denseCaptureAdapter,
    enableDeepCapture,
    faceLandmarker,
    faceRefiner,
    handLandmarker,
    handRefiner,
    isVisionReady,
    onTrackingRuntimeFailure,
    poseLandmarker,
    webcamRef,
  ]);

  const resetTrackingFailure = useCallback(() => {
    trackingFailureRef.current = false;
    optionalChannelAbortStreaksRef.current = { face: 0, hand: 0 };
    setTrackingFailure(null);
    setTrackingFailureDetail(null);
  }, []);

  const startRecording = useCallback(() => {
    if (!isVisionReady || trackingFailureRef.current) return;

    recordedFramesRef.current = [];
    setFrameCount(0);
    setCapturePreflight(buildMovementCapturePreflight({
      frame: latestAcquisitionFrameRef.current,
      readiness: latestStartReadinessRef.current,
      retainedFrameCount: 0,
    }));
    setIsRecording(true);
  }, [isVisionReady]);

  const stopRecording = useCallback(() => {
    setIsRecording(false);
    return recordedFramesRef.current;
  }, []);

  const getRecordedFrames = useCallback(() => recordedFramesRef.current, []);

  return {
    capturePreflight,
    captureStartReadiness,
    captureStartWholeBody,
    denseCaptureFailure,
    denseCaptureOperational,
    denseCaptureQualityTier,
    trackingFailure,
    trackingFailureDetail,
    isRecording,
    frameCount,
    trackingQuality,
    spineQuality,
    startRecording,
    stopRecording,
    getRecordedFrames,
    resetTrackingFailure,
  };
}
