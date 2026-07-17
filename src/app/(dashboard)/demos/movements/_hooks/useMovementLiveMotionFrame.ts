"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { buildLiveMovementMotionFrame } from "../_lib/movementLiveMotionFrame";
import type { MovementMotionFrame } from "../_lib/movementMotionFrame";
import type { MovementRetargetSourceModel } from "../_lib/movementRetargeting";
import type { MovementSourceFrameRequirements } from "../_lib/movementSourceFrame";
import type { MovementCalibration } from "../_lib/movementTrackingCalibration";
import type { VrmMotionRef } from "../_lib/vrmRigging";

type UseMovementLiveMotionFrameInput = {
  calibration: MovementCalibration | null;
  debugProcessingRef?: MutableRefObject<MovementLiveMotionFrameProcessingDebug>;
  initialFrameSequenceRef?: MutableRefObject<MovementLiveInitialFrame[]>;
  initialMotionSequence?: VrmMotionRef[] | null;
  isPlaying: boolean;
  motionSequence?: VrmMotionRef[] | null;
  playerLiveLmRef: RefObject<VrmMotionRef>;
  requirements?: MovementSourceFrameRequirements;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

export type MovementLiveMotionFrameProcessingDebug = {
  effectRunCount: number;
  processedFrames: Array<{
    effectRun: number;
    frameId: string;
    rootHistoryLength: number;
  }>;
  processedFrameIds: string[];
};

export type MovementLiveInitialFrame = {
  motionFrame: MovementMotionFrame;
  motionRef: VrmMotionRef;
};

export function useMovementLiveMotionFrame({
  calibration,
  debugProcessingRef,
  initialFrameSequenceRef,
  initialMotionSequence = null,
  isPlaying,
  motionSequence = null,
  playerLiveLmRef,
  requirements,
  retargetSourceModel,
}: UseMovementLiveMotionFrameInput) {
  const motionFrameRef = useRef<MovementMotionFrame | null>(null);
  const isPlayingRef = useRef(isPlaying);
  const requirementsRef = useRef(requirements);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
    requirementsRef.current = requirements;
  }, [isPlaying, requirements]);

  useEffect(() => {
    if (debugProcessingRef) debugProcessingRef.current.effectRunCount += 1;
    const effectRun = debugProcessingRef?.current.effectRunCount ?? 0;
    if (initialFrameSequenceRef) initialFrameSequenceRef.current = [];
    if (motionSequence && motionSequence.length > 0) {
      let previousMotionFrame: MovementMotionFrame | null = null;
      for (const motionRef of motionSequence) {
        const frameId = !Array.isArray(motionRef) ? motionRef?.frameId : undefined;
        if (frameId && debugProcessingRef) debugProcessingRef.current.processedFrameIds.push(frameId);
        previousMotionFrame = buildLiveMovementMotionFrame({
          calibration,
          isPlaying: isPlayingRef.current,
          motionRef,
          previousMotionFrame,
          requirements: requirementsRef.current,
          retargetSourceModel,
        });
        if (frameId && previousMotionFrame && debugProcessingRef) {
          debugProcessingRef.current.processedFrames.push({
            effectRun,
            frameId,
            rootHistoryLength: previousMotionFrame.rootMotionHistory.length,
          });
        }
      }
      motionFrameRef.current = previousMotionFrame;
      return () => {
        motionFrameRef.current = null;
      };
    }

    let active = true;
    let animationFrameId: number;
    let lastProcessedMotionRef: VrmMotionRef = null;
    const initialMotionRefs = new Set<VrmMotionRef>(initialMotionSequence ?? []);
    const initialMotionFrameIds = new Set(
      (initialMotionSequence ?? []).flatMap((motionRef) => {
        const frameId = !Array.isArray(motionRef) ? motionRef?.frameId : undefined;
        return frameId ? [frameId] : [];
      }),
    );
    if (initialMotionSequence && initialMotionSequence.length > 0) {
      let previousMotionFrame: MovementMotionFrame | null = null;
      const initialFrames: MovementLiveInitialFrame[] = [];
      for (const motionRef of initialMotionSequence) {
        const frameId = !Array.isArray(motionRef) ? motionRef?.frameId : undefined;
        if (frameId && debugProcessingRef) debugProcessingRef.current.processedFrameIds.push(frameId);
        previousMotionFrame = buildLiveMovementMotionFrame({
          calibration,
          isPlaying: isPlayingRef.current,
          motionRef,
          previousMotionFrame,
          requirements: requirementsRef.current,
          retargetSourceModel,
        });
        if (frameId && previousMotionFrame && debugProcessingRef) {
          debugProcessingRef.current.processedFrames.push({
            effectRun,
            frameId,
            rootHistoryLength: previousMotionFrame.rootMotionHistory.length,
          });
        }
        if (previousMotionFrame) {
          initialFrames.push({ motionFrame: previousMotionFrame, motionRef });
        }
      }
      if (initialFrameSequenceRef) initialFrameSequenceRef.current = initialFrames;
      motionFrameRef.current = previousMotionFrame;
      lastProcessedMotionRef = initialMotionSequence.at(-1) ?? null;
    }

    const updateMotionFrame = () => {
      if (!active) return;
      const currentMotionRef = playerLiveLmRef.current;
      const currentFrameId = !Array.isArray(currentMotionRef) ? currentMotionRef?.frameId : undefined;
      const wasProcessedByInitialSequence = initialMotionRefs.has(currentMotionRef) || Boolean(
        currentFrameId && initialMotionFrameIds.has(currentFrameId)
      );
      if (wasProcessedByInitialSequence) {
        lastProcessedMotionRef = currentMotionRef;
      } else if (currentMotionRef !== lastProcessedMotionRef) {
        lastProcessedMotionRef = currentMotionRef;
        const frameId = currentFrameId;
        if (frameId && debugProcessingRef) debugProcessingRef.current.processedFrameIds.push(frameId);
        const nextMotionFrame = buildLiveMovementMotionFrame({
          calibration,
          isPlaying: isPlayingRef.current,
          motionRef: currentMotionRef,
          previousMotionFrame: motionFrameRef.current,
          requirements: requirementsRef.current,
          retargetSourceModel,
        });
        if (frameId && nextMotionFrame && debugProcessingRef) {
          debugProcessingRef.current.processedFrames.push({
            effectRun,
            frameId,
            rootHistoryLength: nextMotionFrame.rootMotionHistory.length,
          });
        }
        // A detector gap is missing evidence, not a neutral human pose.
        if (nextMotionFrame) motionFrameRef.current = nextMotionFrame;
      }
      animationFrameId = requestAnimationFrame(updateMotionFrame);
    };

    updateMotionFrame();

    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
      motionFrameRef.current = null;
      if (initialFrameSequenceRef) initialFrameSequenceRef.current = [];
    };
  }, [calibration, debugProcessingRef, initialFrameSequenceRef, initialMotionSequence, motionSequence, playerLiveLmRef, retargetSourceModel]);

  return motionFrameRef;
}
