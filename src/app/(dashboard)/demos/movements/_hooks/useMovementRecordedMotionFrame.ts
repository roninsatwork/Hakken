"use client";

import { useEffect, useRef, type RefObject } from "react";
import { buildRecordedMovementMotionFrame } from "../_lib/movementRecordedMotionFrame";
import type { MovementMotionFrame } from "../_lib/movementMotionFrame";
import type { MovementRetargetSourceModel } from "../_lib/movementRetargeting";
import type { VrmMotionRef } from "../_lib/vrmRigging";

type UseMovementRecordedMotionFrameInput = {
  instructorFrameRef: RefObject<VrmMotionRef>;
  isPlaying: boolean;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

export function useMovementRecordedMotionFrame({
  instructorFrameRef,
  isPlaying,
  retargetSourceModel,
}: UseMovementRecordedMotionFrameInput) {
  const motionFrameRef = useRef<MovementMotionFrame | null>(null);

  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    let lastProcessedMotionRef: VrmMotionRef = null;

    const updateMotionFrame = () => {
      if (!active) return;
      const currentMotionRef = instructorFrameRef.current;
      if (currentMotionRef !== lastProcessedMotionRef) {
        lastProcessedMotionRef = currentMotionRef;
        const nextMotionFrame = buildRecordedMovementMotionFrame({
          isPlaying,
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
    };
  }, [instructorFrameRef, isPlaying, retargetSourceModel]);

  return motionFrameRef;
}
