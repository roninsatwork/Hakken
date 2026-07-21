"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MovementRecordedPlayerSetup } from "../_lib/movementRecordedPlayerSetup";
import {
  MOVEMENT_PLAYER_INPUT_CONTRACT,
  buildMovementPlayerSetupWindow,
  isMovementPlayerSetupAcceptable,
} from "../_lib/movementPlayerInputContract";
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
    // Absolute index of the current candidate window's first frame. Sharing
    // this with the setup provenance keeps the live Game byte-identical to
    // Replay's sliding scan over the same recording.
    let windowStartIndex = 0;

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
          const prefixFrameCount = MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount;
          if (framesRef.current.length >= prefixFrameCount) {
            const candidateFrames = framesRef.current.slice(-prefixFrameCount);
            const candidateSetup = buildMovementPlayerSetupWindow(
              candidateFrames,
              windowStartIndex,
            );
            if (isMovementPlayerSetupAcceptable(candidateSetup)) {
              completed = true;
              if (setupPrefixFramesRef) {
                setupPrefixFramesRef.current = candidateFrames;
              }
              setSetup(candidateSetup);
            } else {
              framesRef.current = candidateFrames.slice(-(prefixFrameCount - 1));
              windowStartIndex += 1;
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
