"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type {
  FaceLandmarker,
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
  type MovementStartReadiness,
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
  MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES,
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
};

export const MOVEMENT_CAPTURE_RECORDING_VISIBILITY_THRESHOLD = 0.4;
const MOVEMENT_CAPTURE_HIP_VISIBILITY_THRESHOLD = 0.35;
const MOVEMENT_CAPTURE_KNEE_VISIBILITY_THRESHOLD = 0.25;

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

function renderMovementDenseCaptureInput({
  canvas,
  qualityTier,
  video,
}: {
  canvas: HTMLCanvasElement;
  qualityTier: MovementDenseCaptureQualityTier;
  video: HTMLVideoElement;
}) {
  const { inputHeight, inputWidth } = MOVEMENT_DENSE_CAPTURE_QUALITY_PROFILES[qualityTier];
  canvas.width = inputWidth;
  canvas.height = inputHeight;
  const context = canvas.getContext("2d");
  if (!context) return false;
  context.clearRect(0, 0, inputWidth, inputHeight);
  context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight, 0, 0, inputWidth, inputHeight);
  return true;
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
}: UseMovementCaptureInput) {
  const [isRecording, setIsRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [trackingQuality, setTrackingQuality] = useState(0);
  const [spineQuality, setSpineQuality] = useState(0);
  const [denseCaptureQualityTier, setDenseCaptureQualityTier] =
    useState<MovementDenseCaptureQualityTier | null>(null);
  const [captureStartReadiness, setCaptureStartReadiness] =
    useState<MovementStartReadiness | null>(null);
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
    let animationFrameId: number | null = null;
    const denseCaptureRuntime = createMovementDenseCaptureRuntime<HTMLCanvasElement>({
      initialQualityTier: resolveInitialMovementDenseCaptureQualityTier(
        readMovementDenseCaptureDeviceCapabilities(),
      ),
    });

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
              setDenseCaptureQualityTier(denseCaptureRuntime.getState().qualityTier);
              const carriedDenseEvidence = denseCaptureRuntime.read({
                currentSegmentation: segmentation,
                nowMs: acquisitionFrame.capturedAt,
              });
              if (carriedDenseEvidence && acquisitionFrame.deepCapture) {
                acquisitionFrame.deepCapture.denseBody = fuseMovementDenseCaptureEvidence({
                  evidence: carriedDenseEvidence,
                  poseLandmarks: acquisitionFrame.landmarks ?? [],
                  worldPoseLandmarks: acquisitionFrame.worldLandmarks,
                });
              }

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
              const currentData: MovementCaptureFrame = {
                ...acquisitionFrame,
                timestamp: startTimeMs,
                landmarks: smoothedLandmarks,
                startReadiness,
              };

              recordedFramesRef.current.push(currentData);
              setFrameCount(recordedFramesRef.current.length);
            }

            setCapturePreflight(buildMovementCapturePreflight({
              frame: acquisitionFrame,
              readiness: startReadiness,
              retainedFrameCount: recordedFramesRef.current.length,
            }));
          } else {
            latestAcquisitionFrameRef.current = null;
            latestStartReadinessRef.current = null;
            setTrackingQuality(0);
            setSpineQuality(0);
            setDenseCaptureQualityTier(enableDeepCapture && denseCaptureAdapter
              ? denseCaptureRuntime.getState().qualityTier
              : null);
            setCaptureStartReadiness(null);
            setCapturePreflight(buildMovementCapturePreflight({
              frame: null,
              readiness: null,
              retainedFrameCount: recordedFramesRef.current.length,
            }));
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
  }, [canvasRef, denseCaptureAdapter, enableDeepCapture, faceLandmarker, faceRefiner, handLandmarker, handRefiner, isVisionReady, poseLandmarker, webcamRef]);

  const startRecording = useCallback(() => {
    if (!isVisionReady) return;

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
    denseCaptureQualityTier,
    isRecording,
    frameCount,
    trackingQuality,
    spineQuality,
    startRecording,
    stopRecording,
    getRecordedFrames,
  };
}
