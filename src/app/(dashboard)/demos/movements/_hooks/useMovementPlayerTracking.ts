"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import type {
  Classifications,
  FaceLandmarker,
  HandLandmarker,
  Landmark,
  NormalizedLandmark,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import type Webcam from "react-webcam";
import {
  createMovementAcquisitionFilters,
  prepareMovementAcquisitionFrame,
  type MovementAcquisitionCameraMetadata,
  type MovementPlayerInputContractId,
} from "../_lib/movementPlayerInputContract";
import { resolveMovementCameraDeviceFingerprint } from "../_lib/movementCameraDeviceFingerprint";
import type { MovementHandSide } from "../_lib/movementTypes";
import type { MovementDeepCaptureFrameEvidence } from "../_lib/movementDeepCaptureContract";
import type { MovementDeepCaptureProfileId } from "../_lib/movementDeepCaptureContract";
import { resolveMovementReplayFrameDelay } from "../_lib/movementReplayPlaybackClock";

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
  acquisitionProfileId?: MovementPlayerInputContractId | MovementDeepCaptureProfileId;
  capturedAt?: number;
  frameId?: string;
  camera?: MovementAcquisitionCameraMetadata;
  deepCapture?: MovementDeepCaptureFrameEvidence;
  landmarks?: PlayerPoseLandmark[];
  worldLandmarks?: PlayerPoseLandmark[] | null;
  faceLandmarks?: PlayerPoseLandmark[] | null;
  blendshapes?: Classifications["categories"];
  hands?: PlayerHandsPayload;
  sourceTimestampMs?: number;
};

type UseMovementPlayerTrackingInput = {
  webcamRef: RefObject<Webcam | null>;
  poseLandmarker: PoseLandmarker | null;
  faceLandmarker: FaceLandmarker | null;
  handLandmarker: HandLandmarker | null;
  onBodyTracked?: () => void;
  recordedSourceSequence?: MovementPlayerMotionPayload[] | null;
  recordedSourcePlayback?: {
    controlRef: MutableRefObject<{
      isCheckingStart?: boolean;
      isPlaying: boolean;
    }>;
    fallbackFps?: number;
    motionFrameIndexRef?: MutableRefObject<number>;
    renderedFrameIndexRef?: MutableRefObject<number>;
    setupFrameCount: number;
    stateRef: MutableRefObject<MovementRecordedSourcePlaybackState>;
  } | null;
};

export type MovementRecordedSourcePlaybackState = {
  activeFrameStartIndex?: number;
  completedAt?: number;
  frameIndex: number;
  phase: "idle" | "setup" | "ready" | "checking-start" | "playing" | "paused" | "complete";
  processedFrameIndexes: number[];
  startedAt?: number;
};

export function createMovementRecordedSourcePlaybackState(): MovementRecordedSourcePlaybackState {
  return {
    frameIndex: -1,
    phase: "idle",
    processedFrameIndexes: [],
  };
}

export function useMovementPlayerTracking({
  webcamRef,
  poseLandmarker,
  faceLandmarker,
  handLandmarker,
  onBodyTracked,
  recordedSourceSequence = null,
  recordedSourcePlayback = null,
}: UseMovementPlayerTrackingInput) {
  const playerLiveLmRef = useRef<MovementPlayerMotionPayload | null>(null);
  const acquisitionFiltersRef = useRef(createMovementAcquisitionFilters());
  const hasRecordedSource = Boolean(recordedSourceSequence?.length);
  // Recorded packet playback is a complete acquisition source. Keep it isolated
  // from the asynchronous MediaPipe detector lifecycle so detectors becoming
  // ready cannot restart an in-flight Replay/Game proof from frame zero.
  const activePoseLandmarker = hasRecordedSource ? null : poseLandmarker;
  const activeFaceLandmarker = hasRecordedSource ? null : faceLandmarker;
  const activeHandLandmarker = hasRecordedSource ? null : handLandmarker;

  useEffect(() => {
    let animationFrameId: number | null = null;
    let timeoutId: number | null = null;
    let recordedFrameIndex = 0;

    const scheduleRecordedFrame = (callback: () => void, delayMs: number) => {
      timeoutId = window.setTimeout(callback, delayMs);
    };

    const continueAfterMotionFrame = (frameIndex: number, callback: () => void) => {
      const motionFrameIndex = recordedSourcePlayback?.motionFrameIndexRef?.current;
      if (motionFrameIndex !== undefined && motionFrameIndex < frameIndex) {
        animationFrameId = requestAnimationFrame(() => (
          continueAfterMotionFrame(frameIndex, callback)
        ));
        return;
      }
      callback();
    };

    const publishRecordedFrame = (frameIndex: number) => {
      const frame = recordedSourceSequence?.[frameIndex] ?? null;
      playerLiveLmRef.current = frame;
      if (frame?.landmarks) onBodyTracked?.();
      if (recordedSourcePlayback) {
        const state = recordedSourcePlayback.stateRef.current;
        state.frameIndex = frameIndex;
        if (!state.processedFrameIndexes.includes(frameIndex)) {
          state.processedFrameIndexes.push(frameIndex);
        }
      }
    };

    const processControlledRecordedSource = () => {
      if (!recordedSourceSequence || !recordedSourcePlayback) return;
      const state = recordedSourcePlayback.stateRef.current;
      const lastFrameIndex = recordedSourceSequence.length - 1;
      const setupLastFrameIndex = Math.min(
        Math.max(recordedSourcePlayback.setupFrameCount - 1, -1),
        lastFrameIndex,
      );

      if (recordedFrameIndex <= setupLastFrameIndex) {
        state.phase = "setup";
        publishRecordedFrame(recordedFrameIndex);
        if (recordedFrameIndex === lastFrameIndex) {
          state.phase = "complete";
          state.completedAt = performance.now();
          return;
        }
        if (recordedFrameIndex === setupLastFrameIndex) {
          state.phase = "ready";
          recordedFrameIndex += 1;
          animationFrameId = requestAnimationFrame(processControlledRecordedSource);
          return;
        }
        const delayMs = resolveMovementReplayFrameDelay({
          currentFrameIndex: recordedFrameIndex,
          fallbackFps: recordedSourcePlayback.fallbackFps,
          samples: recordedSourceSequence,
        });
        recordedFrameIndex += 1;
        scheduleRecordedFrame(processControlledRecordedSource, delayMs);
        return;
      }

      if (!recordedSourcePlayback.controlRef.current.isPlaying) {
        if (
          recordedSourcePlayback.controlRef.current.isCheckingStart &&
          state.startedAt === undefined
        ) {
          state.phase = "checking-start";
          const previousFrameIndex = Math.max(0, recordedFrameIndex - 1);
          const delayMs = resolveMovementReplayFrameDelay({
            currentFrameIndex: previousFrameIndex,
            fallbackFps: recordedSourcePlayback.fallbackFps,
            samples: recordedSourceSequence,
          });
          scheduleRecordedFrame(() => {
            if (recordedSourcePlayback.controlRef.current.isPlaying) {
              processControlledRecordedSource();
              return;
            }
            if (!recordedSourcePlayback.controlRef.current.isCheckingStart) {
              processControlledRecordedSource();
              return;
            }
            publishRecordedFrame(recordedFrameIndex);
            const publishedFrameIndex = recordedFrameIndex;
            continueAfterMotionFrame(publishedFrameIndex, () => {
              if (publishedFrameIndex >= lastFrameIndex) {
                recordedFrameIndex += 1;
                state.phase = "ready";
                return;
              }
              recordedFrameIndex += 1;
              processControlledRecordedSource();
            });
          }, delayMs);
          return;
        }
        state.phase = state.startedAt === undefined ? "ready" : "paused";
        animationFrameId = requestAnimationFrame(processControlledRecordedSource);
        return;
      }

      if (state.startedAt === undefined) {
        if (recordedFrameIndex > lastFrameIndex) {
          state.phase = "complete";
          state.completedAt = performance.now();
          return;
        }
        state.activeFrameStartIndex = recordedFrameIndex;
        state.startedAt = performance.now();
      }
      state.phase = "playing";
      const previousFrameIndex = Math.max(0, recordedFrameIndex - 1);
      const delayMs = resolveMovementReplayFrameDelay({
        currentFrameIndex: previousFrameIndex,
        fallbackFps: recordedSourcePlayback.fallbackFps,
        samples: recordedSourceSequence,
      });
      scheduleRecordedFrame(() => {
        if (!recordedSourcePlayback.controlRef.current.isPlaying) {
          processControlledRecordedSource();
          return;
        }
        publishRecordedFrame(recordedFrameIndex);
        const publishedFrameIndex = recordedFrameIndex;
        const continueAfterRender = () => {
          const renderedFrameIndex = recordedSourcePlayback.renderedFrameIndexRef?.current;
          if (
            renderedFrameIndex !== undefined &&
            renderedFrameIndex < publishedFrameIndex
          ) {
            animationFrameId = requestAnimationFrame(continueAfterRender);
            return;
          }
          if (publishedFrameIndex >= lastFrameIndex) {
            state.phase = "complete";
            state.completedAt = performance.now();
            return;
          }
          recordedFrameIndex += 1;
          processControlledRecordedSource();
        };
        continueAfterRender();
      }, delayMs);
    };

    const processVideo = () => {
      if (recordedSourceSequence && recordedSourceSequence.length > 0) {
        if (recordedSourcePlayback) {
          processControlledRecordedSource();
          return;
        }
        const frame = recordedSourceSequence[
          Math.min(recordedFrameIndex, recordedSourceSequence.length - 1)
        ];
        // Synthetic proof poses without source timing represent a live camera
        // lane. Publish a fresh immutable sample so start-gate stability proof
        // exercises multiple frames instead of one permanently held object.
        playerLiveLmRef.current = frame
          ? frame.capturedAt === undefined
            ? { ...frame, capturedAt: Date.now() }
            : frame
          : null;
        if (frame?.landmarks) onBodyTracked?.();
        if (recordedFrameIndex < recordedSourceSequence.length - 1) {
          recordedFrameIndex += 1;
        }
        animationFrameId = requestAnimationFrame(processVideo);
        return;
      }

      const video = webcamRef.current?.video;

      if (
        activePoseLandmarker &&
        activeFaceLandmarker &&
        activeHandLandmarker &&
        video &&
        video.readyState === 4
      ) {
        const startTimeMs = performance.now();
        const poseResults = activePoseLandmarker.detectForVideo(video, startTimeMs);
        const faceResults = activeFaceLandmarker.detectForVideo(video, startTimeMs);
        const handResults = activeHandLandmarker.detectForVideo(video, startTimeMs);
        const currentData: MovementPlayerMotionPayload = prepareMovementAcquisitionFrame({
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
          poseResults,
          sourceTimestampMs: startTimeMs,
        });

        if (currentData.landmarks) {
          onBodyTracked?.();
        }

        playerLiveLmRef.current = currentData;
      }

      animationFrameId = requestAnimationFrame(processVideo);
    };

    if (
      (recordedSourceSequence && recordedSourceSequence.length > 0) ||
      (activePoseLandmarker && activeFaceLandmarker && activeHandLandmarker)
    ) {
      processVideo();
    }

    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
      }
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    activeFaceLandmarker,
    activeHandLandmarker,
    activePoseLandmarker,
    onBodyTracked,
    recordedSourceSequence,
    recordedSourcePlayback,
    webcamRef,
  ]);

  return playerLiveLmRef;
}
