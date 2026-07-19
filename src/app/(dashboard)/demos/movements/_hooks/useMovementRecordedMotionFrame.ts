"use client";

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { buildRecordedMovementMotionFrame } from "../_lib/movementRecordedMotionFrame";
import type { MovementMotionFrame } from "../_lib/movementMotionFrame";
import type { MovementRetargetSourceModel } from "../_lib/movementRetargeting";
import type { MovementCalibration } from "../_lib/movementTrackingCalibration";
import type { VrmMotionRef } from "../_lib/vrmRigging";
import type { MovementLiveInitialFrame } from "./useMovementLiveMotionFrame";

type UseMovementRecordedMotionFrameInput = {
  calibration?: MovementCalibration | null;
  controlledFrameIndexRef?: RefObject<{ frameIndex: number }>;
  controlledMotionSequence?: VrmMotionRef[] | null;
  initialFrameSequenceRef?: MutableRefObject<MovementLiveInitialFrame[]>;
  initialMotionSequence?: VrmMotionRef[] | null;
  instructorFrameRef: RefObject<VrmMotionRef>;
  isPlaying: boolean;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

export function useMovementRecordedMotionFrame({
  calibration = null,
  controlledFrameIndexRef,
  controlledMotionSequence = null,
  initialFrameSequenceRef,
  initialMotionSequence = null,
  instructorFrameRef,
  isPlaying,
  retargetSourceModel,
}: UseMovementRecordedMotionFrameInput) {
  const motionFrameRef = useRef<MovementMotionFrame | null>(null);
  const isPlayingRef = useRef(isPlaying);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    let lastProcessedMotionRef: VrmMotionRef = null;
    let lastProcessedControlledFrameIndex = (initialMotionSequence?.length ?? 0) - 1;
    const initialMotionRefs = new Set<VrmMotionRef>(initialMotionSequence ?? []);
    const initialMotionFrameIds = new Set(
      (initialMotionSequence ?? []).flatMap((motionRef) => {
        const frameId = !Array.isArray(motionRef) ? motionRef?.frameId : undefined;
        return frameId ? [frameId] : [];
      }),
    );
    if (initialFrameSequenceRef) initialFrameSequenceRef.current = [];
    if (initialMotionSequence && initialMotionSequence.length > 0) {
      let previousMotionFrame: MovementMotionFrame | null = null;
      const initialFrames: MovementLiveInitialFrame[] = [];
      for (const motionRef of initialMotionSequence) {
        previousMotionFrame = buildRecordedMovementMotionFrame({
          calibration,
          isPlaying: isPlayingRef.current,
          motionRef,
          previousMotionFrame,
          retargetSourceModel,
        });
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
      if (controlledMotionSequence && controlledFrameIndexRef) {
        const targetFrameIndex = Math.min(
          Math.max(controlledFrameIndexRef.current.frameIndex, 0),
          controlledMotionSequence.length - 1,
        );
        while (lastProcessedControlledFrameIndex < targetFrameIndex) {
          lastProcessedControlledFrameIndex += 1;
          const motionRef = controlledMotionSequence[lastProcessedControlledFrameIndex] ?? null;
          const nextMotionFrame = buildRecordedMovementMotionFrame({
            calibration,
            isPlaying: isPlayingRef.current,
            motionRef,
            previousMotionFrame: motionFrameRef.current,
            retargetSourceModel,
          });
          if (nextMotionFrame) {
            motionFrameRef.current = nextMotionFrame;
            initialFrameSequenceRef?.current.push({ motionFrame: nextMotionFrame, motionRef });
          }
          lastProcessedMotionRef = motionRef;
        }
        animationFrameId = requestAnimationFrame(updateMotionFrame);
        return;
      }
      const currentMotionRef = instructorFrameRef.current;
      const currentFrameId = !Array.isArray(currentMotionRef)
        ? currentMotionRef?.frameId
        : undefined;
      const wasProcessedByInitialSequence = initialMotionRefs.has(currentMotionRef) || Boolean(
        currentFrameId && initialMotionFrameIds.has(currentFrameId)
      );
      if (wasProcessedByInitialSequence) {
        lastProcessedMotionRef = currentMotionRef;
      } else if (currentMotionRef !== lastProcessedMotionRef) {
        lastProcessedMotionRef = currentMotionRef;
        const nextMotionFrame = buildRecordedMovementMotionFrame({
          calibration,
          isPlaying: isPlayingRef.current,
          motionRef: currentMotionRef,
          previousMotionFrame: motionFrameRef.current,
          retargetSourceModel,
        });
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
  }, [
    calibration,
    controlledFrameIndexRef,
    controlledMotionSequence,
    initialFrameSequenceRef,
    initialMotionSequence,
    instructorFrameRef,
    retargetSourceModel,
  ]);

  return motionFrameRef;
}
