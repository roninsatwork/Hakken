"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import type { MovementRecordedPlayerSetup } from "../_lib/movementRecordedPlayerSetup";
import {
  MOVEMENT_PLAYER_INPUT_CONTRACT,
  buildMovementPlayerSetupFromPrefix,
} from "../_lib/movementPlayerInputContract";
import type { VrmMotionPayload, VrmMotionRef } from "../_lib/vrmRigging";

/**
 * Builds the Game player's neutral setup from the same prefix selector used by
 * Replay. This is intentionally passive: it gives Guided Preview the same
 * calibration and retarget baseline as Replay without changing the explicit
 * posture check-in flow.
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
            completed = true;
            if (setupPrefixFramesRef) {
              setupPrefixFramesRef.current = framesRef.current.slice(
                0,
                MOVEMENT_PLAYER_INPUT_CONTRACT.setup.prefixFrameCount,
              );
            }
            setSetup(buildMovementPlayerSetupFromPrefix(framesRef.current));
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
