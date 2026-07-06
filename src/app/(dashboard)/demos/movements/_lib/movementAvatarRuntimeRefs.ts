import { useEffect, useMemo, useRef } from "react";
import type * as THREE from "three";
import type { MovementAvatarLowerBodyVisualState, MovementAvatarPlayerLegRaiseHoldState } from "./movementAvatarPipeline";
import type { MovementAvatarRetargetRestMap } from "./movementAvatarRestPose";
import type { MovementAvatarExerciseTransitionState } from "./movementAvatarExerciseTarget";
import { createMovementAvatarExerciseTransitionState } from "./movementAvatarExerciseTarget";
import type { MovementAvatarFootLockState } from "./movementAvatarFootLock";
import { createMovementAvatarFootLockState } from "./movementAvatarFootLock";
import type { MovementAvatarSetupState } from "./movementAvatarSetup";
import { createMovementAvatarSetupState } from "./movementAvatarSetup";
import type { MovementRetargetSourceModel } from "./movementRetargeting";
import type { MovementRootMotionFrame, MovementRootMotionInputFrame } from "./movementRootMotion";
import {
  type MovementAvatarRuntimeRef,
  type MovementAvatarRuntimeResetRefs,
} from "./movementAvatarRuntimeReset";
import {
  createMovementAvatarLowerBodyVisualState,
  createMovementAvatarPlayerLegRaiseHoldState,
} from "./movementAvatarRuntimeState";

export type MovementAvatarRuntimeRefs = MovementAvatarRuntimeResetRefs & {
  resetRefs: MovementAvatarRuntimeResetRefs;
  rootMotionFrameRef: MovementAvatarRuntimeRef<MovementRootMotionFrame | null>;
};

export function useMovementAvatarRuntimeRefs(
  initialRootMotionFrame: MovementRootMotionFrame | null,
): MovementAvatarRuntimeRefs {
  const baseHipsPositionRef = useRef<THREE.Vector3 | null>(null);
  const baseBonePositionRef = useRef<Record<string, THREE.Vector3>>({});
  const setupStateRef = useRef<MovementAvatarSetupState>(createMovementAvatarSetupState());
  const retargetAvatarRestRef = useRef<MovementAvatarRetargetRestMap>({});
  const retargetSourceModelRef = useRef<MovementRetargetSourceModel | null>(null);
  const rootMotionFrameRef = useRef<MovementRootMotionFrame | null>(initialRootMotionFrame);
  const liveRootMotionHistoryRef = useRef<MovementRootMotionInputFrame[]>([]);
  const exerciseTransitionStateRef = useRef<MovementAvatarExerciseTransitionState>(
    createMovementAvatarExerciseTransitionState(),
  );
  const playerLegRaiseHoldRef = useRef<MovementAvatarPlayerLegRaiseHoldState>(
    createMovementAvatarPlayerLegRaiseHoldState(),
  );
  const plantedFootLockRef = useRef<MovementAvatarFootLockState>(
    createMovementAvatarFootLockState(),
  );
  const playerLowerBodyStabilityRef = useRef<MovementAvatarLowerBodyVisualState>(
    createMovementAvatarLowerBodyVisualState(),
  );
  const instructorLowerBodyStabilityRef = useRef<MovementAvatarLowerBodyVisualState>(
    createMovementAvatarLowerBodyVisualState(),
  );
  const lastGoodQuatRef = useRef<Record<string, THREE.Quaternion>>({});

  return useMemo(() => {
    const resetRefs: MovementAvatarRuntimeResetRefs = {
      baseBonePositionRef,
      baseHipsPositionRef,
      exerciseTransitionStateRef,
      instructorLowerBodyStabilityRef,
      lastGoodQuatRef,
      liveRootMotionHistoryRef,
      plantedFootLockRef,
      playerLegRaiseHoldRef,
      playerLowerBodyStabilityRef,
      retargetAvatarRestRef,
      retargetSourceModelRef,
      setupStateRef,
    };

    return {
      ...resetRefs,
      resetRefs,
      rootMotionFrameRef,
    };
  }, []);
}

export function useSyncMovementAvatarRuntimeInputs({
  refs,
  retargetSourceModel,
  rootMotionFrame,
  shouldClearRetargetSourceModel,
}: {
  refs: MovementAvatarRuntimeRefs;
  retargetSourceModel: MovementRetargetSourceModel | null;
  rootMotionFrame: MovementRootMotionFrame | null;
  shouldClearRetargetSourceModel: boolean;
}) {
  const {
    retargetSourceModelRef,
    rootMotionFrameRef,
  } = refs;

  useEffect(() => {
    retargetSourceModelRef.current = retargetSourceModel;
  }, [retargetSourceModel, retargetSourceModelRef]);

  useEffect(() => {
    rootMotionFrameRef.current = rootMotionFrame;
  }, [rootMotionFrame, rootMotionFrameRef]);

  useEffect(() => {
    if (shouldClearRetargetSourceModel) {
      retargetSourceModelRef.current = null;
    }
  }, [retargetSourceModelRef, shouldClearRetargetSourceModel]);
}
