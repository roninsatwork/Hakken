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

    const updateMotionFrame = () => {
      if (!active) return;
      motionFrameRef.current = buildLiveMovementMotionFrame({
        calibration,
        isPlaying,
        motionRef: playerLiveLmRef.current,
        previousMotionFrame: motionFrameRef.current,
        requirements,
        retargetSourceModel,
      });
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
