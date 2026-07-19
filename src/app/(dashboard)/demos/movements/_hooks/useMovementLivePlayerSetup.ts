"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MovementRecordedPlayerSetup } from "../_lib/movementRecordedPlayerSetup";
import {
  MOVEMENT_PLAYER_INPUT_CONTRACT,
  buildMovementPlayerSetupFromPrefix,
} from "../_lib/movementPlayerInputContract";
import { MOVEMENT_START_MIN_CALIBRATION_QUALITY } from "../_lib/movementSourceFrame";
import type { VrmMotionPayload, VrmMotionRef } from "../_lib/vrmRigging";

/**
 * Builds the Game player's neutral setup from the same prefix selector used by
 * Replay. Normal play uses this passive setup behind the single Start action;
 * manual calibration remains a debug-only repair control.
 */
export function useMovementLivePlayerSetup({
  isVisionReady,
  playerLiveLmRef,
  setupPrefixFramesRef,
}: {
  isVisionReady: boolean;
  playerLiveLmRef: RefObject<VrmMotionRef>;
  setupPrefixFramesRef?: RefObject<VrmMotionPayload[]>;
}) {
  const [setup, setSetup] = useState<MovementRecordedPlayerSetup | null>(null);
  const framesRef = useRef<VrmMotionPayload[]>([]);

  useEffect(() => {
    let active = true;
    let animationFrameId = 0;
    let completed = false;
    let lastMotionRef: VrmMotionRef = null;

    framesRef.current = [];
    if (setupPrefixFramesRef) setupPrefixFramesRef.current = [];

    const collect = () => {
      if (!active) return;

      const motionRef = playerLiveLmRef.current;
      if (
        isVisionReady &&
        !completed &&
        motionRef &&
        motionRef !== lastMotionRef
      ) {
        lastMotionRef = motionRef;
        const payload: VrmMotionPayload = Array.isArray(motionRef)
          ? { landmarks: motionRef }
          : motionRef;

        if ((payload.landmarks ?? payload.pose ?? []).length >= 33) {
          framesRef.current.push(payload);
          if (
            framesRef.current.length >=
            MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount
          ) {
            const prefixFrameCount = MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount;
            const candidateFrames = framesRef.current.slice(-prefixFrameCount);
            const candidateSetup = buildMovementPlayerSetupFromPrefix(candidateFrames);
            if (
              candidateSetup?.calibration &&
              candidateSetup.retargetSourceModel &&
              candidateSetup.calibration.quality >= MOVEMENT_START_MIN_CALIBRATION_QUALITY
            ) {
              completed = true;
              if (setupPrefixFramesRef) {
                setupPrefixFramesRef.current = candidateFrames;
              }
              setSetup(candidateSetup);
            } else {
              framesRef.current = candidateFrames.slice(-(prefixFrameCount - 1));
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(collect);
    };

    collect();
    return () => {
      active = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, [isVisionReady, playerLiveLmRef, setupPrefixFramesRef]);

  return setup;
}
