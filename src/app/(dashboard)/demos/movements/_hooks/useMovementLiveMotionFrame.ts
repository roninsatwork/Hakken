"use client";

import { useEffect, useRef, type RefObject } from "react";
import { buildLiveMovementMotionFrame } from "../_lib/movementLiveMotionFrame";
import type { MovementMotionFrame } from "../_lib/movementMotionFrame";
import type { MovementRetargetSourceModel } from "../_lib/movementRetargeting";
import type { MovementSourceFrameRequirements } from "../_lib/movementSourceFrame";
import type { MovementCalibration } from "../_lib/movementTrackingCalibration";
import type { VrmMotionRef } from "../_lib/vrmRigging";

type UseMovementLiveMotionFrameInput = {
  calibration: MovementCalibration | null;
  isPlaying: boolean;
  playerLiveLmRef: RefObject<VrmMotionRef>;
  requirements?: MovementSourceFrameRequirements;
  retargetSourceModel: MovementRetargetSourceModel | null;
};

export function useMovementLiveMotionFrame({
  calibration,
  isPlaying,
  playerLiveLmRef,
  requirements,
  retargetSourceModel,
}: UseMovementLiveMotionFrameInput) {
  const motionFrameRef = useRef<MovementMotionFrame | null>(null);

  useEffect(() => {
    let active = true;
    let animationFrameId: number;
    let lastProcessedMotionRef: VrmMotionRef = null;

    const updateMotionFrame = () => {
      if (!active) return;
      const currentMotionRef = playerLiveLmRef.current;
      if (currentMotionRef !== lastProcessedMotionRef) {
        lastProcessedMotionRef = currentMotionRef;
        const nextMotionFrame = buildLiveMovementMotionFrame({
          calibration,
          isPlaying,
          motionRef: currentMotionRef,
          previousMotionFrame: motionFrameRef.current,
          requirements,
          retargetSourceModel,
        });
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
    };
  }, [calibration, isPlaying, playerLiveLmRef, requirements, retargetSourceModel]);

  return motionFrameRef;
}
